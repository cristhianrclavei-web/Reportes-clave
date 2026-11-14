-- Paradas del rastreo y gastos con ticket.
--
-- 1) El rastreo detecta las PARADAS: ratos de 5 minutos o más en que el
--    teléfono de la empresa se queda en un mismo lugar (120 m) que no es un
--    cliente conocido ni un lugar de la empresa, a media ruta (hubo
--    movimiento antes y después). Ejemplos: gasolinera, proveedor, comida.
--    No cuentan si a esa hora ya había algo registrado: un servicio sin
--    ubicación en curso, una actividad de bitácora o el horario de un reporte.
-- 2) El técnico justifica cada parada con un toque: combustible, compra de
--    material, comida, tráfico o espera, con un cliente u otro.
-- 3) Combustible y compra de material son GASTOS: piden el monto y la foto
--    del ticket, o explicar por qué no hubo ticket. Quedan en
--    `gastos_campo`, que también recibe el ticket de una visita justificada
--    como «Recolección o compra de material».
-- 4) Supervisión autoriza o rechaza (comida y tráfico/espera no necesitan
--    autorización). Lo autorizado pasa a la bitácora del técnico.
--
-- Requiere patch_visitas_exigibles.sql, patch_traslados_gps.sql y
-- patch_compra_desde_visita.sql. Se puede correr más de una vez.

-- ---------- 1) Ajustes ----------
alter table public.ajustes_operacion add column if not exists parada_min integer not null default 5;
alter table public.ajustes_operacion add column if not exists paradas_desde date;
comment on column public.ajustes_operacion.parada_min is 'Minutos detenido en un lugar sin cliente para pedir justificación de la parada.';
comment on column public.ajustes_operacion.paradas_desde is 'Primer día en que las paradas del rastreo piden justificación.';
-- No es retroactivo: cuenta desde el día en que se corre el parche.
update public.ajustes_operacion set paradas_desde = (now() at time zone 'America/Mexico_City')::date where paradas_desde is null;

-- ---------- 2) Paradas ----------
create table if not exists public.paradas_detectadas (
  id uuid primary key default gen_random_uuid(),
  tecnico_id uuid not null references public.profiles(id) on delete cascade,
  fecha date not null,
  inicio timestamptz not null,
  fin timestamptz not null,
  minutos integer not null,
  lat double precision not null,
  lng double precision not null,
  -- El rato más largo, en minutos, sin puntos del teléfono durante la parada.
  sin_senal integer not null default 0,
  calculado_en timestamptz not null default now(),
  motivo text check (motivo in ('combustible', 'compra_material', 'comida', 'espera', 'cliente', 'otro')),
  detalle text,
  -- null = sin justificar.
  estado text check (estado in ('pendiente', 'aprobada', 'rechazada')),
  justificado_por uuid references public.profiles(id),
  justificado_en timestamptz,
  revisado_por uuid references public.profiles(id),
  revisado_en timestamptz,
  actividad_id uuid references public.actividades(id) on delete set null,
  unique (tecnico_id, inicio)
);

create index if not exists paradas_detectadas_fecha on public.paradas_detectadas (fecha, tecnico_id);

alter table public.paradas_detectadas enable row level security;
drop policy if exists paradas_detectadas_leer on public.paradas_detectadas;
create policy paradas_detectadas_leer on public.paradas_detectadas
  for select to authenticated
  using (tecnico_id = auth.uid() or public.get_my_role() = 'supervisor');

-- ---------- 3) Gastos con ticket ----------
-- Un gasto por parada o por visita. Las fotos viven en el bucket «tickets»,
-- en la carpeta del técnico: <tecnico_id>/<archivo>.
create table if not exists public.gastos_campo (
  id uuid primary key default gen_random_uuid(),
  tecnico_id uuid not null references public.profiles(id) on delete cascade,
  fecha date not null,
  tipo text not null check (tipo in ('combustible', 'material')),
  monto numeric(12, 2) not null check (monto > 0),
  fotos text[] not null default '{}',
  sin_ticket boolean not null default false,
  motivo_sin_ticket text,
  parada_id uuid unique references public.paradas_detectadas(id) on delete cascade,
  visita_id uuid unique references public.visitas_detectadas(id) on delete cascade,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (parada_id is not null or visita_id is not null)
);

