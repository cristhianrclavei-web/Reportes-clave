-- ============================================================
-- Cobertura: el reporte cubre solo a quien aparece anotado en él
-- ============================================================
-- Antes, estar asignado a un servicio que ya tenía reporte ligado cubría el
-- día de TODOS los asignados, aunque alguno no hubiera participado ni
-- apareciera en el reporte. Ahora el reporte de un servicio cubre solo a:
--     · quien lo hizo,
--     · el ingeniero a cargo,
--     · el personal adicional anotado
-- (el nombre se compara sin acentos ni mayúsculas, como en el resto de la
-- cobertura). Un asignado que no aparece queda «sin reporte» y debe
-- justificar el día, o lo justifica el supervisor desde Control.
--
-- No cambia: los reportes sin servicio, las justificaciones, los festivos ni
-- la visita sin trabajo (que sigue cubriendo a todos los asignados).
-- Aplica también hacia atrás: pueden aparecer pendientes de días pasados.
--
-- Requiere patch_visita_sin_trabajo.sql. Solo reemplaza dos funciones.
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

-- ---------- 1) Días sin reporte (recordatorios) ----------
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
  where not exists (
      select 1 from public.dias_festivos f
      where f.fecha = d.fecha and f.tipo in ('oficial', 'empresa')
    )
    and (extract(isodow from d.fecha) between 1 and 5 or s.tecnico_id is not null)
    and coalesce(s.con_reporte, false) = false
    and not exists (
      select 1 from public.justificaciones_dia j
      where j.tecnico_id = t.id and j.fecha = d.fecha
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

-- ---------- 2) Cobertura por día (tablero del supervisor) ----------
create or replace function public.cobertura_dias(p_desde date, p_hasta date)
returns table (
  tecnico_id uuid, tecnico text, fecha date, estado text, festivo text,
  motivo text, detalle text, justificado_en timestamptz, reportes uuid[]
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
      -- La justificación del técnico manda; si no hay, la visita sin trabajo.
      coalesce(j.motivo, case when s.visita is not null then 'visita_sin_trabajo' end) as motivo,
      case when j.motivo is not null then j.detalle else s.visita end as detalle,
      case when j.motivo is not null then j.created_at else s.visita_en end as justificado_en
    from tecnicos t
    cross join dias d
    left join servicio_dia s on s.tecnico_id = t.id and s.fecha = d.fecha
    left join festivos fe on fe.fecha = d.fecha
    left join public.justificaciones_dia j on j.tecnico_id = t.id and j.fecha = d.fecha
  )
  select
    b.id, b.full_name, b.fecha,
    case
      when coalesce(array_length(b.reportes, 1), 0) > 0 then 'reporte'
      when b.motivo is not null then 'justificado'
      when b.festivo is not null then 'no_exigible'
      when extract(isodow from b.fecha) > 5 and not b.con_servicio then 'no_exigible'
      else 'sin_reporte'
    end,
    b.festivo, b.motivo, b.detalle, b.justificado_en,
    coalesce(b.reportes, '{}'::uuid[])
  from base b
  order by b.full_name, b.fecha;
$$;

revoke all on function public.cobertura_dias(date, date) from public, anon;
grant execute on function public.cobertura_dias(date, date) to authenticated, service_role;

-- Verificación: debe devolver 2.
select count(*) as funciones from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('dias_sin_reporte', 'cobertura_dias')
  and p.prosrc like '%normalizar_nombre(pf.full_name)%';
