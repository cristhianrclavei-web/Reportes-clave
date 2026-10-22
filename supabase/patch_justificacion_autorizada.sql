-- ============================================================
-- Cobertura: la justificación del técnico necesita la autorización del supervisor
-- ============================================================
-- Antes, en cuanto el técnico justificaba un día, el día quedaba «Justificado»
-- sin que nadie lo revisara. Y cualquier actividad de bitácora (p. ej.
-- «Prepara herramienta y material») también contaba como justificación, aunque
-- ese día la persona tuviera un servicio sin reporte.
--
-- Ahora:
--   1) justificaciones_dia tiene estado: 'pendiente' (la registró el técnico),
--      'aprobada' (la autorizó o la registró un supervisor) o 'rechazada'.
--      Quién la autorizó o rechazó y cuándo queda guardado y va a Eventos.
--   2) Una justificación rechazada se reemplaza si el técnico vuelve a
--      justificar ese día (la rechazada sigue en Eventos).
--   3) La bitácora solo cubre un día SIN servicio programado, y queda «por
--      autorizar». Con servicio, el día pide su reporte.
--   4) cobertura_dias(): estado nuevo 'por_autorizar' y columnas con quién
--      justificó, quién autorizó y los servicios del día.
--   5) dias_sin_reporte() (avisos al técnico): una justificación pendiente ya
--      no le genera avisos (él ya hizo su parte); una rechazada sí.
--
-- Las justificaciones que registraron los técnicos en los últimos 30 días
-- quedan «pendientes» para que el supervisor las revise; las demás, aprobadas.
--
-- Requiere patch_bitacora_tipos.sql y patch_fase2_servicios.sql.
-- Ejecutar completo en el SQL Editor de Supabase. Aditivo e idempotente.

-- ---------- 1) Columnas ----------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'justificaciones_dia' and column_name = 'estado'
  ) then
    alter table public.justificaciones_dia
      add column estado text not null default 'aprobada'
        check (estado in ('pendiente', 'aprobada', 'rechazada'));
    -- Solo la primera vez: las recientes del propio técnico, a revisión.
    update public.justificaciones_dia
       set estado = 'pendiente'
     where (registrado_por is null or registrado_por = tecnico_id)
       and fecha >= (now() at time zone 'America/Mexico_City')::date - 30;
  end if;
end $$;

alter table public.justificaciones_dia alter column estado set default 'pendiente';
alter table public.justificaciones_dia add column if not exists revisado_por uuid references public.profiles(id);
alter table public.justificaciones_dia add column if not exists revisado_en timestamptz;

-- ---------- 2) Al registrar: el estado lo pone la base, no quien inserta ----------
create or replace function public.justificacion_dia_al_insertar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.get_my_role() = 'supervisor' then
    -- El supervisor la registra ya autorizada (o rechazada, si rechaza un
    -- día cubierto solo por bitácora).
    if new.estado is distinct from 'rechazada' then
      new.estado := 'aprobada';
    end if;
    new.revisado_por := auth.uid();
    new.revisado_en := now();
  else
    new.estado := 'pendiente';
    new.revisado_por := null;
    new.revisado_en := null;
  end if;
  -- Una rechazada se reemplaza con la nueva; la rechazada queda en Eventos.
  delete from public.justificaciones_dia
   where tecnico_id = new.tecnico_id and fecha = new.fecha and estado = 'rechazada';
  return new;
end;
$$;

drop trigger if exists trg_justificacion_dia_al_insertar on public.justificaciones_dia;
create trigger trg_justificacion_dia_al_insertar
  before insert on public.justificaciones_dia
  for each row execute function public.justificacion_dia_al_insertar();

-- ---------- 3) Autorizar o rechazar (solo supervisor, solo el estado) ----------
drop policy if exists justificaciones_update_supervisor on public.justificaciones_dia;
create policy justificaciones_update_supervisor on public.justificaciones_dia for update
  to authenticated
  using (public.get_my_role() = 'supervisor')
  with check (public.get_my_role() = 'supervisor');

create or replace function public.justificacion_dia_al_revisar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo cambia el estado; lo demás es lo que escribió el técnico.
  new.tecnico_id := old.tecnico_id;
  new.fecha := old.fecha;
  new.motivo := old.motivo;
  new.detalle := old.detalle;
  new.registrado_por := old.registrado_por;
  new.created_at := old.created_at;
  if new.estado is distinct from old.estado then
    new.revisado_por := auth.uid();
    new.revisado_en := now();
  else
    new.revisado_por := old.revisado_por;
    new.revisado_en := old.revisado_en;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_justificacion_dia_al_revisar on public.justificaciones_dia;
