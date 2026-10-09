-- ============================================================
-- Control de pausas (hora de comida) y de presencia en sitio
-- ============================================================
-- Antes una pausa solo guardaba un motivo en texto y podía durar lo que
-- fuera sin que nadie se enterara. Con esto:
--
--   1. Cada pausa tiene tipo (comida, compra de material, espera del
--      cliente…) y un tiempo permitido, que supervisión configura.
--   2. Un cron cada 2 minutos recuerda al técnico que su pausa está por
--      terminar / ya terminó, y avisa a supervisión si se excede.
--   3. Se registra cuando la app detecta al técnico fuera del sitio con el
--      servicio en curso (evento 'salida_sitio').
--   4. Supervisión puede pedir una verificación de presencia: el técnico
--      tiene unos minutos para responder y la base compara su ubicación con
--      el sitio.
--
-- Ejecutar completo en el SQL Editor de Supabase. Aditivo e idempotente.

-- ---------- 1) Ajustes de operación (una sola fila) ----------
create table if not exists public.ajustes_operacion (
  id boolean primary key default true check (id),
  comida_min integer not null default 60 check (comida_min between 10 and 240),
  otras_pausas_min integer not null default 30 check (otras_pausas_min between 5 and 240),
  tolerancia_min integer not null default 15 check (tolerancia_min between 0 and 120),
  verificacion_min integer not null default 10 check (verificacion_min between 3 and 60),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references public.profiles(id)
);
insert into public.ajustes_operacion (id) values (true) on conflict (id) do nothing;

alter table public.ajustes_operacion enable row level security;
drop policy if exists ajustes_operacion_leer on public.ajustes_operacion;
create policy ajustes_operacion_leer on public.ajustes_operacion
  for select to authenticated using (true);
drop policy if exists ajustes_operacion_supervisor on public.ajustes_operacion;
create policy ajustes_operacion_supervisor on public.ajustes_operacion
  for update to authenticated
  using (public.get_my_role() = 'supervisor')
  with check (public.get_my_role() = 'supervisor');

-- ---------- 2) La pausa en curso y el detalle de cada pausa ----------
alter table public.servicios_programados
  add column if not exists pausa_tipo text,
  add column if not exists pausa_limite_min integer,
  -- Qué recordatorios ya se mandaron de la pausa en curso:
  -- 0 ninguno · 1 «por terminar» · 2 «terminó» · 3 «excedida» (y supervisión).
  add column if not exists pausa_avisos smallint not null default 0;

alter table public.servicio_eventos
  add column if not exists pausa_tipo text,
  add column if not exists limite_min integer,
  add column if not exists minutos integer,
  -- Reanudó lejos del sitio, o la app lo detectó fuera con el servicio en curso.
  add column if not exists fuera_sitio boolean not null default false;

alter table public.servicio_eventos drop constraint if exists servicio_eventos_tipo_check;
alter table public.servicio_eventos
  add constraint servicio_eventos_tipo_check
  check (tipo in ('llegada', 'inicio', 'retraso', 'evidencia', 'cierre', 'avance', 'pausa', 'reanudacion', 'salida_sitio'));

-- ---------- 3) Verificación de presencia ----------
create table if not exists public.verificaciones_presencia (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios_programados(id) on delete cascade,
  tecnico_id uuid not null references public.profiles(id) on delete cascade,
  pedida_por uuid references public.profiles(id),
  pedida_en timestamptz not null default now(),
  vence_en timestamptz not null,
  respondida_en timestamptz,
  ubicacion jsonb,
  distancia_m integer,
  resultado text not null default 'pendiente'
    check (resultado in ('pendiente', 'en_sitio', 'fuera', 'sin_ubicacion', 'sin_respuesta')),
  aviso_vencida boolean not null default false
);
create index if not exists verificaciones_presencia_servicio_idx on public.verificaciones_presencia (servicio_id, pedida_en desc);
create index if not exists verificaciones_presencia_tecnico_idx on public.verificaciones_presencia (tecnico_id, resultado);

alter table public.verificaciones_presencia enable row level security;
drop policy if exists verificaciones_supervisor on public.verificaciones_presencia;
create policy verificaciones_supervisor on public.verificaciones_presencia
  for all to authenticated
  using (public.get_my_role() = 'supervisor')
  with check (public.get_my_role() = 'supervisor');
