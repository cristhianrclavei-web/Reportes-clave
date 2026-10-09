-- ============================================================
-- Bitácora: tipos de actividad, cierre automático y cobertura del día
-- ============================================================
-- La bitácora pasa a ser el registro de lo que NO es un servicio programado
-- (traslados, compras, oficina, capacitación, apoyos). Este parche:
--
-- 1) Agrega a `actividades` el tipo, el cliente (opcional) y la marca de
--    «se cerró sola».
-- 2) cerrar_actividades_abiertas(): cierra lo que quedó abierto de días
--    anteriores (hora de México), con la hora del último movimiento
--    registrado, y lo marca para que su dueño confirme la hora real. La
--    corre el cron de las 23:55 y también la app al abrir la bitácora.
-- 3) dias_sin_reporte(): un día con actividad de bitácora ya no pide
--    reporte ni justificación.
-- 4) cobertura_dias(): ese día sale «Justificado» con motivo «bitacora».
--
-- Requiere patch_visita_sin_trabajo.sql y patch_cobertura_solo_anotados.sql.
-- Ejecutar completo en el SQL Editor de Supabase. Aditivo e idempotente.

-- ---------- 1) Columnas ----------
alter table public.actividades
  add column if not exists tipo text,
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null,
  add column if not exists cierre_automatico boolean not null default false;

alter table public.actividades drop constraint if exists actividades_tipo_check;
alter table public.actividades
  add constraint actividades_tipo_check
  check (tipo is null or tipo in ('traslado', 'compra', 'oficina', 'capacitacion', 'apoyo_cliente', 'otro'));

create index if not exists idx_actividades_dueno_inicio on public.actividades (created_by, hora_inicio);

-- ---------- 2) Cierre automático ----------
create or replace function public.cerrar_actividades_abiertas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_n integer := 0;
  a record;
  v_fin timestamptz;
begin
  for a in
    select id, hora_inicio from public.actividades
    where estado <> 'concluida'
      and (hora_inicio at time zone 'America/Mexico_City')::date < v_hoy
    for update
  loop
    -- Lo último que se supo de ella; sin movimientos, su propia hora de inicio.
    select coalesce(max(e.created_at), a.hora_inicio) into v_fin
    from public.actividad_eventos e where e.actividad_id = a.id;
    insert into public.actividad_eventos (actividad_id, tipo, nota, created_at)
    values (a.id, 'cierre', 'Se cerró sola al terminar el día', v_fin);
    update public.actividades
      set estado = 'concluida', hora_fin = v_fin, cierre_automatico = true
      where id = a.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.cerrar_actividades_abiertas() from public, anon;
grant execute on function public.cerrar_actividades_abiertas() to authenticated, service_role;

-- Cada noche a las 23:55 de México (05:55 UTC). Si la instalación no tiene
-- pg_cron, la app la corre al abrir la bitácora.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'cerrar-actividades-abiertas';
    perform cron.schedule('cerrar-actividades-abiertas', '55 5 * * *', 'select public.cerrar_actividades_abiertas()');
  end if;
end $$;

-- ---------- 3) Días sin reporte (recordatorios) ----------
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
    -- Una actividad de bitácora de ese día (hora de México) lo cubre.
    and not exists (
      select 1 from public.actividades a
      where a.created_by = t.id
        and (a.hora_inicio at time zone 'America/Mexico_City')::date = d.fecha
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

-- ---------- 4) Cobertura por día (tablero del supervisor) ----------
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
      -- La justificación del técnico manda; si no hay, la visita sin trabajo
      -- y después la bitácora.
      coalesce(j.motivo, case when s.visita is not null then 'visita_sin_trabajo' when bd.titulos is not null then 'bitacora' end) as motivo,
      case when j.motivo is not null then j.detalle when s.visita is not null then s.visita else bd.titulos end as detalle,
      case when j.motivo is not null then j.created_at when s.visita is not null then s.visita_en else bd.en end as justificado_en
    from tecnicos t
    cross join dias d
    left join servicio_dia s on s.tecnico_id = t.id and s.fecha = d.fecha
    left join festivos fe on fe.fecha = d.fecha
    left join public.justificaciones_dia j on j.tecnico_id = t.id and j.fecha = d.fecha
    left join bitacora_dia bd on bd.tecnico_id = t.id and bd.fecha = d.fecha
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

-- Verificación: debe devolver 3 (columnas), 1 (función) y 2 (funciones de cobertura).
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'actividades'
      and column_name in ('tipo', 'cliente_id', 'cierre_automatico')) as columnas,
  (select count(*) from pg_proc where proname = 'cerrar_actividades_abiertas') as cierre,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('dias_sin_reporte', 'cobertura_dias')
      and p.prosrc like '%public.actividades%') as cobertura;
