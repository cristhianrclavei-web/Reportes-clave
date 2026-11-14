-- ============================================================
-- Reporte por cada visita que detecta el rastreo (GPS)
-- ============================================================
-- Antes la app pedía «al menos un reporte por día». Una cuadrilla con dos o
-- más servicios el mismo día entregaba uno solo y la app no notaba que
-- faltaba el otro.
--
-- Ahora, además de la regla del día:
--   1) Si el rastreo ubica a un técnico con un cliente 20 minutos o más
--      (ajustes_operacion.visita_exigible_min), esa VISITA pide su reporte.
--      La cubre un reporte o un levantamiento de ese cliente ese día, o una
--      visita sin trabajo. Si no, el técnico la justifica (p. ej. «estaba con
--      otro cliente en el mismo edificio») y el supervisor autoriza o rechaza.
--   2) Un levantamiento también cubre el DÍA de quien lo hizo (antes solo
--      contaban los reportes).
--   3) mi_horario_gps: llegada y salida que vio el rastreo con un cliente,
--      para llenar solo el horario del reporte.
--
-- Las visitas se guardan en visitas_detectadas (el rastreo se borra a los 90
-- días; la visita y su justificación quedan). Las calcula pg_cron cada 15
-- minutos y el aviso de las 18:00 / 9:00. Solo cuentan desde el día en que se
-- corre este parche (ajustes_operacion.visitas_exigibles_desde): lo anterior
-- no se cobra porque no había forma de justificarlo cuando pasó.
--
-- Lugares de la empresa (lugares_propios) no cuentan como visita.
--
-- Requiere patch_busqueda_visitas.sql, patch_lugares_propios.sql,
-- patch_justificacion_autorizada.sql y patch_clientes_fase3.sql.
-- Ejecutar completo. Aditivo e idempotente.

-- ---------- 1) Ajustes ----------
alter table public.ajustes_operacion
  add column if not exists visita_exigible_min integer not null default 20 check (visita_exigible_min between 5 and 240),
  add column if not exists visitas_exigibles_desde date;

update public.ajustes_operacion
   set visitas_exigibles_desde = (now() at time zone 'America/Mexico_City')::date
 where visitas_exigibles_desde is null;

comment on column public.ajustes_operacion.visita_exigible_min is 'Minutos con un cliente, según el rastreo, a partir de los cuales la visita pide reporte.';
comment on column public.ajustes_operacion.visitas_exigibles_desde is 'Primer día en que las visitas detectadas por el rastreo piden reporte.';

-- ---------- 2) Visitas detectadas ----------
create table if not exists public.visitas_detectadas (
  id uuid primary key default gen_random_uuid(),
  tecnico_id uuid not null references public.profiles(id) on delete cascade,
  fecha date not null,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  llegada timestamptz not null,
  salida timestamptz not null,
  minutos integer not null,
  -- El rato más largo, en minutos, sin puntos del teléfono estando ahí.
  sin_senal integer not null default 0,
  calculado_en timestamptz not null default now(),
  -- Justificación de por qué no hay reporte (null = nadie la ha justificado).
  justificacion_motivo text check (justificacion_motivo in ('cliente_cercano', 'sin_trabajo', 'compra_material', 'otro')),
  justificacion_detalle text,
  justificacion_estado text check (justificacion_estado in ('pendiente', 'aprobada', 'rechazada')),
  justificado_por uuid references public.profiles(id),
  justificado_en timestamptz,
  revisado_por uuid references public.profiles(id),
  revisado_en timestamptz,
  unique (tecnico_id, fecha, cliente_id)
);

create index if not exists visitas_detectadas_fecha on public.visitas_detectadas (fecha, tecnico_id);

-- Cada quien ve las suyas; supervisión, todas. Nadie escribe directo: todo
-- entra por las funciones de abajo.
alter table public.visitas_detectadas enable row level security;
drop policy if exists visitas_detectadas_leer on public.visitas_detectadas;
create policy visitas_detectadas_leer on public.visitas_detectadas
  for select to authenticated
  using (tecnico_id = auth.uid() or public.get_my_role() = 'supervisor');

