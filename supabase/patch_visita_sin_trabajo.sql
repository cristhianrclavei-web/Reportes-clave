-- ============================================================
-- Visita sin trabajo: el técnico llegó pero no se pudo trabajar
-- ============================================================
-- El técnico cierra el día como «No se pudo trabajar» (motivo, comentario,
-- foto y firma de quien lo atendió, opcionales). El servicio queda
-- «por revisar» y es el SUPERVISOR quien decide:
--     liberado  → ese servicio ya no exige reporte;
--     rechazado → sí requiere reporte, como cualquier otro.
--
-- 1) Columnas nuevas en servicios_programados.
-- 2) Candado: solo un supervisor libera o rechaza. El técnico solo puede
--    dejarla «pendiente» al cerrar como no realizado.
-- 3) dias_sin_reporte() (recordatorios de 18:00 y 9:00): una visita por
--    revisar o liberada cubre el día, igual que un reporte.
-- 4) cobertura_dias() (tablero de cobertura): ese día sale «Justificado»
--    con motivo «visita_sin_trabajo».
--
-- Ejecutar completo en el SQL Editor de Supabase. Aditivo e idempotente.

-- ---------- 1) Columnas ----------
alter table public.servicios_programados
  add column if not exists visita_estado text,
  add column if not exists visita_revisada_por uuid references public.profiles(id),
  add column if not exists visita_revisada_en timestamptz,
  add column if not exists visita_nota text,
  add column if not exists visita_firma text,
  add column if not exists visita_firma_nombre text;

alter table public.servicios_programados drop constraint if exists servicios_visita_estado_check;
alter table public.servicios_programados
  add constraint servicios_visita_estado_check
  check (visita_estado is null or visita_estado in ('pendiente', 'liberado', 'rechazado'));

-- ---------- 2) Solo el supervisor libera ----------
-- La política de técnicos deja actualizar cualquier columna de sus
-- servicios; sin este candado podrían liberarse solos del reporte.
create or replace function public.proteger_visita_sin_trabajo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.visita_estado is not distinct from old.visita_estado
     and new.visita_revisada_por is not distinct from old.visita_revisada_por
     and new.visita_revisada_en is not distinct from old.visita_revisada_en
     and new.visita_nota is not distinct from old.visita_nota then
    return new;
  end if;
  -- Sin usuario: tareas del servidor (cron, mantenimiento).
  if auth.uid() is null or public.get_my_role() = 'supervisor' then
    return new;
  end if;
  if old.visita_estado is null
     and new.visita_estado = 'pendiente'
     and new.resultado = 'no_realizado'
     and new.visita_revisada_por is null
     and new.visita_revisada_en is null
     and new.visita_nota is null then
    return new;
  end if;
  raise exception 'Solo un supervisor puede liberar o rechazar una visita sin trabajo.';
end;
$$;

drop trigger if exists trg_proteger_visita_sin_trabajo on public.servicios_programados;
create trigger trg_proteger_visita_sin_trabajo
  before update on public.servicios_programados
  for each row execute function public.proteger_visita_sin_trabajo();

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
    -- Una visita sin trabajo (por revisar o ya liberada) cubre el día.
    select st.tecnico_id, sp.fecha,
           bool_or(sp.report_id is not null or sp.visita_estado in ('pendiente', 'liberado')) as con_reporte
    from public.servicio_tecnicos st
    join public.servicios_programados sp on sp.id = st.servicio_id
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
    select st.tecnico_id, sp.fecha,
           array_agg(sp.report_id) filter (where sp.report_id is not null) as reps,
           string_agg(sp.proyecto, ', ') filter (where sp.visita_estado in ('pendiente', 'liberado')) as visita,
           max(coalesce(sp.visita_revisada_en, sp.hora_fin)) filter (where sp.visita_estado in ('pendiente', 'liberado')) as visita_en
    from public.servicio_tecnicos st
    join public.servicios_programados sp on sp.id = st.servicio_id
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

-- Verificación: debe devolver 6 (las columnas) y 1 (el candado).
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'servicios_programados'
      and column_name like 'visita\_%') as columnas,
  (select count(*) from pg_trigger where tgname = 'trg_proteger_visita_sin_trabajo') as candado;