create index if not exists gastos_campo_fecha on public.gastos_campo (fecha, tecnico_id);

alter table public.gastos_campo enable row level security;
drop policy if exists gastos_campo_leer on public.gastos_campo;
create policy gastos_campo_leer on public.gastos_campo
  for select to authenticated
  using (tecnico_id = auth.uid() or public.get_my_role() = 'supervisor');

-- Fotos de los tickets: privadas. Cada quien sube a su carpeta; las ve él y supervisión.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tickets', 'tickets', false, 5 * 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists tickets_subir on storage.objects;
create policy tickets_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'tickets' and (storage.foldername(name))[1] = auth.uid()::text and public.mi_cuenta_activa());
drop policy if exists tickets_ver on storage.objects;
create policy tickets_ver on storage.objects for select to authenticated
  using (bucket_id = 'tickets' and ((storage.foldername(name))[1] = auth.uid()::text or public.get_my_role() = 'supervisor'));

-- Revisa y guarda el gasto de una justificación. p_gasto:
-- {"monto": 450.5, "fotos": ["<tecnico>/a.jpg"], "sin_ticket": false, "motivo_sin_ticket": null}
-- Si p_tipo es null, se borra el gasto (la justificación ya no es un gasto).
create or replace function public.guardar_gasto_campo(
  p_tecnico uuid, p_fecha date, p_tipo text, p_gasto jsonb, p_parada uuid, p_visita uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_monto numeric;
  v_fotos text[];
  v_sin_ticket boolean;
  v_motivo text;
  v_foto text;
begin
  if p_tipo is null then
    delete from public.gastos_campo
     where (p_parada is not null and parada_id = p_parada) or (p_visita is not null and visita_id = p_visita);
    return;
  end if;

  if p_gasto is null or jsonb_typeof(p_gasto) <> 'object' then
    raise exception 'Falta el gasto: el monto y la foto del ticket.';
  end if;
  begin
    v_monto := round((p_gasto ->> 'monto')::numeric, 2);
  exception when others then
    raise exception 'El monto no es un número.';
  end;
  if v_monto is null or v_monto <= 0 then
    raise exception 'Escribe cuánto se gastó.';
  end if;
  if v_monto > 200000 then
    raise exception 'El monto es demasiado alto. Revísalo.';
  end if;

  select coalesce(array_agg(f), '{}') into v_fotos
    from jsonb_array_elements_text(case when jsonb_typeof(p_gasto -> 'fotos') = 'array' then p_gasto -> 'fotos' else '[]'::jsonb end) f;
  if array_length(v_fotos, 1) > 6 then
    raise exception 'Máximo 6 fotos de ticket.';
  end if;
  foreach v_foto in array v_fotos loop
    -- Solo fotos de la carpeta del técnico: nadie liga archivos ajenos.
    if split_part(v_foto, '/', 1) <> p_tecnico::text then
      raise exception 'Una de las fotos no es de este técnico.';
    end if;
  end loop;

  v_sin_ticket := coalesce((p_gasto ->> 'sin_ticket')::boolean, false);
  v_motivo := nullif(trim(coalesce(p_gasto ->> 'motivo_sin_ticket', '')), '');
  if v_sin_ticket then
    if char_length(coalesce(v_motivo, '')) < 5 then
      raise exception 'Explica por qué no hay ticket.';
    end if;
    if char_length(v_motivo) > 500 then
      raise exception 'La explicación es muy larga (máximo 500 letras).';
    end if;
  elsif coalesce(array_length(v_fotos, 1), 0) = 0 then
    raise exception 'Agrega la foto del ticket, o marca «No me dieron ticket» y explica por qué.';
  end if;

  -- Si ya había gasto (se vuelve a justificar), se reemplaza.
  update public.gastos_campo
     set tipo = p_tipo, monto = v_monto, fotos = v_fotos, sin_ticket = v_sin_ticket,
         motivo_sin_ticket = case when v_sin_ticket then v_motivo end, actualizado_en = now()
   where (p_parada is not null and parada_id = p_parada) or (p_visita is not null and visita_id = p_visita);
  if not found then
    insert into public.gastos_campo (tecnico_id, fecha, tipo, monto, fotos, sin_ticket, motivo_sin_ticket, parada_id, visita_id)
    values (p_tecnico, p_fecha, p_tipo, v_monto, v_fotos, v_sin_ticket, case when v_sin_ticket then v_motivo end, p_parada, p_visita);
  end if;
end;
$$;

-- ---------- 4) Detectar paradas ----------
-- Recorre los puntos en orden: un grupo sigue mientras el teléfono no se
-- aleja 120 m del primer punto del grupo (misma regla que el buscador de
-- visitas, lib/visitas.ts). Un grupo es parada si dura el mínimo y no es el
-- principio ni el final del día (tiene que haber movimiento antes y después).
create or replace function public.detectar_paradas(p_desde date, p_hasta date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minimo integer;
  v_inicio date;
  v_desde date;
  v_ahora timestamptz := clock_timestamp();
  r record;
  g_tecnico uuid;
  g_fecha date;
  g_lat double precision;
  g_lng double precision;
  g_ini timestamptz;
  g_fin timestamptz;
  g_suma_lat double precision;
  g_suma_lng double precision;
  g_n integer;
  g_hueco double precision;
  g_primero boolean;
  v_total integer;
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 31 then
    raise exception 'Rango de fechas no válido (máximo 31 días).';
  end if;
  select a.parada_min, a.paradas_desde into v_minimo, v_inicio from public.ajustes_operacion a limit 1;
  v_minimo := coalesce(v_minimo, 5);
  v_desde := greatest(p_desde, coalesce(v_inicio, p_desde));
  if v_desde > p_hasta then
    return 0;
  end if;

  create temporary table if not exists paradas_candidatas (
    tecnico_id uuid, fecha date, inicio timestamptz, fin timestamptz, lat double precision, lng double precision, sin_senal integer
  ) on commit drop;
  delete from paradas_candidatas;

  for r in
    select u.tecnico_id, u.registrado_en, u.lat, u.lng, (u.registrado_en at time zone 'America/Mexico_City')::date as fecha
    from public.ubicaciones_tecnicos u
    join public.profiles p on p.id = u.tecnico_id and p.role = 'tecnico'
    where u.registrado_en >= (v_desde::timestamp at time zone 'America/Mexico_City')
      and u.registrado_en < ((p_hasta + 1)::timestamp at time zone 'America/Mexico_City')
    order by u.tecnico_id, u.registrado_en
  loop
    if g_tecnico is not null and r.tecnico_id = g_tecnico and r.fecha = g_fecha
       and 111320 * sqrt(power(r.lat - g_lat, 2) + power((r.lng - g_lng) * cos(radians(g_lat)), 2)) <= 120 then
      -- Sigue en el mismo lugar.
      g_hueco := greatest(g_hueco, extract(epoch from r.registrado_en - g_fin));
      g_fin := r.registrado_en;
      g_suma_lat := g_suma_lat + r.lat;
      g_suma_lng := g_suma_lng + r.lng;
      g_n := g_n + 1;
      continue;
    end if;

    -- Se cierra el grupo anterior. Solo es parada si el teléfono se movió
    -- después (mismo técnico y día) y no fue lo primero del día.
    if g_tecnico is not null and r.tecnico_id = g_tecnico and r.fecha = g_fecha and not g_primero
       and g_fin - g_ini >= make_interval(mins => v_minimo) then
      insert into paradas_candidatas values (g_tecnico, g_fecha, g_ini, g_fin, g_suma_lat / g_n, g_suma_lng / g_n, round(g_hueco / 60));
    end if;

    g_primero := g_tecnico is null or r.tecnico_id <> g_tecnico or r.fecha <> g_fecha;
    g_tecnico := r.tecnico_id;
    g_fecha := r.fecha;
    g_lat := r.lat;
    g_lng := r.lng;
    g_ini := r.registrado_en;
    g_fin := r.registrado_en;
    g_suma_lat := r.lat;
    g_suma_lng := r.lng;
    g_n := 1;
    g_hueco := 0;
  end loop;

  -- Fuera lo que ya tiene explicación.
  delete from paradas_candidatas c
   where exists (
           -- Con un cliente conocido (eso es una visita) o en un lugar de la empresa.
           select 1 from public.lugares_de_clientes() l
            where 111320 * sqrt(power(c.lat - l.lat, 2) + power((c.lng - l.lng) * cos(radians(l.lat)), 2)) <= l.radio
         )
      or exists (
           select 1 from public.lugares_propios lp
            where 111320 * sqrt(power(c.lat - lp.lat, 2) + power((c.lng - lp.lng) * cos(radians(lp.lat)), 2)) <= lp.radio_m
         )
      -- Una actividad de bitácora a esa hora (p. ej. registró la compra en vivo).
      or exists (
           select 1 from public.actividades a
            where a.created_by = c.tecnico_id
              and tstzrange(a.hora_inicio, coalesce(a.hora_fin, v_ahora)) && tstzrange(c.inicio, c.fin)
         )
      -- Un servicio suyo en curso sin ubicación (no se sabe dónde era).
      or exists (
           select 1 from public.servicios_programados sp
             join public.servicio_tecnicos st on st.servicio_id = sp.id and st.tecnico_id = c.tecnico_id
            where sp.fecha = c.fecha
              and jsonb_typeof(sp.ubicacion_programada -> 'lat') is distinct from 'number'
              and coalesce(sp.hora_llegada, sp.hora_inicio) is not null
              and tstzrange(coalesce(sp.hora_llegada, sp.hora_inicio), coalesce(sp.hora_fin, v_ahora)) && tstzrange(c.inicio, c.fin)
         )
      -- El horario de un reporte de ese día en el que aparece.
      or exists (
           select 1 from public.reports rp
             join public.profiles pf on pf.id = c.tecnico_id
            where rp.fecha = c.fecha
              and (rp.created_by = c.tecnico_id or (jsonb_typeof(rp.data -> 'personal') = 'array' and rp.data -> 'personal' ? pf.full_name))
              and (rp.data ->> 'horaLlegada') ~ '^\d{1,2}:\d{2}$'
              and (rp.data ->> 'horaSalida') ~ '^\d{1,2}:\d{2}$'
              and (rp.data ->> 'horaSalida') > (rp.data ->> 'horaLlegada')
              and tstzrange(
                    (rp.fecha + (rp.data ->> 'horaLlegada')::time) at time zone 'America/Mexico_City',
                    (rp.fecha + (rp.data ->> 'horaSalida')::time) at time zone 'America/Mexico_City'
                  ) && tstzrange(c.inicio, c.fin)
         );

  insert into public.paradas_detectadas (tecnico_id, fecha, inicio, fin, minutos, lat, lng, sin_senal, calculado_en)
  select c.tecnico_id, c.fecha, c.inicio, c.fin, round(extract(epoch from c.fin - c.inicio) / 60)::integer, c.lat, c.lng, c.sin_senal, v_ahora
  from paradas_candidatas c
  on conflict (tecnico_id, inicio) do update
    set fin = excluded.fin, minutos = excluded.minutos, lat = excluded.lat, lng = excluded.lng,
        sin_senal = excluded.sin_senal, calculado_en = excluded.calculado_en;

  -- Las que ya no salen (y nadie justificó) se quitan, mientras haya rastreo de ese día.
  delete from public.paradas_detectadas d
   where d.fecha between v_desde and p_hasta
     and d.calculado_en < v_ahora
     and d.estado is null
     and exists (
       select 1 from public.ubicaciones_tecnicos u
        where u.tecnico_id = d.tecnico_id
          and u.registrado_en >= (d.fecha::timestamp at time zone 'America/Mexico_City')
          and u.registrado_en < ((d.fecha + 1)::timestamp at time zone 'America/Mexico_City')
     );

  select count(*) into v_total from public.paradas_detectadas d where d.fecha between v_desde and p_hasta;
  return v_total;
end;
$$;

-- ---------- 5) Bitácora ----------
-- Parada autorizada → actividad en la bitácora del técnico. Combustible es
-- parte del traslado; compra de material, compra; con un cliente, apoyo a
-- cliente; otro, otro. Comida y tráfico/espera no se registran como actividad.
create or replace function public.sincronizar_actividad_de_parada(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.paradas_detectadas;
  v_tipo text;
  v_titulo text;
  v_actividad uuid;
begin
  select * into v from public.paradas_detectadas where id = p_id;
  if not found then
    return;
  end if;
  v_tipo := case v.motivo
    when 'combustible' then 'traslado'
    when 'compra_material' then 'compra'
    when 'cliente' then 'apoyo_cliente'
    when 'otro' then 'otro'
  end;
  v_titulo := case v.motivo
    when 'combustible' then 'Carga de combustible'
    when 'compra_material' then 'Compra de material'
    when 'cliente' then 'Trabajo con cliente'
    else 'Parada'
  end;

  -- Si ya hay una y no corresponde (o cambió el motivo), se quita.
  if v.actividad_id is not null then
    if v.estado = 'aprobada' and v_tipo is not null
       and exists (select 1 from public.actividades a where a.id = v.actividad_id and a.tipo = v_tipo) then
      return;
    end if;
    delete from public.actividades where id = v.actividad_id;
    update public.paradas_detectadas set actividad_id = null where id = p_id;
  end if;
  if v.estado is distinct from 'aprobada' or v_tipo is null then
    return;
  end if;
  -- Lo que el técnico ya registró a esa hora manda.
  if exists (
    select 1 from public.actividades a
     where a.created_by = v.tecnico_id
       and tstzrange(a.hora_inicio, coalesce(a.hora_fin, now())) && tstzrange(v.inicio, v.fin)
  ) then
    return;
  end if;

  insert into public.actividades (created_by, proyecto, titulo, estado, hora_inicio, hora_fin, tipo, origen, registrado_por)
  values (v.tecnico_id, '', v_titulo, 'concluida', v.inicio, v.fin, v_tipo, 'manual', coalesce(v.revisado_por, v.justificado_por, auth.uid()))
  returning id into v_actividad;
  insert into public.actividad_eventos (actividad_id, tipo, nota, created_at)
  values (v_actividad, 'cierre', 'Parada justificada' || coalesce(': ' || nullif(trim(v.detalle), ''), ''), v.fin);
  update public.paradas_detectadas set actividad_id = v_actividad where id = p_id;
end;
$$;

create or replace function public.texto_parada(p public.paradas_detectadas)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'Parada del ' || to_char(p.fecha, 'DD/MM/YYYY') || ' de '
    || to_char(p.inicio at time zone 'America/Mexico_City', 'HH24:MI') || ' a '
    || to_char(p.fin at time zone 'America/Mexico_City', 'HH24:MI') || ' — '
    || case p.motivo
         when 'combustible' then 'Carga de combustible'
         when 'compra_material' then 'Compra de material'
         when 'comida' then 'Comida'
         when 'espera' then 'Tráfico o espera'
         when 'cliente' then 'Con un cliente'
         else 'Otro'
       end
    || coalesce(': ' || nullif(trim(p.detalle), ''), '')
    || coalesce(' · $' || to_char((select g.monto from public.gastos_campo g where g.parada_id = p.id), 'FM999,999,990.00'), '');
$$;

-- ---------- 6) Justificar y revisar ----------
-- Comida y tráfico/espera quedan autorizadas de una vez; lo demás espera a
-- supervisión (si justifica un supervisor, queda autorizado).
create or replace function public.justificar_parada(p_id uuid, p_motivo text, p_detalle text default null, p_gasto jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.paradas_detectadas;
  v_supervisor boolean := public.get_my_role() = 'supervisor';
  v_detalle text := nullif(trim(coalesce(p_detalle, '')), '');
  v_estado text;
  v_tecnico text;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión activa.';
  end if;
  select * into v from public.paradas_detectadas where id = p_id;
  if not found then
    raise exception 'No se encontró la parada.';
  end if;
  if not v_supervisor and v.tecnico_id <> auth.uid() then
    raise exception 'Esta parada es de otra persona.';
  end if;
  if p_motivo is null or p_motivo not in ('combustible', 'compra_material', 'comida', 'espera', 'cliente', 'otro') then
    raise exception 'Elige qué fue la parada.';
  end if;
  if p_motivo in ('compra_material', 'cliente', 'otro') and char_length(coalesce(v_detalle, '')) < 3 then
    raise exception '%', case p_motivo
      when 'compra_material' then 'Escribe qué material compraste o recogiste.'
      when 'cliente' then 'Escribe con qué cliente estabas.'
      else 'Explica qué pasó (al menos unas palabras).'
    end;
  end if;
  if char_length(coalesce(v_detalle, '')) > 500 then
    raise exception 'La explicación es muy larga (máximo 500 letras).';
  end if;
  if v.estado = 'aprobada' and v.revisado_por is not null and not v_supervisor then
    raise exception 'Esta parada ya está autorizada.';
  end if;

  v_estado := case when v_supervisor or p_motivo in ('comida', 'espera') then 'aprobada' else 'pendiente' end;
  update public.paradas_detectadas
     set motivo = p_motivo,
         detalle = v_detalle,
         estado = v_estado,
         justificado_por = auth.uid(),
         justificado_en = now(),
         revisado_por = case when v_supervisor then auth.uid() end,
         revisado_en = case when v_supervisor then now() end
   where id = p_id
   returning * into v;

  perform public.guardar_gasto_campo(
    v.tecnico_id, v.fecha,
    case p_motivo when 'combustible' then 'combustible' when 'compra_material' then 'material' end,
    p_gasto, v.id, null
  );
  perform public.sincronizar_actividad_de_parada(v.id);

  select full_name into v_tecnico from public.profiles where id = v.tecnico_id;
  insert into public.auditoria_global (actor_id, accion, entidad, entidad_id, detalle, seccion)
  values (
    auth.uid(), 'justifico_parada', 'parada', v.id,
    case when auth.uid() <> v.tecnico_id then 'Por ' || coalesce(v_tecnico, 'técnico') || ': ' else '' end || public.texto_parada(v),
    'reportes'
  );
end;
$$;

create or replace function public.revisar_parada(p_id uuid, p_aprobar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.paradas_detectadas;
  v_tecnico text;
begin
  if auth.uid() is null or public.get_my_role() <> 'supervisor' then
    raise exception 'Solo supervisión puede autorizar o rechazar.';
  end if;
  select * into v from public.paradas_detectadas where id = p_id;
  if not found then
    raise exception 'No se encontró la parada.';
  end if;
  if v.estado is null then
    raise exception 'Esta parada todavía no tiene justificación.';
  end if;

  update public.paradas_detectadas
     set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         revisado_por = auth.uid(),
         revisado_en = now()
   where id = p_id
   returning * into v;
  perform public.sincronizar_actividad_de_parada(v.id);

  select full_name into v_tecnico from public.profiles where id = v.tecnico_id;
  insert into public.auditoria_global (actor_id, accion, entidad, entidad_id, detalle, seccion)
  values (
    auth.uid(), case when p_aprobar then 'autorizo_parada' else 'rechazo_parada' end, 'parada', v.id,
    'De ' || coalesce(v_tecnico, 'técnico') || ': ' || public.texto_parada(v),
    'reportes'
  );
end;
$$;

-- Paradas del rango con su gasto. Un técnico solo recibe las suyas.
create or replace function public.paradas_por_revisar(p_desde date, p_hasta date, p_tecnico uuid default null)
returns table (
  id uuid, tecnico_id uuid, tecnico text, fecha date, inicio timestamptz, fin timestamptz, minutos integer,
  lat double precision, lng double precision, sin_senal integer,
  motivo text, detalle text, estado text, justifico text, justificado_en timestamptz, reviso text, revisado_en timestamptz,
  monto numeric, fotos text[], sin_ticket boolean, motivo_sin_ticket text
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.tecnico_id, pt.full_name, d.fecha, d.inicio, d.fin, d.minutos, d.lat, d.lng, d.sin_senal,
         d.motivo, d.detalle, d.estado, pj.full_name, d.justificado_en, pr.full_name, d.revisado_en,
         g.monto, g.fotos, g.sin_ticket, g.motivo_sin_ticket
  from public.paradas_detectadas d
  join public.profiles pt on pt.id = d.tecnico_id
  left join public.gastos_campo g on g.parada_id = d.id
  left join public.profiles pj on pj.id = d.justificado_por
  left join public.profiles pr on pr.id = d.revisado_por
  where d.fecha between p_desde and p_hasta
    and p_hasta - p_desde <= 62
    and (p_tecnico is null or d.tecnico_id = p_tecnico)
    and (auth.uid() is null or public.get_my_role() = 'supervisor' or d.tecnico_id = auth.uid())
  order by d.fecha desc, pt.full_name, d.inicio;
$$;

-- ---------- 7) La visita justificada como compra también pide el ticket ----------
create or replace function public.texto_visita(p_visita public.visitas_detectadas)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'Visita a ' || coalesce((select nombre from public.clientes where id = p_visita.cliente_id), 'cliente')
    || ' el ' || to_char(p_visita.fecha, 'DD/MM/YYYY') || ' — '
    || case p_visita.justificacion_motivo
         when 'cliente_cercano' then 'Estaba con otro cliente cercano'
         when 'sin_trabajo' then 'No se hizo trabajo'
         when 'compra_material' then 'Recolección o compra de material'
         else 'Otro'
       end
    || coalesce(': ' || nullif(trim(p_visita.justificacion_detalle), ''), '')
    || coalesce(' · $' || to_char((select g.monto from public.gastos_campo g where g.visita_id = p_visita.id), 'FM999,999,990.00'), '');
$$;

drop function if exists public.justificar_visita(uuid, text, text);
create or replace function public.justificar_visita(p_id uuid, p_motivo text, p_detalle text default null, p_gasto jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.visitas_detectadas;
  v_supervisor boolean := public.get_my_role() = 'supervisor';
  v_detalle text := nullif(trim(coalesce(p_detalle, '')), '');
  v_tecnico text;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión activa.';
  end if;
  select * into v from public.visitas_detectadas where id = p_id;
  if not found then
    raise exception 'No se encontró la visita.';
  end if;
  if not v_supervisor and v.tecnico_id <> auth.uid() then
    raise exception 'Esta visita es de otra persona.';
  end if;
  if p_motivo is null or p_motivo not in ('cliente_cercano', 'sin_trabajo', 'compra_material', 'otro') then
    raise exception 'Elige el motivo.';
  end if;
  if char_length(coalesce(v_detalle, '')) < 3 then
    raise exception 'Explica qué pasó (al menos unas palabras).';
  end if;
  if char_length(v_detalle) > 500 then
    raise exception 'La explicación es muy larga (máximo 500 letras).';
  end if;
  if v.justificacion_estado = 'aprobada' and not v_supervisor then
    raise exception 'Esta visita ya está autorizada.';
  end if;

  update public.visitas_detectadas
     set justificacion_motivo = p_motivo,
         justificacion_detalle = v_detalle,
         justificacion_estado = case when v_supervisor then 'aprobada' else 'pendiente' end,
         justificado_por = auth.uid(),
         justificado_en = now(),
         revisado_por = case when v_supervisor then auth.uid() end,
         revisado_en = case when v_supervisor then now() end
   where id = p_id
   returning * into v;

  -- La compra pide su ticket (un supervisor que la libera puede omitirlo).
  if p_motivo = 'compra_material' and (p_gasto is not null or not v_supervisor) then
    perform public.guardar_gasto_campo(v.tecnico_id, v.fecha, 'material', p_gasto, null, v.id);
  elsif p_motivo <> 'compra_material' then
    perform public.guardar_gasto_campo(v.tecnico_id, v.fecha, null, null, null, v.id);
  end if;

  perform public.sincronizar_compra_de_visita(v.id);

  select full_name into v_tecnico from public.profiles where id = v.tecnico_id;
  insert into public.auditoria_global (actor_id, accion, entidad, entidad_id, detalle, seccion)
  values (
    auth.uid(), 'justifico_visita', 'visita', v.id,
    case when auth.uid() <> v.tecnico_id then 'Por ' || coalesce(v_tecnico, 'técnico') || ': ' else '' end || public.texto_visita(v),
    'reportes'
  );
end;
$$;

-- ---------- 8) Permisos ----------
revoke all on function public.guardar_gasto_campo(uuid, date, text, jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.sincronizar_actividad_de_parada(uuid) from public, anon, authenticated;
revoke all on function public.texto_parada(public.paradas_detectadas) from public, anon, authenticated;
revoke all on function public.detectar_paradas(date, date) from public, anon, authenticated;
grant execute on function public.detectar_paradas(date, date) to service_role;
revoke all on function public.justificar_parada(uuid, text, text, jsonb) from public, anon;
grant execute on function public.justificar_parada(uuid, text, text, jsonb) to authenticated;
revoke all on function public.revisar_parada(uuid, boolean) from public, anon;
grant execute on function public.revisar_parada(uuid, boolean) to authenticated;
revoke all on function public.paradas_por_revisar(date, date, uuid) from public, anon;
grant execute on function public.paradas_por_revisar(date, date, uuid) to authenticated, service_role;
revoke all on function public.justificar_visita(uuid, text, text, jsonb) from public, anon;
grant execute on function public.justificar_visita(uuid, text, text, jsonb) to authenticated;

-- ---------- 9) Cálculo automático cada 15 minutos (ayer y hoy) ----------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'detectar-paradas';
    perform cron.schedule('detectar-paradas', '*/15 * * * *',
      $cron$select public.detectar_paradas((now() at time zone 'America/Mexico_City')::date - 1, (now() at time zone 'America/Mexico_City')::date)$cron$);
  end if;
end $$;

select public.detectar_paradas((now() at time zone 'America/Mexico_City')::date - 1, (now() at time zone 'America/Mexico_City')::date) as paradas;

-- Verificación: tablas = 2, funciones = 7.
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('paradas_detectadas', 'gastos_campo')) as tablas,
  (select count(*) from pg_proc where proname in ('guardar_gasto_campo', 'detectar_paradas', 'sincronizar_actividad_de_parada', 'texto_parada', 'justificar_parada', 'revisar_parada', 'paradas_por_revisar')) as funciones;