-- ---------- 3) Lugares donde se sabe que está un cliente ----------
-- La ubicación de su ficha y las de sus servicios agendados (misma regla que
-- el buscador de visitas, lib/visitasDatos.ts).
create or replace function public.lugares_de_clientes()
returns table (cliente_id uuid, lat double precision, lng double precision, radio double precision)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, (c.ubicacion ->> 'lat')::double precision, (c.ubicacion ->> 'lng')::double precision, c.radio_m::double precision
  from public.clientes c
  where jsonb_typeof(c.ubicacion -> 'lat') = 'number' and jsonb_typeof(c.ubicacion -> 'lng') = 'number'
  union
  -- El radio del servicio (120 m) es para marcar la llegada; aquí se usa al menos 200 m.
  select sp.cliente_id, (sp.ubicacion_programada ->> 'lat')::double precision, (sp.ubicacion_programada ->> 'lng')::double precision,
         greatest(coalesce(sp.radio_geocerca_m, 0), 200)::double precision
  from public.servicios_programados sp
  where sp.cliente_id is not null
    and jsonb_typeof(sp.ubicacion_programada -> 'lat') = 'number' and jsonb_typeof(sp.ubicacion_programada -> 'lng') = 'number';
$$;

-- ---------- 4) Tiempo de cada técnico con cada cliente, según el rastreo ----------
-- Una fila por técnico, día (hora de México) y cliente. El tiempo NO es
-- «cuántos puntos hay»: se suma el tiempo entre dos puntos seguidos que están
-- los dos con el cliente, así un rato sin señal no acorta la visita (misma
-- cuenta que visitas_gps). Los puntos dentro de un lugar de la empresa no cuentan.
create or replace function public.gps_en_clientes(p_desde date, p_hasta date, p_tecnico uuid default null)
returns table (tecnico_id uuid, fecha date, cliente_id uuid, llegada timestamptz, salida timestamptz, minutos integer, sin_senal integer)
language sql
stable
security definer
set search_path = public
as $$
  with puntos as (
    select u.tecnico_id, u.registrado_en, u.lat, u.lng,
           (u.registrado_en at time zone 'America/Mexico_City')::date as fecha,
           row_number() over w as rn,
           lead(u.registrado_en) over w as siguiente
    from public.ubicaciones_tecnicos u
    where u.registrado_en >= (p_desde::timestamp at time zone 'America/Mexico_City')
      and u.registrado_en < ((p_hasta + 1)::timestamp at time zone 'America/Mexico_City')
      and (p_tecnico is null or u.tecnico_id = p_tecnico)
      and p_hasta - p_desde <= 62
    window w as (partition by u.tecnico_id, (u.registrado_en at time zone 'America/Mexico_City')::date order by u.registrado_en)
  ),
  dentro as (
    select distinct p.tecnico_id, p.fecha, l.cliente_id, p.rn, p.registrado_en, p.siguiente
    from puntos p
    -- Distancia aproximada en metros (suficiente a esta escala).
    join public.lugares_de_clientes() l on 111320 * sqrt(power(p.lat - l.lat, 2) + power((p.lng - l.lng) * cos(radians(l.lat)), 2)) <= l.radio
    where not exists (
      select 1 from public.lugares_propios lp where 111320 * sqrt(power(p.lat - lp.lat, 2) + power((p.lng - lp.lng) * cos(radians(lp.lat)), 2)) <= lp.radio_m
    )
  ),
  seguidos as (
    select d.*, lead(d.rn) over (partition by d.tecnico_id, d.fecha, d.cliente_id order by d.rn) as rn_siguiente
    from dentro d
  )
  select s.tecnico_id, s.fecha, s.cliente_id,
         min(s.registrado_en), max(s.registrado_en),
         round(coalesce(sum(extract(epoch from s.siguiente - s.registrado_en)) filter (where s.rn_siguiente = s.rn + 1), 0) / 60)::integer,
         round(coalesce(max(extract(epoch from s.siguiente - s.registrado_en)) filter (where s.rn_siguiente = s.rn + 1), 0) / 60)::integer
  from seguidos s
  group by 1, 2, 3;
$$;

