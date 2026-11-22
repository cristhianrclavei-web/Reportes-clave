-- La firma del cliente manda en el reporte; el GPS, en la bitácora (2026-11-22).
--
-- Reemplaza la regla de patch_bitacora_gps.sql para la hora del reporte:
--   · Firmado en sitio: lo que el cliente firmó no se mueve. La salida es la
--     hora de la firma (si se capturó después) y el GPS ya no la cambia.
--   · Firma a distancia o sin firma (el reporte se hace en el traslado):
--     las horas del GPS, como antes; sin GPS, lo capturado.
-- Lo que pasa con el cliente DESPUÉS de la firma:
--   · Los primeros «cierre_tras_firma_min» (30) son cierre: registro de
--     salida, guardar herramienta. Cuentan como trabajo.
--   · Lo que pase de eso se le pide justificar al técnico como una parada
--     (comida, espera, siguió trabajando…). Comer en la planta queda como comida.
-- Motivo nuevo de parada: «Desayuno o tienda»; cuenta como comida.
--
-- Requiere patch_paradas_gastos.sql y patch_bitacora_gps.sql. Se puede
-- correr más de una vez.

-- ---------- 1) Ajustes y columnas ----------
alter table public.ajustes_operacion
  add column if not exists cierre_tras_firma_min integer not null default 30 check (cierre_tras_firma_min between 0 and 120);
comment on column public.ajustes_operacion.cierre_tras_firma_min is 'Minutos después de la firma del cliente que cuentan como cierre (registro de salida, guardar herramienta).';

alter table public.paradas_detectadas drop constraint if exists paradas_detectadas_motivo_check;
alter table public.paradas_detectadas add constraint paradas_detectadas_motivo_check
  check (motivo in ('combustible', 'compra_material', 'comida', 'desayuno_tienda', 'espera', 'cliente', 'otro'));
-- Si la parada es el rato con un cliente después de firmar, de qué reporte.
alter table public.paradas_detectadas add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
alter table public.paradas_detectadas add column if not exists reporte_id uuid references public.reports(id) on delete cascade;

