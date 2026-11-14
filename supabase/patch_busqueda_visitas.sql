-- ============================================================
-- Buscador de visitas en el mapa de técnicos
-- ============================================================
-- Para contestar «¿qué días fueron con este cliente?» y «¿dónde estuvo este
-- técnico?» cruzando lo registrado (servicios y reportes) con el rastreo.
--
--   1. clientes.ubicacion / radio_m: dónde está el cliente y a qué distancia
--      cuenta como «estuvo ahí». 200 m por defecto: cubre una nave o una
--      plaza sin tomar al vecino. Se captura en la ficha del cliente y llena
--      sola la ubicación al agendar un servicio.
--   2. visitas_gps: días en que un técnico estuvo cerca de alguno de los
--      lugares que se le pasan (los del cliente), con llegada, salida y
--      minutos. La cuenta se hace en la base: son un punto por minuto.
--   3. puntos_de_tecnico: el recorrido de UN técnico en un rango corto, en
--      formato compacto, para detectar sus paradas en la app.
--
-- Solo supervisión: las dos funciones leen ubicaciones_tecnicos con los
-- permisos de quien llama (su política ya limita a supervisores).
--
-- Requiere patch_ubicacion_tecnicos.sql. Ejecutar completo. Idempotente.

alter table public.clientes
  add column if not exists ubicacion jsonb,
  add column if not exists radio_m integer not null default 200;

alter table public.clientes drop constraint if exists clientes_ubicacion_valida;
alter table public.clientes add constraint clientes_ubicacion_valida check (
  radio_m between 50 and 2000
  and (
    ubicacion is null
    or (
      jsonb_typeof(ubicacion -> 'lat') = 'number' and jsonb_typeof(ubicacion -> 'lng') = 'number'
      and (ubicacion ->> 'lat')::numeric between -90 and 90
      and (ubicacion ->> 'lng')::numeric between -180 and 180
    )
  )
);

comment on column public.clientes.ubicacion is 'Punto {lat, lng, direccion?} del cliente, para el buscador de visitas y para llenar la ubicación al agendar.';
comment on column public.clientes.radio_m is 'Metros alrededor de la ubicación que cuentan como «estuvo con el cliente».';

-- p_lugares: [{ "lat", "lng", "radio" }, ...]. Días en hora de México.
create or replace function public.visitas_gps(p_lugares jsonb, p_desde date, p_hasta date)
returns table (tecnico_id uuid, fecha date, llegada timestamptz, salida timestamptz, minutos integer)
language sql
stable
security invoker
set search_path = public
as $$
  with lugares as (
    select (l ->> 'lat')::double precision as lat,
           (l ->> 'lng')::double precision as lng,
           least(greatest(coalesce((l ->> 'radio')::double precision, 200), 30), 2000) as radio
    from jsonb_array_elements(case when jsonb_typeof(p_lugares) = 'array' then p_lugares else '[]'::jsonb end) l
    limit 50
  )
  select u.tecnico_id,
         (u.registrado_en at time zone 'America/Mexico_City')::date as fecha,
         min(u.registrado_en) as llegada,
         max(u.registrado_en) as salida,
         count(distinct date_trunc('minute', u.registrado_en))::integer as minutos
  from public.ubicaciones_tecnicos u
  where u.registrado_en >= (p_desde::timestamp at time zone 'America/Mexico_City')
    and u.registrado_en < ((p_hasta + 1)::timestamp at time zone 'America/Mexico_City')
    and p_hasta - p_desde <= 120
    and exists (
      select 1 from lugares g
      -- Distancia aproximada en metros (suficiente a esta escala).
      where 111320 * sqrt(power(u.lat - g.lat, 2) + power((u.lng - g.lng) * cos(radians(g.lat)), 2)) <= g.radio
    )
  group by 1, 2
  order by 2 desc, 1;
$$;

revoke all on function public.visitas_gps(jsonb, date, date) from public;
grant execute on function public.visitas_gps(jsonb, date, date) to authenticated;

-- Recorrido compacto: [[segundos, lat, lng], ...] del más viejo al más nuevo.
-- Máximo 31 días por consulta (unos 20 mil puntos).
create or replace function public.puntos_de_tecnico(p_tecnico uuid, p_desde date, p_hasta date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_array(extract(epoch from u.registrado_en)::bigint, round(u.lat::numeric, 6), round(u.lng::numeric, 6)) order by u.registrado_en), '[]'::jsonb)
  from public.ubicaciones_tecnicos u
  where u.tecnico_id = p_tecnico
    and u.registrado_en >= (p_desde::timestamp at time zone 'America/Mexico_City')
    and u.registrado_en < ((p_hasta + 1)::timestamp at time zone 'America/Mexico_City')
    and p_hasta - p_desde <= 31;
$$;

revoke all on function public.puntos_de_tecnico(uuid, date, date) from public;
grant execute on function public.puntos_de_tecnico(uuid, date, date) to authenticated;

-- Verificación: debe devolver 2 y 2.
-- select (select count(*) from information_schema.columns where table_name = 'clientes' and column_name in ('ubicacion', 'radio_m')),
--        (select count(*) from pg_proc where proname in ('visitas_gps', 'puntos_de_tecnico'));
