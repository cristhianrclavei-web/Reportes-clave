-- ============================================================
-- Fase 2 de servicios: cancelar con motivo + justificar por supervisor
-- ============================================================
-- 1) Un servicio se puede CANCELAR (el cliente canceló, no llegó el equipo,
--    etc.) en vez de borrarlo: queda en el historial con motivo, quién y
--    cuándo, ya no exige reporte y sirve para medir cancelaciones.
--    Solo un supervisor puede cancelar o reactivar, y solo si no se empezó.
-- 2) La cobertura de reportes (avisos de 18:00/9:00, Control y Cobertura)
--    ignora los servicios cancelados: un sábado con servicio cancelado ya no
--    exige reporte.
-- 3) El supervisor puede registrar la justificación de un día por el
--    técnico (p. ej. «estuvo en oficina conmigo»); queda quién la registró.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

-- ---------- 1) Estado «cancelado» ----------
alter table public.servicios_programados
  drop constraint if exists servicios_programados_estado_check;
alter table public.servicios_programados
  add constraint servicios_programados_estado_check
  check (estado in ('programado', 'en_sitio', 'en_curso', 'concluido', 'cancelado'));

alter table public.servicios_programados
  add column if not exists cancelado_motivo text,
  add column if not exists cancelado_por uuid,
  add column if not exists cancelado_en timestamptz;

-- Solo el supervisor cancela/reactiva, y solo un servicio no empezado. Un
-- técnico tampoco puede mover un servicio cancelado (marcar llegada, etc.).
create or replace function public.proteger_cancelacion_servicio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'cancelado' and old.estado is distinct from 'cancelado' then
    if public.get_my_role() is distinct from 'supervisor' then
      raise exception 'Solo un supervisor puede cancelar un servicio';
    end if;
    if old.estado <> 'programado' then
      raise exception 'Este servicio ya se empezó; no se puede cancelar';
    end if;
    if coalesce(trim(new.cancelado_motivo), '') = '' then
      raise exception 'Indica el motivo de la cancelación';
    end if;
    new.cancelado_por := auth.uid();
    new.cancelado_en := now();
  elsif old.estado = 'cancelado' and new.estado is distinct from 'cancelado' then
    if public.get_my_role() is distinct from 'supervisor' then
      raise exception 'Este servicio está cancelado';
    end if;
    if new.estado <> 'programado' then
      raise exception 'Un servicio cancelado solo se puede reactivar como programado';
    end if;
    new.cancelado_motivo := null;
    new.cancelado_por := null;
    new.cancelado_en := null;
  elsif old.estado = 'cancelado' and public.get_my_role() is distinct from 'supervisor' then
    raise exception 'Este servicio está cancelado';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_cancelacion_servicio on public.servicios_programados;
create trigger trg_proteger_cancelacion_servicio
  before update on public.servicios_programados
  for each row execute function public.proteger_cancelacion_servicio();

-- ---------- 2) Cobertura sin servicios cancelados ----------
-- Mismas funciones que patch_cobertura_reportes.sql y
-- patch_cobertura_supervisor.sql, con «and sp.estado <> 'cancelado'».

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
    select st.tecnico_id, sp.fecha, bool_or(sp.report_id is not null) as con_reporte
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

-- ---------- 3) Justificación registrada por el supervisor ----------
alter table public.justificaciones_dia
  add column if not exists registrado_por uuid default auth.uid();

drop policy if exists justificaciones_insert_supervisor on public.justificaciones_dia;
create policy justificaciones_insert_supervisor on public.justificaciones_dia for insert
  to authenticated
  with check (
    public.get_my_role() = 'supervisor'
    and registrado_por = auth.uid()
    and fecha <= (now() at time zone 'America/Mexico_City')::date
  );

-- En Eventos aparece quien la registró (el supervisor o el propio técnico).
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
    'justifico_dia',
    'dia',
    new.id,
    case when v_actor is distinct from new.tecnico_id then 'Por ' || coalesce(v_tecnico, 'técnico') || ': ' else '' end ||
    to_char(new.fecha, 'DD/MM/YYYY') || ' — ' ||
      case new.motivo
        when 'no_asisti' then 'No asistí'
        when 'sin_servicio' then 'No salí a servicio'
        when 'festivo' then 'Día festivo'
        when 'vacaciones' then 'Vacaciones'
        else 'Otro'
      end ||
      coalesce(': ' || nullif(trim(new.detalle), ''), '')
  );
  return new;
end;
$$;

-- Verificación: deben ser iguales, y la restricción debe incluir 'cancelado'.
select
  (select count(*) from public.cobertura_dias('2026-09-28', (now() at time zone 'America/Mexico_City')::date) where estado = 'sin_reporte') as sin_reporte_nueva,
  (select count(*) from public.dias_sin_reporte('2026-09-28', (now() at time zone 'America/Mexico_City')::date)) as sin_reporte_actual,
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'servicios_programados_estado_check') as restriccion;