-- ---------- 5) Detectar y guardar las visitas ----------
-- Vuelve a calcular el rango: actualiza horas y minutos de las visitas que
-- siguen, y quita las que ya no salen (p. ej. se corrigió la ubicación del
-- cliente) si nadie las había justificado. Devuelve cuántas hay en el rango.
create or replace function public.detectar_visitas(p_desde date, p_hasta date, p_tecnico uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tecnico uuid := p_tecnico;
  v_minimo integer;
  v_inicio date;
  v_desde date;
  v_ahora timestamptz := clock_timestamp();
  v_total integer;
begin
  -- Un técnico solo puede recalcular lo suyo.
  if auth.uid() is not null and public.get_my_role() <> 'supervisor' then
    v_tecnico := auth.uid();
  end if;

  select a.visita_exigible_min, a.visitas_exigibles_desde into v_minimo, v_inicio
  from public.ajustes_operacion a limit 1;
  v_minimo := coalesce(v_minimo, 20);
  v_desde := greatest(p_desde, coalesce(v_inicio, p_desde));
  if v_desde > p_hasta then
    return 0;
  end if;

  insert into public.visitas_detectadas (tecnico_id, fecha, cliente_id, llegada, salida, minutos, sin_senal, calculado_en)
  select g.tecnico_id, g.fecha, g.cliente_id, g.llegada, g.salida, g.minutos, g.sin_senal, v_ahora
  from public.gps_en_clientes(v_desde, p_hasta, v_tecnico) g
  join public.profiles p on p.id = g.tecnico_id and p.role = 'tecnico'
  where g.minutos >= v_minimo
  on conflict (tecnico_id, fecha, cliente_id) do update
    set llegada = excluded.llegada, salida = excluded.salida, minutos = excluded.minutos,
        sin_senal = excluded.sin_senal, calculado_en = excluded.calculado_en;

  delete from public.visitas_detectadas v
   where v.fecha between v_desde and p_hasta
     and (v_tecnico is null or v.tecnico_id = v_tecnico)
     and v.calculado_en < v_ahora
     and v.justificacion_estado is null
     -- Si los puntos de ese día ya se borraron (90 días), la visita se conserva.
     and exists (
       select 1 from public.ubicaciones_tecnicos u
       where u.tecnico_id = v.tecnico_id
         and u.registrado_en >= (v.fecha::timestamp at time zone 'America/Mexico_City')
         and u.registrado_en < ((v.fecha + 1)::timestamp at time zone 'America/Mexico_City')
     );

  select count(*) into v_total from public.visitas_detectadas v
   where v.fecha between v_desde and p_hasta and (v_tecnico is null or v.tecnico_id = v_tecnico);
  return v_total;
end;
$$;

-- Ayer y hoy (hora de México): lo que corre pg_cron y el aviso de reportes.
create or replace function public.detectar_visitas_recientes()
returns integer
language sql
security definer
set search_path = public
as $$
  select public.detectar_visitas(
    (now() at time zone 'America/Mexico_City')::date - 1,
    (now() at time zone 'America/Mexico_City')::date
  );
$$;

-- ---------- 6) ¿Qué cubre una visita? ----------
-- 'reporte' | 'levantamiento' | 'visita_sin_trabajo' | null. Cuenta el reporte
-- o levantamiento de ese cliente ese día, lo haya hecho quien lo haya hecho
-- (la cuadrilla entrega uno). Sin cliente ligado se compara por nombre.
create or replace function public.visita_cubierta_por(p_cliente uuid, p_fecha date)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with c as (select public.normalizar_nombre(nombre) as nombre from public.clientes where id = p_cliente)
  select case
    when exists (
      select 1 from public.reports r
      where r.fecha = p_fecha
        and (r.cliente_id = p_cliente
             or (r.cliente_id is null and public.normalizar_nombre(r.empresa_cliente) = (select nombre from c)))
    ) then 'reporte'
    when exists (
      select 1 from public.levantamientos l
      where l.fecha = p_fecha
        and (l.cliente_id = p_cliente
             or (l.cliente_id is null and public.normalizar_nombre(l.empresa) = (select nombre from c)))
    ) then 'levantamiento'
    when exists (
      select 1 from public.servicios_programados sp
      where sp.fecha = p_fecha and sp.cliente_id = p_cliente
        and sp.estado <> 'cancelado'
        and sp.visita_estado in ('pendiente', 'liberado')
    ) then 'visita_sin_trabajo'
  end;