-- El técnico solo lee las suyas; responder pasa por la función de abajo,
-- para que el resultado lo calcule la base y no el teléfono.
drop policy if exists verificaciones_tecnico_leer on public.verificaciones_presencia;
create policy verificaciones_tecnico_leer on public.verificaciones_presencia
  for select to authenticated using (tecnico_id = auth.uid());

-- Distancia en metros entre dos puntos (haversine).
create or replace function public.distancia_metros(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

-- El técnico responde «Estoy aquí». Sin coordenadas (permiso negado o sin
-- GPS) queda como 'sin_ubicacion': respondió, pero no se pudo comprobar.
create or replace function public.responder_verificacion(p_id uuid, p_lat double precision, p_lng double precision, p_precision integer default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.verificaciones_presencia%rowtype;
  sitio jsonb;
  radio integer;
  d integer;
  r text;
begin
  select * into v from public.verificaciones_presencia where id = p_id for update;
  if not found or v.tecnico_id <> auth.uid() then
    raise exception 'Verificación no encontrada';
  end if;
  if v.resultado <> 'pendiente' then
    return v.resultado;
  end if;
  if v.vence_en < now() then
    update public.verificaciones_presencia set resultado = 'sin_respuesta' where id = p_id;
    return 'sin_respuesta';
  end if;

  select s.ubicacion_programada, coalesce(s.radio_geocerca_m, 120) into sitio, radio
    from public.servicios_programados s where s.id = v.servicio_id;

  if p_lat is null or p_lng is null then
    r := 'sin_ubicacion';
  elsif sitio is null or sitio->>'lat' is null then
    -- El servicio no tiene ubicación programada: se guarda dónde respondió,
    -- pero no hay contra qué comparar.
    r := 'sin_ubicacion';
  else
    d := round(public.distancia_metros(p_lat, p_lng, (sitio->>'lat')::double precision, (sitio->>'lng')::double precision));
    -- La imprecisión del GPS juega a favor del técnico.
    r := case when d - coalesce(p_precision, 0) <= radio + 80 then 'en_sitio' else 'fuera' end;
  end if;

  update public.verificaciones_presencia
     set respondida_en = now(),
         ubicacion = case when p_lat is null then null else jsonb_build_object('lat', p_lat, 'lng', p_lng, 'accuracy', p_precision) end,
         distancia_m = d,
         resultado = r
   where id = p_id;
  return r;
end;
$$;

revoke all on function public.responder_verificacion(uuid, double precision, double precision, integer) from public, anon;
grant execute on function public.responder_verificacion(uuid, double precision, double precision, integer) to authenticated;

-- ---------- 4) Cron de recordatorios de pausa (cada 2 min) ----------
-- Reutiliza la llamada del cron de recordatorios que ya existe (misma URL
-- base y mismo secreto), cambiando solo la ruta. Así no hay que volver a
-- pegar el secreto aquí.
do $$
declare
  c text;
begin
  select replace(command, '/api/cron/recordatorios', '/api/cron/pausas') into c
    from cron.job where jobname = 'recordatorios-iniciar-servicio';
  if c is null then
    raise notice 'No existe el cron «recordatorios-iniciar-servicio»: los recordatorios de pausa no quedan programados.';
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'recordatorios-pausa') then
    perform cron.unschedule('recordatorios-pausa');
  end if;
  perform cron.schedule('recordatorios-pausa', '*/2 * * * *', c);
end $$;

-- Verificación: debe devolver ajustes = 1, columnas = 7, tabla = 1, cron = 1.
select
  (select count(*) from public.ajustes_operacion) as ajustes,
  (select count(*) from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'servicios_programados' and column_name in ('pausa_tipo', 'pausa_limite_min', 'pausa_avisos'))
        or (table_name = 'servicio_eventos' and column_name in ('pausa_tipo', 'limite_min', 'minutos', 'fuera_sitio')))) as columnas,
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'verificaciones_presencia') as tabla,
  (select count(*) from cron.job where jobname = 'recordatorios-pausa') as cron;