-- ---------- 2) Hora de la firma del cliente en sitio ----------
-- null si no firmó en sitio (sin firma o firma a distancia) o si no se sabe
-- la hora. Los reportes de antes de guardar firmaClienteEn usan la hora en
-- que se guardaron (se firma al guardar) si fue ese mismo día.
create or replace function public.firmado_en_sitio(p_data jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(p_data ->> 'firmaClienteData', '') <> '' and coalesce(p_data ->> 'firmaRemota', '') = '';
$$;

create or replace function public.hora_firma_cliente(p_data jsonb, p_creado timestamptz, p_fecha date)
returns timestamptz
language plpgsql
stable
as $$
declare
  v timestamptz;
begin
  if not public.firmado_en_sitio(p_data) then
    return null;
  end if;
  begin
    v := nullif(p_data ->> 'firmaClienteEn', '')::timestamptz;
  exception when others then
    v := null;
  end;
  if v is null and (p_creado at time zone 'America/Mexico_City')::date = p_fecha then
    v := p_creado;
  end if;
  if v is null or (v at time zone 'America/Mexico_City')::date <> p_fecha then
    return null;
  end if;
  return v;
end;
$$;

-- ---------- 3) Ajustar el horario de los reportes ----------
create or replace function public.ajustar_horario_reportes(p_desde date, p_hasta date, p_aplicar boolean default true)
returns table (report_id uuid, fuente text, llegada_antes text, salida_antes text, llegada text, salida text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_llegada text;
  v_salida text;
  v_fuente text;
  v_firma text;
  v_ajuste jsonb;
  v_cap_llegada text;
  v_cap_salida text;
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 62 then
    raise exception 'Rango de fechas no válido (máximo 62 días).';
  end if;
  -- Desde la app, solo supervisión; el cron corre sin sesión.
  if auth.uid() is not null and public.get_my_role() is distinct from 'supervisor' then
    raise exception 'Solo supervisión puede ajustar horarios de reportes.';
  end if;

  for r in
    select rep.id, rep.data,
           rep.data ->> 'horaLlegada' as hll, rep.data ->> 'horaSalida' as hsa,
           public.firmado_en_sitio(rep.data) as en_sitio,
           public.hora_firma_cliente(rep.data, rep.created_at, rep.fecha) as firma,
           vis.llegada as gps_llegada, vis.salida as gps_salida
    from public.reports rep
    left join lateral (
      select v.llegada, v.salida
      from public.visitas_detectadas v
      where v.tecnico_id = rep.created_by and v.fecha = rep.fecha and v.cliente_id = rep.cliente_id
        -- Ya se fue: si sigue ahí, la «salida» del GPS es solo el último punto.
        and v.salida < now() - interval '20 minutes'
        -- Con dos reportes del mismo cliente ese día no se sabe cuál es cuál.
        and (select count(*) from public.reports o
              where o.created_by = rep.created_by and o.fecha = rep.fecha and o.cliente_id = rep.cliente_id) = 1
      limit 1
    ) vis on true
    where rep.fecha between p_desde and p_hasta
      and coalesce(rep.data ->> 'horaLlegada', '') ~ '^\d{2}:\d{2}$'
      and coalesce(rep.data ->> 'horaSalida', '') ~ '^\d{2}:\d{2}$'
  loop
    v_ajuste := r.data -> 'horarioAjuste';
    -- Alguien lo corrigió a mano después del último ajuste: se respeta.
    if v_ajuste is not null
       and (r.hll is distinct from v_ajuste ->> 'llegada' or r.hsa is distinct from v_ajuste ->> 'salida') then
      continue;
    end if;

    v_llegada := r.hll;
    v_salida := r.hsa;
    v_fuente := null;

    if r.en_sitio then
      -- Firmado en sitio: la salida no puede ser después de la firma, y el
      -- GPS no lo toca (lo firmado no se mueve).
      if r.firma is not null then
        v_firma := to_char(r.firma at time zone 'America/Mexico_City', 'HH24:MI');
        if r.hsa > v_firma and v_firma >= r.hll then
          v_salida := v_firma;
          v_fuente := 'firma';
        end if;
      end if;
    elsif r.gps_llegada is not null then
      v_llegada := to_char(r.gps_llegada at time zone 'America/Mexico_City', 'HH24:MI');
      v_salida := to_char(r.gps_salida at time zone 'America/Mexico_City', 'HH24:MI');
      -- Sanidad: el GPS y el reporte deben hablar del mismo rato (se enciman
      -- o están a menos de 3 h); si no, no se usa el GPS.
      v_cap_llegada := coalesce(r.data -> 'horarioCapturado' ->> 'llegada', r.hll);
      v_cap_salida := coalesce(r.data -> 'horarioCapturado' ->> 'salida', r.hsa);
      if (v_llegada <= v_cap_salida and v_salida >= v_cap_llegada)
         or abs(extract(epoch from (v_salida::time - v_cap_salida::time))) <= 3 * 3600 then
        v_fuente := 'gps';
      else
        v_llegada := r.hll;
        v_salida := r.hsa;
      end if;
    end if;

    if v_fuente is null or (v_llegada = r.hll and v_salida = r.hsa) then
      continue;
    end if;

    report_id := r.id;
    fuente := v_fuente;
    llegada_antes := r.hll;
    salida_antes := r.hsa;
    llegada := v_llegada;
    salida := v_salida;
    return next;

    if p_aplicar then
      update public.reports set data = data
        || jsonb_build_object(
             'horaLlegada', v_llegada,
             'horaSalida', v_salida,
             'horarioAjuste', jsonb_build_object('fuente', v_fuente, 'llegada', v_llegada, 'salida', v_salida, 'en', now()),
             -- Lo que capturó el técnico, solo la primera vez.
             'horarioCapturado', coalesce(r.data -> 'horarioCapturado', jsonb_build_object('llegada', r.hll, 'salida', r.hsa))
           )
      where id = r.id;
    end if;
  end loop;
end;
$$;

-- ---------- 4) El rato con el cliente después de la firma ----------
-- Por cada visita del GPS con un reporte firmado en sitio: de la firma más el
-- cierre a la salida del GPS. Si dura la parada mínima (5 min) y nada lo
-- explica (una actividad de bitácora o un servicio en curso a esa hora), se
-- guarda como parada para que el técnico diga qué fue.
create or replace function public.detectar_estancias_tras_firma(p_desde date, p_hasta date, p_ahora timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cierre integer;
  v_minimo integer;
  r record;
  v_inicio timestamptz;
  v_lat double precision;
  v_lng double precision;
begin
  select a.cierre_tras_firma_min, a.parada_min into v_cierre, v_minimo from public.ajustes_operacion a limit 1;
  v_cierre := coalesce(v_cierre, 30);
  v_minimo := coalesce(v_minimo, 5);

  for r in
    -- La última firma dentro de cada visita (si hubo dos reportes, cuenta el último).
    select distinct on (v.id) v.id as visita_id, v.tecnico_id, v.fecha, v.cliente_id, v.salida, rep.id as reporte_id, f.firma
    from public.visitas_detectadas v
    join public.reports rep on rep.created_by = v.tecnico_id and rep.fecha = v.fecha and rep.cliente_id = v.cliente_id
    cross join lateral (select public.hora_firma_cliente(rep.data, rep.created_at, rep.fecha) as firma) f
    where v.fecha between p_desde and p_hasta
      -- Ya se fue del cliente.
      and v.salida < p_ahora - interval '20 minutes'
      and f.firma is not null
      and f.firma >= v.llegada and f.firma < v.salida
    order by v.id, f.firma desc
  loop
    v_inicio := r.firma + make_interval(mins => v_cierre);
    if r.salida - v_inicio < make_interval(mins => v_minimo) then
      continue;
    end if;
    -- Lo que el técnico ya registró a esa hora lo explica.
    if exists (
         select 1 from public.actividades a
          where a.created_by = r.tecnico_id
            and tstzrange(a.hora_inicio, coalesce(a.hora_fin, p_ahora)) && tstzrange(v_inicio, r.salida)
       )
       or exists (
         select 1 from public.servicios_programados sp
           join public.servicio_tecnicos st on st.servicio_id = sp.id and st.tecnico_id = r.tecnico_id
          where sp.fecha = r.fecha
            and coalesce(sp.hora_llegada, sp.hora_inicio) is not null
            and tstzrange(coalesce(sp.hora_llegada, sp.hora_inicio), coalesce(sp.hora_fin, p_ahora)) && tstzrange(v_inicio, r.salida)
       ) then
      continue;
    end if;
    select avg(u.lat), avg(u.lng) into v_lat, v_lng
      from public.ubicaciones_tecnicos u
     where u.tecnico_id = r.tecnico_id and u.registrado_en between v_inicio and r.salida;
    if v_lat is null then
      continue;
    end if;

    insert into public.paradas_detectadas (tecnico_id, fecha, inicio, fin, minutos, lat, lng, sin_senal, calculado_en, cliente_id, reporte_id)
    values (r.tecnico_id, r.fecha, v_inicio, r.salida, round(extract(epoch from r.salida - v_inicio) / 60)::integer, v_lat, v_lng, 0, p_ahora, r.cliente_id, r.reporte_id)
    on conflict (tecnico_id, inicio) do update
      set fin = excluded.fin, minutos = excluded.minutos, lat = excluded.lat, lng = excluded.lng,
          calculado_en = excluded.calculado_en, cliente_id = excluded.cliente_id, reporte_id = excluded.reporte_id;
  end loop;

  -- Las que ya no salen (y nadie justificó) se quitan.
  delete from public.paradas_detectadas d
   where d.fecha between p_desde and p_hasta
     and d.reporte_id is not null
     and d.estado is null
     and d.calculado_en < p_ahora;
end;
$$;

-- ---------- 5) Detectar paradas (igual que antes + lo de después de la firma) ----------
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
     -- Las de después de la firma las mantiene detectar_estancias_tras_firma.
     and d.reporte_id is null
     and exists (
       select 1 from public.ubicaciones_tecnicos u
        where u.tecnico_id = d.tecnico_id
          and u.registrado_en >= (d.fecha::timestamp at time zone 'America/Mexico_City')
          and u.registrado_en < ((d.fecha + 1)::timestamp at time zone 'America/Mexico_City')
     );

  -- El rato con el cliente después de la firma (más allá del cierre).
  perform public.detectar_estancias_tras_firma(v_desde, p_hasta, v_ahora);

  select count(*) into v_total from public.paradas_detectadas d where d.fecha between v_desde and p_hasta;
  return v_total;
