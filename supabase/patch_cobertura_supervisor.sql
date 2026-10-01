-- ============================================================
-- Cobertura de reportes: vista del supervisor
-- ============================================================
-- dias_sin_reporte() (patch_cobertura_reportes.sql) solo devuelve los días
-- que faltan, y es lo que usan los avisos de las 18:00 y 9:00. El supervisor
-- necesita ver el panorama completo de la semana: por técnico y por día, si
-- hay reporte, justificación (con su motivo), si falta, o si el día no se
-- exige (festivo, o fin de semana sin servicio programado).
--
-- cobertura_dias() aplica EXACTAMENTE las mismas reglas que
-- dias_sin_reporte(); la verificación del final compara las dos y debe dar
-- el mismo número de días sin reporte. Si algún día se cambia la regla, hay
-- que cambiarla en las dos funciones.
--
-- Quién ve qué (igual que dias_sin_reporte): el técnico solo lo suyo, el
-- supervisor todo. anon no tiene permiso.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

create or replace function public.cobertura_dias(p_desde date, p_hasta date)
returns table (
  tecnico_id uuid,
  tecnico text,
  fecha date,
  estado text,          -- 'reporte' | 'justificado' | 'sin_reporte' | 'no_exigible'
  festivo text,         -- nombre del festivo, si lo es
  motivo text,          -- motivo de la justificación
  detalle text,
  justificado_en timestamptz,
  reportes uuid[]       -- reportes que cubren el día
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
    select st.tecnico_id, sp.fecha,
           array_agg(sp.report_id) filter (where sp.report_id is not null) as reps
    from public.servicio_tecnicos st
    join public.servicios_programados sp on sp.id = st.servicio_id
    where sp.fecha between p_desde and p_hasta
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
      j.motivo, j.detalle, j.created_at as justificado_en
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

-- Verificación (en el SQL Editor no hay sesión, así que ve a todos): los dos
-- números deben ser IGUALES.
select
  (select count(*) from public.cobertura_dias('2026-09-28', (now() at time zone 'America/Mexico_City')::date) where estado = 'sin_reporte') as sin_reporte_nueva,
  (select count(*) from public.dias_sin_reporte('2026-09-28', (now() at time zone 'America/Mexico_City')::date)) as sin_reporte_actual;
