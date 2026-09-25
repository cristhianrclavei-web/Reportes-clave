-- ============================================================
-- Cobertura diaria de reportes: festivos + justificaciones
-- ============================================================
-- Regla: cada técnico activo debe tener cada día exigible cubierto por un
-- reporte o por una justificación.
--
--   Día exigible  = lunes a viernes que no sea festivo, más el sábado o
--                   domingo en que el técnico tuvo un servicio programado.
--   Día cubierto  = cualquiera de:
--     · el técnico creó un reporte con esa fecha;
--     · aparece en la cuadrilla del reporte (ingeniero a cargo o personal
--       adicional; se compara el nombre sin acentos ni mayúsculas);
--     · estaba asignado a un servicio programado de ese día que ya tiene
--       reporte ligado;
--     · registró una justificación para ese día.
--
-- 1) dias_festivos (ya existía): el supervisor agrega y quita desde Agenda.
-- 2) justificaciones_dia: el técnico explica un día sin reporte (no asistió,
--    no salió a servicio, festivo, vacaciones, otro). Solo registro: no se
--    edita ni se borra desde la app.
-- 3) Ambas quedan también en auditoria_global (pestaña Eventos) por trigger.
-- 4) dias_sin_reporte(): la función que usan el recordatorio push y el aviso
--    dentro de la app.
-- 5) El recordatorio de la mañana pasa de 8:30 a 9:00 (sin tocar el secreto).
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

-- ---------- 1) Festivos ----------
-- La tabla ya existe (patch_avisos_y_festivos.sql: fecha, nombre, tipo) y
-- trae cargados los festivos 2026-2028. Aquí solo se agrega quién marcó cada
-- uno y el permiso del supervisor para agregar y quitar.
-- Para la cobertura cuentan 'oficial' y 'empresa'. 'costumbre' (Jueves y
-- Viernes Santo, Día de Muertos, Guadalupe) SÍ pide reporte o justificación.
alter table public.dias_festivos
  add column if not exists creado_por uuid references public.profiles(id),
  add column if not exists created_at timestamptz not null default now();

drop policy if exists dias_festivos_supervisor_insert on public.dias_festivos;
create policy dias_festivos_supervisor_insert on public.dias_festivos for insert
  to authenticated
  with check (public.get_my_role() = 'supervisor' and creado_por = auth.uid());

drop policy if exists dias_festivos_supervisor_delete on public.dias_festivos;
create policy dias_festivos_supervisor_delete on public.dias_festivos for delete
  to authenticated using (public.get_my_role() = 'supervisor');

-- ---------- 2) Justificaciones ----------
create table if not exists public.justificaciones_dia (
  id uuid primary key default gen_random_uuid(),
  tecnico_id uuid not null references public.profiles(id) on delete cascade,
  fecha date not null,
  motivo text not null check (motivo in ('no_asisti', 'sin_servicio', 'festivo', 'vacaciones', 'otro')),
  detalle text,
  created_at timestamptz not null default now(),
  unique (tecnico_id, fecha),
  constraint justificacion_otro_con_detalle
    check (motivo <> 'otro' or length(trim(coalesce(detalle, ''))) >= 3)
);

alter table public.justificaciones_dia enable row level security;

drop policy if exists justificaciones_select on public.justificaciones_dia;
create policy justificaciones_select on public.justificaciones_dia for select
  to authenticated
  using (tecnico_id = auth.uid() or public.get_my_role() = 'supervisor');

-- Solo la propia y nunca de un día futuro (hora de México).
drop policy if exists justificaciones_insert_own on public.justificaciones_dia;
create policy justificaciones_insert_own on public.justificaciones_dia for insert
  to authenticated
  with check (
    tecnico_id = auth.uid()
    and fecha <= (now() at time zone 'America/Mexico_City')::date
  );

-- ---------- 3) Registro en Eventos ----------
alter table public.auditoria_global drop constraint if exists auditoria_global_entidad_check;
alter table public.auditoria_global add constraint auditoria_global_entidad_check
  check (entidad in ('servicio', 'reporte', 'proyecto', 'dia'));

create or replace function public.auditar_justificacion_dia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.auditoria_global (actor_id, accion, entidad, entidad_id, detalle)
  values (
    new.tecnico_id,
    'justifico_dia',
    'dia',
    new.id,
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

drop trigger if exists trg_auditar_justificacion_dia on public.justificaciones_dia;
create trigger trg_auditar_justificacion_dia
  after insert on public.justificaciones_dia
  for each row execute function public.auditar_justificacion_dia();

create or replace function public.auditar_dia_festivo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), case when tg_op = 'INSERT' then new.creado_por end);
begin
  if v_actor is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    insert into public.auditoria_global (actor_id, accion, entidad, entidad_id, detalle)
    values (v_actor, 'marco_festivo', 'dia', null,
            to_char(new.fecha, 'DD/MM/YYYY') || ' — ' || new.nombre);
    return new;
  else
    insert into public.auditoria_global (actor_id, accion, entidad, entidad_id, detalle)
    values (v_actor, 'quito_festivo', 'dia', null,
            to_char(old.fecha, 'DD/MM/YYYY') || ' — ' || old.nombre);
    return old;
  end if;
end;
$$;

drop trigger if exists trg_auditar_dia_festivo on public.dias_festivos;
create trigger trg_auditar_dia_festivo
  after insert or delete on public.dias_festivos
  for each row execute function public.auditar_dia_festivo();

-- ---------- 4) Días sin reporte ----------
create or replace function public.normalizar_nombre(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    translate(lower(trim(coalesce(p, ''))), 'áéíóúüñàèìòùäëïö', 'aeiouunaeiouaeio'),
    '\s+', ' ', 'g'
  );
$$;

-- Devuelve (tecnico_id, fecha) por cada día exigible sin cubrir entre
-- p_desde y p_hasta. Quién ve qué:
--   · técnico: solo lo suyo;
--   · supervisor: todos;
--   · el cron (secret key, sin usuario): todos.
-- anon no tiene permiso de ejecutarla.
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

-- ---------- 5) Recordatorio de la mañana: 8:30 → 9:00 México (15:00 UTC) ----------
do $$
declare v_id bigint;
begin
  select jobid into v_id from cron.job where jobname = 'recordatorio-reporte-manana';
  if v_id is not null then
    perform cron.alter_job(job_id := v_id, schedule := '0 15 * * *');
  else
    raise notice 'No existe el cron recordatorio-reporte-manana: corre primero patch_recordatorio_reporte_cron.sql';
  end if;
end $$;

-- Verificación: dos filas, '0 0 * * *' (18:00) y '0 15 * * *' (9:00), activas.
select jobname, schedule, active from cron.job
where jobname in ('recordatorio-reporte-tarde', 'recordatorio-reporte-manana');