end;
$$;
-- ---------- 6) Justificar: «Desayuno o tienda» se autoriza solo, como la comida ----------
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
  if p_motivo is null or p_motivo not in ('combustible', 'compra_material', 'comida', 'desayuno_tienda', 'espera', 'cliente', 'otro') then
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

  v_estado := case when v_supervisor or p_motivo in ('comida', 'desayuno_tienda', 'espera') then 'aprobada' else 'pendiente' end;
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
create or replace function public.texto_parada(p public.paradas_detectadas)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when p.reporte_id is not null
           then 'En ' || coalesce((select nombre from public.clientes where id = p.cliente_id), 'el cliente') || ' después de la firma, el '
           else 'Parada del '
         end
    || to_char(p.fecha, 'DD/MM/YYYY') || ' de '
    || to_char(p.inicio at time zone 'America/Mexico_City', 'HH24:MI') || ' a '
    || to_char(p.fin at time zone 'America/Mexico_City', 'HH24:MI') || ' — '
    || case p.motivo
         when 'combustible' then 'Carga de combustible'
         when 'compra_material' then 'Compra de material'
         when 'comida' then 'Comida'
         when 'desayuno_tienda' then 'Desayuno o tienda'
         when 'espera' then 'Tráfico o espera'
         when 'cliente' then 'Con un cliente'
         else 'Otro'
       end
    || coalesce(': ' || nullif(trim(p.detalle), ''), '')
    || coalesce(' · $' || to_char((select g.monto from public.gastos_campo g where g.parada_id = p.id), 'FM999,999,990.00'), '');