$$;

-- ---------- 7) Visitas con su estado (técnico: las suyas; supervisión: todas) ----------
-- estado: 'cubierta' | 'justificada' | 'por_autorizar' | 'sin_reporte'.
-- cerca_con_registro: clientes vecinos (sus lugares se enciman con los de
-- este) que sí tienen reporte o levantamiento ese día; es la pista para
-- «estaba con el cliente de junto».
drop function if exists public.visitas_por_revisar(date, date, uuid);
create function public.visitas_por_revisar(p_desde date, p_hasta date, p_tecnico uuid default null)
returns table (
  id uuid, tecnico_id uuid, tecnico text, fecha date, cliente_id uuid, cliente text,
  llegada timestamptz, salida timestamptz, minutos integer, sin_senal integer,
  estado text, cubre text,
  motivo text, detalle text, justificacion_estado text, justifico text, justificado_en timestamptz,
  reviso text, revisado_en timestamptz,
  cerca_con_registro text
)
language sql
stable
security definer
set search_path = public
as $$
  with visitas as (
    select v.*, public.visita_cubierta_por(v.cliente_id, v.fecha) as cubre
    from public.visitas_detectadas v
    where v.fecha between p_desde and p_hasta
      and p_hasta - p_desde <= 62
      and (p_tecnico is null or v.tecnico_id = p_tecnico)
      and (
        auth.uid() is null
        or public.get_my_role() = 'supervisor'
        or v.tecnico_id = auth.uid()
      )
  )
  select v.id, v.tecnico_id, pt.full_name, v.fecha, v.cliente_id, c.nombre,
         v.llegada, v.salida, v.minutos, v.sin_senal,
         case
           when v.cubre is not null then 'cubierta'
           when v.justificacion_estado = 'aprobada' then 'justificada'
           when v.justificacion_estado = 'pendiente' then 'por_autorizar'
           else 'sin_reporte'
         end,
         v.cubre,
         v.justificacion_motivo, v.justificacion_detalle, v.justificacion_estado, pj.full_name, v.justificado_en,
         pr.full_name, v.revisado_en,
         case when v.cubre is null then (
           select string_agg(distinct c2.nombre, ', ')
           from public.lugares_de_clientes() a
           join public.lugares_de_clientes() b on b.cliente_id <> a.cliente_id and 111320 * sqrt(power(a.lat - b.lat, 2) + power((a.lng - b.lng) * cos(radians(b.lat)), 2)) <= a.radio + b.radio
           join public.clientes c2 on c2.id = b.cliente_id
           where a.cliente_id = v.cliente_id
             and public.visita_cubierta_por(b.cliente_id, v.fecha) in ('reporte', 'levantamiento')
         ) end
  from visitas v
  join public.profiles pt on pt.id = v.tecnico_id
  join public.clientes c on c.id = v.cliente_id
  left join public.profiles pj on pj.id = v.justificado_por
  left join public.profiles pr on pr.id = v.revisado_por
  order by v.fecha desc, pt.full_name, v.llegada;
$$;

-- ---------- 8) Justificar y revisar ----------
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
         else 'Otro'
       end
    || coalesce(': ' || nullif(trim(p_visita.justificacion_detalle), ''), '');
$$;

-- El técnico justifica su visita (queda pendiente de autorizar); si la
-- justifica un supervisor, queda autorizada de una vez.
create or replace function public.justificar_visita(p_id uuid, p_motivo text, p_detalle text default null)
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
  if p_motivo is null or p_motivo not in ('cliente_cercano', 'sin_trabajo', 'otro') then
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

  select full_name into v_tecnico from public.profiles where id = v.tecnico_id;
  insert into public.auditoria_global (actor_id, accion, entidad, entidad_id, detalle, seccion)
  values (
    auth.uid(), 'justifico_visita', 'visita', v.id,
    case when auth.uid() <> v.tecnico_id then 'Por ' || coalesce(v_tecnico, 'técnico') || ': ' else '' end || public.texto_visita(v),
    'reportes'
  );
