-- ============================================================
-- Ubicación de los técnicos en horario de trabajo
-- ============================================================
-- Los teléfonos de la empresa con la app de Android de Clave mandan un
-- punto de ubicación por minuto. Supervisión los ve en el mapa del tablero
-- (Servicios → Mapa) y puede ver el recorrido del día.
--
-- Solo se guarda en horario de trabajo: lunes a viernes que no sean
-- festivos, entre la entrada y la salida de la jornada (Personal →
-- Jornadas), o mientras el técnico tenga un servicio abierto (horas extra).
-- La base rechaza cualquier punto fuera de eso, aunque el teléfono lo mande.
-- Los puntos de más de 90 días se borran solos cada noche.
--
-- Ejecutar completo en el SQL Editor de Supabase. Aditivo e idempotente.

create table if not exists public.ubicaciones_tecnicos (
  id bigint generated always as identity primary key,
  tecnico_id uuid not null references public.profiles(id) on delete cascade,
  registrado_en timestamptz not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  precision_m real,
  velocidad_ms real,
  bateria smallint check (bateria between 0 and 100),
  recibido_en timestamptz not null default now()
);

create index if not exists ubicaciones_tecnicos_tecnico_fecha
  on public.ubicaciones_tecnicos (tecnico_id, registrado_en desc);

-- Solo supervisión lee. Nadie escribe directo: los puntos entran por
-- registrar_ubicaciones, que revisa el horario.
alter table public.ubicaciones_tecnicos enable row level security;

drop policy if exists "Supervisión ve las ubicaciones" on public.ubicaciones_tecnicos;
create policy "Supervisión ve las ubicaciones" on public.ubicaciones_tecnicos
  for select using (public.get_my_role() = 'supervisor');

-- ¿Se puede rastrear a este técnico en este momento? Hora de México.
create or replace function public.rastreo_permitido(p_tecnico uuid, p_momento timestamptz)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_local timestamp := p_momento at time zone 'America/Mexico_City';
  v_fecha date := v_local::date;
  v_inicio time := '08:00';
  v_fin time := '18:00';
begin
  -- Horas extra: con un servicio abierto ese día siempre cuenta.
  if exists (
    select 1
    from public.servicios_programados sp
    join public.servicio_tecnicos st on st.servicio_id = sp.id
    where st.tecnico_id = p_tecnico
      and sp.fecha = v_fecha
      and sp.estado in ('en_sitio', 'en_curso')
  ) then
    return true;
  end if;

  -- Sábado (6) y domingo (7) no.
  if extract(isodow from v_local) > 5 then
    return false;
  end if;

  if exists (
    select 1 from public.dias_festivos f
    where f.fecha = v_fecha and f.tipo in ('oficial', 'empresa')
  ) then
    return false;
  end if;

  select a.jornada_inicio, a.jornada_fin into v_inicio, v_fin
  from public.ajustes_operacion a
  limit 1;

  return v_local::time >= coalesce(v_inicio, '08:00') and v_local::time < coalesce(v_fin, '18:00');
end;
$$;

-- El teléfono pregunta esto para prender o apagar el GPS (ahorra batería).
create or replace function public.rastreo_activo_ahora()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.rastreo_permitido(auth.uid(), now());
$$;

-- Guarda los puntos que manda el teléfono (pueden venir varios juntos si
-- estuvo sin señal). Ignora los que estén fuera de horario, los de más de
-- 24 horas y los del futuro. Devuelve cuántos guardó.
create or replace function public.registrar_ubicaciones(p_puntos jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_punto jsonb;
  v_momento timestamptz;
  v_guardados integer := 0;
begin
  if v_yo is null then
    raise exception 'Sin sesión';
  end if;
  if jsonb_typeof(p_puntos) <> 'array' or jsonb_array_length(p_puntos) > 500 then
    raise exception 'Lista de puntos inválida';
  end if;

  for v_punto in select * from jsonb_array_elements(p_puntos) loop
    begin
      v_momento := (v_punto->>'registrado_en')::timestamptz;
    exception when others then
      continue;
    end;
    if v_momento is null or v_momento < now() - interval '24 hours' or v_momento > now() + interval '5 minutes' then
      continue;
    end if;
    if not public.rastreo_permitido(v_yo, v_momento) then
      continue;
    end if;

    begin
      insert into public.ubicaciones_tecnicos (tecnico_id, registrado_en, lat, lng, precision_m, velocidad_ms, bateria)
      values (
        v_yo,
        v_momento,
        (v_punto->>'lat')::double precision,
        (v_punto->>'lng')::double precision,
        nullif(v_punto->>'precision_m', '')::real,
        nullif(v_punto->>'velocidad_ms', '')::real,
        nullif(v_punto->>'bateria', '')::smallint
      );
      v_guardados := v_guardados + 1;
    exception when others then
      -- Un punto con datos raros (lat fuera de rango, texto) no tumba a los demás.
      continue;
    end;
  end loop;

  return v_guardados;
end;
$$;

-- Última ubicación de hoy de cada técnico, con su nombre (para el mapa).
create or replace function public.ultimas_ubicaciones_hoy()
returns table (
  tecnico_id uuid, nombre text, registrado_en timestamptz,
  lat double precision, lng double precision, precision_m real, bateria smallint
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (u.tecnico_id)
    u.tecnico_id, p.full_name, u.registrado_en, u.lat, u.lng, u.precision_m, u.bateria
  from public.ubicaciones_tecnicos u
  join public.profiles p on p.id = u.tecnico_id
  where public.get_my_role() = 'supervisor'
    and u.registrado_en >= (date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City')
  order by u.tecnico_id, u.registrado_en desc;
$$;

revoke all on function public.rastreo_permitido(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.rastreo_activo_ahora() from public, anon;
revoke all on function public.registrar_ubicaciones(jsonb) from public, anon;
revoke all on function public.ultimas_ubicaciones_hoy() from public, anon;
grant execute on function public.rastreo_activo_ahora() to authenticated;
grant execute on function public.registrar_ubicaciones(jsonb) to authenticated;
grant execute on function public.ultimas_ubicaciones_hoy() to authenticated;

-- El mapa se mueve solo cuando llega un punto nuevo.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ubicaciones_tecnicos'
  ) then
    alter publication supabase_realtime add table public.ubicaciones_tecnicos;
  end if;
end $$;

-- Cada noche se borran los puntos de más de 90 días.
create or replace function public.borrar_ubicaciones_viejas()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.ubicaciones_tecnicos where registrado_en < now() - interval '90 days';
$$;
revoke all on function public.borrar_ubicaciones_viejas() from public, anon, authenticated;

-- 00:30 de México (06:30 UTC).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'borrar-ubicaciones-viejas';
    perform cron.schedule('borrar-ubicaciones-viejas', '30 6 * * *', 'select public.borrar_ubicaciones_viejas()');
  end if;
end $$;

-- Verificación: debe decir tabla = 1, funciones = 5, tiempo_real = 1.
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'ubicaciones_tecnicos') as tabla,
  (select count(*) from pg_proc where proname in ('rastreo_permitido', 'rastreo_activo_ahora', 'registrar_ubicaciones', 'ultimas_ubicaciones_hoy', 'borrar_ubicaciones_viejas')) as funciones,
  (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ubicaciones_tecnicos') as tiempo_real;