create trigger trg_justificacion_dia_al_revisar
  before update on public.justificaciones_dia
  for each row execute function public.justificacion_dia_al_revisar();

-- ---------- 4) Eventos ----------
create or replace function public.texto_justificacion_dia(p_motivo text, p_detalle text, p_fecha date)
returns text
language sql
immutable
as $$
  select to_char(p_fecha, 'DD/MM/YYYY') || ' — ' ||
    case p_motivo
      when 'no_asisti' then 'No asistí'
      when 'sin_servicio' then 'No salí a servicio'
      when 'festivo' then 'Día festivo'
      when 'vacaciones' then 'Vacaciones'
      else 'Otro'
    end ||
    coalesce(': ' || nullif(trim(p_detalle), ''), '');
$$;

-- Al registrar: quién la registró. Si un supervisor registra una rechazada
-- (día cubierto solo por bitácora), se anota como rechazo.
create or replace function public.auditar_justificacion_dia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(new.registrado_por, auth.uid(), new.tecnico_id);
  v_tecnico text;
begin
  select full_name into v_tecnico from public.profiles where id = new.tecnico_id;
  insert into public.auditoria_global (actor_id, accion, entidad, entidad_id, detalle)
  values (
    v_actor,
    case when new.estado = 'rechazada' then 'rechazo_justificacion' else 'justifico_dia' end,
    'dia',
    new.id,
    case when v_actor is distinct from new.tecnico_id then 'Por ' || coalesce(v_tecnico, 'técnico') || ': ' else '' end ||
      public.texto_justificacion_dia(new.motivo, new.detalle, new.fecha)
  );
  return new;
end;
$$;

create or replace function public.auditar_revision_justificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tecnico text;
begin
  if new.estado is not distinct from old.estado or new.estado = 'pendiente' then
    return new;
  end if;
  select full_name into v_tecnico from public.profiles where id = new.tecnico_id;
  insert into public.auditoria_global (actor_id, accion, entidad, entidad_id, detalle)
  values (
    coalesce(auth.uid(), new.revisado_por, new.tecnico_id),
    case when new.estado = 'aprobada' then 'autorizo_justificacion' else 'rechazo_justificacion' end,
    'dia',
    new.id,
    'De ' || coalesce(v_tecnico, 'técnico') || ': ' || public.texto_justificacion_dia(new.motivo, new.detalle, new.fecha)
  );
  return new;
end;
$$;

drop trigger if exists trg_auditar_revision_justificacion on public.justificaciones_dia;
create trigger trg_auditar_revision_justificacion
  after update on public.justificaciones_dia
  for each row execute function public.auditar_revision_justificacion();

-- ---------- 5) Días sin reporte (avisos al técnico) ----------
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

-- ---------- 6) Cobertura por día (tablero del supervisor) ----------
-- Cambian las columnas: hay que borrarla antes de crearla de nuevo.
drop function if exists public.cobertura_dias(date, date);

create function public.cobertura_dias(p_desde date, p_hasta date)
returns table (
  tecnico_id uuid, tecnico text, fecha date,
  estado text,                 -- 'reporte' | 'justificado' | 'por_autorizar' | 'sin_reporte' | 'no_exigible'
  festivo text, motivo text, detalle text, justificado_en timestamptz, reportes uuid[],
  justificacion_id uuid,       -- la justificación escrita (si hay)
  justificacion_estado text,   -- 'pendiente' | 'aprobada' | 'rechazada'
  justifico text,              -- quién la registró
  reviso text,                 -- quién la autorizó o rechazó
  revisado_en timestamptz,
  servicios uuid[]             -- servicios programados ese día
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
    coalesce(c.servicios, '{}'::uuid[])
  from cubierto c
  order by c.full_name, c.fecha;
$$;

revoke all on function public.cobertura_dias(date, date) from public, anon;
grant execute on function public.cobertura_dias(date, date) to authenticated, service_role;

-- Verificación: 3 columnas nuevas, 3 disparadores y la cobertura del 20/10/2026
-- (los días con solo bitácora ahora salen 'por_autorizar' o 'sin_reporte').
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'justificaciones_dia'
      and column_name in ('estado', 'revisado_por', 'revisado_en')) as columnas,
  (select count(*) from pg_trigger
    where tgname in ('trg_justificacion_dia_al_insertar', 'trg_justificacion_dia_al_revisar', 'trg_auditar_revision_justificacion')) as disparadores;
select tecnico, estado, motivo, detalle from public.cobertura_dias('2026-10-20', '2026-10-20');