end;
$$;

-- Solo supervisión: autoriza o rechaza. Rechazada, la visita vuelve a pedir reporte.
create or replace function public.revisar_visita(p_id uuid, p_aprobar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.visitas_detectadas;
  v_tecnico text;
begin
  if auth.uid() is null or public.get_my_role() <> 'supervisor' then
    raise exception 'Solo supervisión puede autorizar o rechazar.';
  end if;
  select * into v from public.visitas_detectadas where id = p_id;
  if not found then
    raise exception 'No se encontró la visita.';
  end if;
  if v.justificacion_estado is null then
    raise exception 'Esta visita todavía no tiene justificación.';
  end if;

  update public.visitas_detectadas
     set justificacion_estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         revisado_por = auth.uid(),
         revisado_en = now()
   where id = p_id
   returning * into v;

  select full_name into v_tecnico from public.profiles where id = v.tecnico_id;
  insert into public.auditoria_global (actor_id, accion, entidad, entidad_id, detalle, seccion)
  values (
    auth.uid(), case when p_aprobar then 'autorizo_visita' else 'rechazo_visita' end, 'visita', v.id,
    'De ' || coalesce(v_tecnico, 'técnico') || ': ' || public.texto_visita(v),
    'reportes'
  );
end;
$$;

-- ---------- 9) Horario que vio el rastreo (para llenar el reporte) ----------
-- Solo de quien pregunta, con un cliente y un día. Sin mínimo de minutos.
create or replace function public.mi_horario_gps(p_cliente uuid, p_fecha date)
returns table (llegada timestamptz, salida timestamptz, minutos integer, sin_senal integer)
language sql
stable
security definer
set search_path = public
as $$
  select g.llegada, g.salida, g.minutos, g.sin_senal
  from public.gps_en_clientes(p_fecha, p_fecha, auth.uid()) g
  where auth.uid() is not null and g.cliente_id = p_cliente;
$$;

-- ---------- 10) Permisos ----------
-- Supabase da permiso de ejecutar a todos por defecto: las internas se cierran.
revoke all on function public.lugares_de_clientes() from public, anon, authenticated;
revoke all on function public.gps_en_clientes(date, date, uuid) from public, anon, authenticated;
revoke all on function public.visita_cubierta_por(uuid, date) from public, anon, authenticated;
revoke all on function public.texto_visita(public.visitas_detectadas) from public, anon, authenticated;
revoke all on function public.detectar_visitas_recientes() from public, anon, authenticated;
grant execute on function public.detectar_visitas_recientes() to service_role;

revoke all on function public.detectar_visitas(date, date, uuid) from public, anon;
grant execute on function public.detectar_visitas(date, date, uuid) to authenticated, service_role;
revoke all on function public.visitas_por_revisar(date, date, uuid) from public, anon;
grant execute on function public.visitas_por_revisar(date, date, uuid) to authenticated, service_role;
revoke all on function public.justificar_visita(uuid, text, text) from public, anon;
grant execute on function public.justificar_visita(uuid, text, text) to authenticated;
revoke all on function public.revisar_visita(uuid, boolean) from public, anon;
grant execute on function public.revisar_visita(uuid, boolean) to authenticated;
revoke all on function public.mi_horario_gps(uuid, date) from public, anon;
grant execute on function public.mi_horario_gps(uuid, date) to authenticated;