$$;

-- ---------- 7) La lista de paradas lleva el cliente si fue después de la firma ----------
drop function if exists public.paradas_por_revisar(date, date, uuid);
create or replace function public.paradas_por_revisar(p_desde date, p_hasta date, p_tecnico uuid default null)
returns table (
  id uuid, tecnico_id uuid, tecnico text, fecha date, inicio timestamptz, fin timestamptz, minutos integer,
  lat double precision, lng double precision, sin_senal integer,
  motivo text, detalle text, estado text, justifico text, justificado_en timestamptz, reviso text, revisado_en timestamptz,
  monto numeric, fotos text[], sin_ticket boolean, motivo_sin_ticket text,
  reporte_id uuid, cliente text
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.tecnico_id, pt.full_name, d.fecha, d.inicio, d.fin, d.minutos, d.lat, d.lng, d.sin_senal,
         d.motivo, d.detalle, d.estado, pj.full_name, d.justificado_en, pr.full_name, d.revisado_en,
         g.monto, g.fotos, g.sin_ticket, g.motivo_sin_ticket,
         d.reporte_id, c.nombre
  from public.paradas_detectadas d
  join public.profiles pt on pt.id = d.tecnico_id
  left join public.gastos_campo g on g.parada_id = d.id
  left join public.profiles pj on pj.id = d.justificado_por
  left join public.profiles pr on pr.id = d.revisado_por
  left join public.clientes c on c.id = d.cliente_id
  where d.fecha between p_desde and p_hasta
    and p_hasta - p_desde <= 62
    and (p_tecnico is null or d.tecnico_id = p_tecnico)
    and (auth.uid() is null or public.get_my_role() = 'supervisor' or d.tecnico_id = auth.uid())
  order by d.fecha desc, pt.full_name, d.inicio;
$$;

-- ---------- 8) Permisos ----------
revoke all on function public.firmado_en_sitio(jsonb) from public, anon;
revoke all on function public.hora_firma_cliente(jsonb, timestamptz, date) from public, anon;
revoke all on function public.ajustar_horario_reportes(date, date, boolean) from public, anon;
grant execute on function public.ajustar_horario_reportes(date, date, boolean) to authenticated, service_role;
revoke all on function public.detectar_estancias_tras_firma(date, date, timestamptz) from public, anon, authenticated;
revoke all on function public.detectar_paradas(date, date) from public, anon, authenticated;
grant execute on function public.detectar_paradas(date, date) to service_role;
revoke all on function public.texto_parada(public.paradas_detectadas) from public, anon, authenticated;
revoke all on function public.justificar_parada(uuid, text, text, jsonb) from public, anon;
grant execute on function public.justificar_parada(uuid, text, text, jsonb) to authenticated;
revoke all on function public.paradas_por_revisar(date, date, uuid) from public, anon;
grant execute on function public.paradas_por_revisar(date, date, uuid) to authenticated, service_role;

-- ---------- 9) Regresar lo firmado en sitio que el GPS había movido ----------
-- Solo si nadie lo corrigió a mano después; luego se vuelve a ajustar con la
-- regla nueva (la salida queda a la hora de la firma).
update public.reports
   set data = (data - 'horarioAjuste')
     || jsonb_build_object('horaLlegada', data -> 'horarioCapturado' ->> 'llegada', 'horaSalida', data -> 'horarioCapturado' ->> 'salida')
 where data -> 'horarioAjuste' ->> 'fuente' = 'gps'
   and public.firmado_en_sitio(data)
   and data -> 'horarioCapturado' is not null
   and data ->> 'horaLlegada' = data -> 'horarioAjuste' ->> 'llegada'
   and data ->> 'horaSalida' = data -> 'horarioAjuste' ->> 'salida';

select * from public.ajustar_horario_reportes((now() at time zone 'America/Mexico_City')::date - 30, (now() at time zone 'America/Mexico_City')::date);
select public.detectar_paradas((now() at time zone 'America/Mexico_City')::date - 1, (now() at time zone 'America/Mexico_City')::date) as paradas;

notify pgrst, 'reload schema';