-- ---------- 11) Días sin reporte: el levantamiento también cubre el día ----------
create or replace function public.dias_sin_reporte(p_desde date, p_hasta date, p_tecnico uuid default null)
returns table (tecnico_id uuid, fecha date)
language sql
stable
security definer
set search_path = public
as $$
  with tecnicos as (
    select p.id, public.normalizar_nombre(p.full_name) as nombre_norm
    from public.profiles p
    where p.role = 'tecnico'
      and p.activo = true
      and (p_tecnico is null or p.id = p_tecnico)
      and (
        auth.uid() is null
        or public.get_my_role() = 'supervisor'
        or p.id = auth.uid()
      )
  ),
  dias as (
    select d::date as fecha
    from generate_series(p_desde, p_hasta, interval '1 day') d
    where p_hasta - p_desde <= 62
  ),
  servicio_dia as (
    -- El reporte del servicio cubre solo a quien aparece anotado en él
    -- (quien lo hizo, el ingeniero a cargo o el personal). Una visita sin
    -- trabajo (por revisar o ya liberada) cubre a todos los asignados.
    select st.tecnico_id, sp.fecha,
           bool_or(
             coalesce(sp.visita_estado in ('pendiente', 'liberado'), false)
             or exists (
               select 1 from public.reports r
               where r.id = sp.report_id
                 and (
                   r.created_by = st.tecnico_id
                   or (public.normalizar_nombre(pf.full_name) <> '' and (
                     public.normalizar_nombre(r.data->>'ingACargo') = public.normalizar_nombre(pf.full_name)
                     or (jsonb_typeof(r.data->'personal') = 'array' and exists (
                       select 1 from jsonb_array_elements_text(r.data->'personal') x
                       where public.normalizar_nombre(x) = public.normalizar_nombre(pf.full_name)
                     ))
                   ))
                 )
             )
           ) as con_reporte
    from public.servicio_tecnicos st
    join public.servicios_programados sp on sp.id = st.servicio_id
    join public.profiles pf on pf.id = st.tecnico_id
    where sp.fecha between p_desde and p_hasta
      and sp.estado <> 'cancelado'
    group by st.tecnico_id, sp.fecha
  ),
  reportes_dia as (
    select r.fecha, r.created_by,
           public.normalizar_nombre(r.data->>'ingACargo') as a_cargo,
           case when jsonb_typeof(r.data->'personal') = 'array'
                then (select array_agg(public.normalizar_nombre(x))
                      from jsonb_array_elements_text(r.data->'personal') x)
                else '{}'::text[] end as personal
    from public.reports r
    where r.fecha between p_desde and p_hasta
  )
  select t.id, d.fecha
  from tecnicos t
  cross join dias d
  left join servicio_dia s on s.tecnico_id = t.id and s.fecha = d.fecha
  left join public.justificaciones_dia j on j.tecnico_id = t.id and j.fecha = d.fecha
  where not exists (
      select 1 from public.dias_festivos f
      where f.fecha = d.fecha and f.tipo in ('oficial', 'empresa')
    )
    and (extract(isodow from d.fecha) between 1 and 5 or s.tecnico_id is not null)
    and coalesce(s.con_reporte, false) = false
    -- Pendiente o aprobada: el técnico ya hizo su parte. Rechazada: no.
    and (j.id is null or j.estado = 'rechazada')
    -- La bitácora cubre solo un día sin servicio y sin justificación rechazada.
    and not (
      s.tecnico_id is null
      and j.id is null
      and exists (
        select 1 from public.actividades a
        where a.created_by = t.id
          and (a.hora_inicio at time zone 'America/Mexico_City')::date = d.fecha
      )
    )
    -- Un levantamiento hecho por la persona ese día cubre el día, igual que un reporte.
    and not exists (
      select 1 from public.levantamientos l
      where l.created_by = t.id and l.fecha = d.fecha
    )
    and not exists (
      select 1 from reportes_dia r
      where r.fecha = d.fecha
        and (
          r.created_by = t.id
          or (t.nombre_norm <> '' and (r.a_cargo = t.nombre_norm or t.nombre_norm = any (r.personal)))
        )
    )
  order by t.id, d.fecha;
$$;

revoke all on function public.dias_sin_reporte(date, date, uuid) from public, anon;
grant execute on function public.dias_sin_reporte(date, date, uuid) to authenticated, service_role;

-- ---------- 12) Cobertura por día: estado 'levantamiento' ----------
-- Cambian las columnas: hay que borrarla antes de crearla de nuevo.
drop function if exists public.cobertura_dias(date, date);

create function public.cobertura_dias(p_desde date, p_hasta date)
returns table (
  tecnico_id uuid, tecnico text, fecha date,
  estado text,                 -- 'reporte' | 'levantamiento' | 'justificado' | 'por_autorizar' | 'sin_reporte' | 'no_exigible'
  festivo text, motivo text, detalle text, justificado_en timestamptz, reportes uuid[],
  justificacion_id uuid,       -- la justificación escrita (si hay)
  justificacion_estado text,   -- 'pendiente' | 'aprobada' | 'rechazada'
  justifico text,              -- quién la registró
  reviso text,                 -- quién la autorizó o rechazó
  revisado_en timestamptz,
  servicios uuid[],            -- servicios programados ese día
  levantamientos uuid[]        -- levantamientos que hizo la persona ese día
)
language sql
stable
security definer
set search_path = public
as $$
  with tecnicos as (
    select p.id, p.full_name, public.normalizar_nombre(p.full_name) as nombre_norm
    from public.profiles p
    where p.role = 'tecnico'
      and p.activo = true
      and (
        auth.uid() is null
        or public.get_my_role() = 'supervisor'
        or p.id = auth.uid()
      )
  ),
  dias as (
    select d::date as fecha
    from generate_series(p_desde, p_hasta, interval '1 day') d
    where p_hasta - p_desde <= 62
  ),
  servicio_dia as (
    -- Solo cuentan los reportes de servicio en los que la persona aparece
    -- anotada (quien lo hizo, el ingeniero a cargo o el personal).
    select st.tecnico_id, sp.fecha,
           array_agg(sp.id) as servicios,
           array_agg(sp.report_id) filter (where exists (
             select 1 from public.reports r
             where r.id = sp.report_id
               and (
                 r.created_by = st.tecnico_id
                 or (public.normalizar_nombre(pf.full_name) <> '' and (
                   public.normalizar_nombre(r.data->>'ingACargo') = public.normalizar_nombre(pf.full_name)
                   or (jsonb_typeof(r.data->'personal') = 'array' and exists (
                     select 1 from jsonb_array_elements_text(r.data->'personal') x
                     where public.normalizar_nombre(x) = public.normalizar_nombre(pf.full_name)
                   ))
                 ))
               )
           )) as reps,
           string_agg(sp.proyecto, ', ') filter (where sp.visita_estado in ('pendiente', 'liberado')) as visita,
           bool_or(sp.visita_estado = 'liberado') as visita_liberada,
           max(coalesce(sp.visita_revisada_en, sp.hora_fin)) filter (where sp.visita_estado in ('pendiente', 'liberado')) as visita_en
    from public.servicio_tecnicos st
    join public.servicios_programados sp on sp.id = st.servicio_id
    join public.profiles pf on pf.id = st.tecnico_id
    where sp.fecha between p_desde and p_hasta
      and sp.estado <> 'cancelado'
    group by st.tecnico_id, sp.fecha
  ),
  reportes_dia as (
    select r.id, r.fecha, r.created_by,
           public.normalizar_nombre(r.data->>'ingACargo') as a_cargo,
           case when jsonb_typeof(r.data->'personal') = 'array'
                then (select array_agg(public.normalizar_nombre(x))
                      from jsonb_array_elements_text(r.data->'personal') x)
                else '{}'::text[] end as personal
    from public.reports r
    where r.fecha between p_desde and p_hasta
  ),
  bitacora_dia as (
    select a.created_by as tecnico_id,
           (a.hora_inicio at time zone 'America/Mexico_City')::date as fecha,
           string_agg(a.titulo, ', ' order by a.hora_inicio) as titulos,
           max(a.hora_inicio) as en
    from public.actividades a
    where (a.hora_inicio at time zone 'America/Mexico_City')::date between p_desde and p_hasta
    group by 1, 2
  ),
  festivos as (
    select f.fecha, string_agg(f.nombre, ', ') as nombre
    from public.dias_festivos f
    where f.tipo in ('oficial', 'empresa') and f.fecha between p_desde and p_hasta
    group by f.fecha
  ),
  base as (
    select
      t.id, t.full_name, d.fecha,
      fe.nombre as festivo,
      (s.tecnico_id is not null) as con_servicio,
      s.servicios,
      (
        select array_agg(distinct x)
        from (
          select unnest(coalesce(s.reps, '{}'::uuid[])) as x
          union
          select r.id from reportes_dia r
          where r.fecha = d.fecha
            and (
              r.created_by = t.id
              or (t.nombre_norm <> '' and (r.a_cargo = t.nombre_norm or t.nombre_norm = any (r.personal)))
            )
        ) q
      ) as reportes,
      (select array_agg(l.id) from public.levantamientos l where l.created_by = t.id and l.fecha = d.fecha) as levantamientos,
      j.id as j_id, j.estado as j_estado, j.motivo as j_motivo, j.detalle as j_detalle, j.created_at as j_en,
      pj.full_name as justifico, pr.full_name as reviso, j.revisado_en,
      s.visita, coalesce(s.visita_liberada, false) as visita_liberada, s.visita_en,
      -- La bitácora solo cuenta en un día sin servicio y sin justificación.
      case when s.tecnico_id is null and j.id is null then bd.titulos end as bitacora,
      bd.en as bitacora_en
    from tecnicos t
    cross join dias d
    left join servicio_dia s on s.tecnico_id = t.id and s.fecha = d.fecha
    left join festivos fe on fe.fecha = d.fecha
    left join public.justificaciones_dia j on j.tecnico_id = t.id and j.fecha = d.fecha
    left join public.profiles pj on pj.id = coalesce(j.registrado_por, j.tecnico_id)
    left join public.profiles pr on pr.id = j.revisado_por
    left join bitacora_dia bd on bd.tecnico_id = t.id and bd.fecha = d.fecha
  ),
  cubierto as (
    -- Qué cubre el día (si algo) y si ya está autorizado.
    select b.*,
      case
        when b.j_id is not null and b.j_estado <> 'rechazada' then b.j_motivo
        when b.visita is not null then 'visita_sin_trabajo'
        when b.bitacora is not null then 'bitacora'
      end as motivo_c,
      case
        when b.j_id is not null and b.j_estado <> 'rechazada' then b.j_estado = 'aprobada'
        when b.visita is not null then b.visita_liberada
        else false
      end as autorizado
    from base b
  )
  select
    c.id, c.full_name, c.fecha,
    case
      when coalesce(array_length(c.reportes, 1), 0) > 0 then 'reporte'
      when coalesce(array_length(c.levantamientos, 1), 0) > 0 then 'levantamiento'
      when c.motivo_c is not null and c.autorizado then 'justificado'
      when c.motivo_c is not null then 'por_autorizar'
      when c.festivo is not null then 'no_exigible'
      when extract(isodow from c.fecha) > 5 and not c.con_servicio then 'no_exigible'
      else 'sin_reporte'
    end,
    c.festivo,
    coalesce(c.motivo_c, c.j_motivo),
    case
      when c.j_id is not null then c.j_detalle
      when c.visita is not null then c.visita
      else c.bitacora
    end,
    case
      when c.j_id is not null then c.j_en
      when c.visita is not null then c.visita_en
      else c.bitacora_en
    end,
    coalesce(c.reportes, '{}'::uuid[]),
    c.j_id, c.j_estado, c.justifico, c.reviso, c.revisado_en,
    coalesce(c.servicios, '{}'::uuid[]),
    coalesce(c.levantamientos, '{}'::uuid[])
  from cubierto c
  order by c.full_name, c.fecha;
$$;

revoke all on function public.cobertura_dias(date, date) from public, anon;
grant execute on function public.cobertura_dias(date, date) to authenticated, service_role;

-- ---------- 13) Cálculo automático cada 15 minutos ----------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'detectar-visitas';
    perform cron.schedule('detectar-visitas', '*/15 * * * *', 'select public.detectar_visitas_recientes()');
  end if;
end $$;

-- Verificación: debe decir tabla = 1, funciones = 10, columnas = 2.
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'visitas_detectadas') as tabla,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'lugares_de_clientes', 'gps_en_clientes', 'detectar_visitas', 'detectar_visitas_recientes', 'visita_cubierta_por',
      'visitas_por_revisar', 'texto_visita', 'justificar_visita', 'revisar_visita', 'mi_horario_gps')) as funciones,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'ajustes_operacion' and column_name in ('visita_exigible_min', 'visitas_exigibles_desde')) as columnas;
