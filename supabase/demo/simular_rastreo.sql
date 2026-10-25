-- SOLO PARA LA INSTALACIÓN DEMO. Simula el rastreo de 6 técnicos para que
-- quien prueba el demo vea el mapa de técnicos con recorridos reales:
--   · demo_simular_rastreo(): borra lo simulado y llena los últimos 5 días
--     hábiles completos (8:00 a 18:00) y hoy hasta este minuto. Corre cada
--     noche después del reinicio del demo.
--   · demo_rastreo_ahora(): cada minuto agrega el punto que toca hoy, así en
--     «Hoy» se ven moviéndose y «en línea».
-- Cada técnico sale de la oficina, visita 2 o 3 sitios de la zona
-- metropolitana de Guadalajara (se queda un rato en cada uno) y al final se
-- va a su casa (cada quien vive en otro rumbo: al cierre no quedan encimados).
-- El recorrido de un técnico en un día siempre sale igual (se calcula a partir
-- del técnico y la fecha), así lo que se agrega cada minuto continúa lo que ya
-- estaba. Ejecutar completo en el SQL Editor del proyecto DEMO. Idempotente.

-- Número entre 0 y 1 que siempre sale igual para el mismo texto.
create or replace function public.demo_azar(p_texto text)
returns double precision
language sql
immutable
as $$
  select ((hashtext(p_texto)::bigint & 2147483647)::double precision / 2147483647);
$$;

-- Agrega los puntos de un técnico en un día, minuto a minuto de 8:00 a 18:00,
-- sin pasar de p_hasta y sin repetir los que ya existen.
create or replace function public.demo_rastreo_dia(p_tecnico uuid, p_dia date, p_hasta timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  zona constant text := 'America/Mexico_City';
  -- Oficina (Providencia) y sitios de clientes en la zona metropolitana.
  base_lat constant double precision := 20.6905;
  base_lng constant double precision := -103.3880;
  sitios_lat constant double precision[] := array[20.7105, 20.6767, 20.6409, 20.6235, 20.6503, 20.6735, 20.6290, 20.7380, 20.6930, 20.6380, 20.7230, 20.6610];
  sitios_lng constant double precision[] := array[-103.4120, -103.3475, -103.3117, -103.2420, -103.4013, -103.3720, -103.3570, -103.3910, -103.2970, -103.4200, -103.3560, -103.3290];
  semilla text := p_tecnico::text || p_dia::text;
  -- Tramos del día: minuto de inicio y de fin (desde las 8:00), de dónde a dónde y si va en camino.
  t_ini integer[] := '{}'; t_fin integer[] := '{}';
  t_lat1 double precision[] := '{}'; t_lng1 double precision[] := '{}';
  t_lat2 double precision[] := '{}'; t_lng2 double precision[] := '{}';
  t_mueve boolean[] := '{}';
  minuto integer; paradas integer; i integer; k integer; sitio integer;
  lat_act double precision; lng_act double precision; lat_sig double precision; lng_sig double precision;
  km double precision; viaje integer; estancia integer;
  desde_min integer; hasta_min integer; ultimo timestamptz;
  f double precision; c double precision; lat double precision; lng double precision; vel real;
  casa_lat double precision; casa_lng double precision;
  insertados integer := 0;
begin
  -- Cada técnico arranca entre 8:00 y 8:20, en la oficina.
  minuto := floor(demo_azar(semilla || 'arranque') * 20)::integer;
  lat_act := base_lat; lng_act := base_lng;
  t_ini := t_ini || 0; t_fin := t_fin || minuto;
  t_lat1 := t_lat1 || lat_act; t_lng1 := t_lng1 || lng_act; t_lat2 := t_lat2 || lat_act; t_lng2 := t_lng2 || lng_act;
  t_mueve := t_mueve || false;

  paradas := case when demo_azar(semilla || 'paradas') < 0.5 then 2 else 3 end;
  for i in 1..paradas loop
    sitio := 1 + floor(demo_azar(semilla || 'sitio' || i) * array_length(sitios_lat, 1))::integer;
    lat_sig := sitios_lat[sitio] + (demo_azar(semilla || 'dlat' || i) - 0.5) * 0.004;
    lng_sig := sitios_lng[sitio] + (demo_azar(semilla || 'dlng' || i) - 0.5) * 0.004;
    -- Unos 25 km/h en ciudad, con un mínimo de 12 minutos.
    km := 111 * sqrt(power(lat_sig - lat_act, 2) + power((lng_sig - lng_act) * 0.94, 2));
    viaje := greatest(12, round(km * 2.4 + 5)::integer);
    estancia := 50 + floor(demo_azar(semilla || 'estancia' || i) * 100)::integer;
    t_ini := t_ini || minuto; t_fin := t_fin || minuto + viaje;
    t_lat1 := t_lat1 || lat_act; t_lng1 := t_lng1 || lng_act; t_lat2 := t_lat2 || lat_sig; t_lng2 := t_lng2 || lng_sig;
    t_mueve := t_mueve || true;
    minuto := minuto + viaje;
    t_ini := t_ini || minuto; t_fin := t_fin || minuto + estancia;
    t_lat1 := t_lat1 || lat_sig; t_lng1 := t_lng1 || lng_sig; t_lat2 := t_lat2 || lat_sig; t_lng2 := t_lng2 || lng_sig;
    t_mueve := t_mueve || false;
    minuto := minuto + estancia;
    lat_act := lat_sig; lng_act := lng_sig;
  end loop;

  -- Al terminar, a su casa (siempre la misma para cada técnico, a unos 3-6 km de la oficina).
  casa_lat := base_lat + (demo_azar(p_tecnico::text || 'casa-lat') - 0.5) * 0.11;
  casa_lng := base_lng + (demo_azar(p_tecnico::text || 'casa-lng') - 0.5) * 0.11;
  km := 111 * sqrt(power(casa_lat - lat_act, 2) + power((casa_lng - lng_act) * 0.94, 2));
  viaje := greatest(12, round(km * 2.4 + 5)::integer);
  t_ini := t_ini || minuto; t_fin := t_fin || minuto + viaje;
  t_lat1 := t_lat1 || lat_act; t_lng1 := t_lng1 || lng_act; t_lat2 := t_lat2 || casa_lat; t_lng2 := t_lng2 || casa_lng;
  t_mueve := t_mueve || true;
  minuto := minuto + viaje;
  t_ini := t_ini || minuto; t_fin := t_fin || 100000;
  t_lat1 := t_lat1 || casa_lat; t_lng1 := t_lng1 || casa_lng; t_lat2 := t_lat2 || casa_lat; t_lng2 := t_lng2 || casa_lng;
  t_mueve := t_mueve || false;

  -- Qué minutos faltan: desde el siguiente al último guardado hasta p_hasta (máximo 18:00).
  select max(registrado_en) into ultimo from ubicaciones_tecnicos
  where tecnico_id = p_tecnico and registrado_en >= (p_dia + time '00:00') at time zone zona
    and registrado_en < (p_dia + 1 + time '00:00') at time zone zona;
  desde_min := 0;
  if ultimo is not null then
    desde_min := floor(extract(epoch from (ultimo - (p_dia + time '08:00') at time zone zona)) / 60)::integer + 1;
  end if;
  hasta_min := 600;
  if p_hasta < (p_dia + time '18:00') at time zone zona then
    hasta_min := floor(extract(epoch from (p_hasta - (p_dia + time '08:00') at time zone zona)) / 60)::integer;
  end if;

  for minuto in desde_min..hasta_min loop
    k := 1;
    while k < array_length(t_ini, 1) and minuto >= t_fin[k] loop
      k := k + 1;
    end loop;
    if t_mueve[k] then
      -- En camino: en escalón (un tramo sobre una calle, vuelta, tramo sobre
      -- la otra…), como cuando se avanza por avenidas. `c` dice dónde da la vuelta.
      f := (minuto - t_ini[k])::double precision / greatest(1, t_fin[k] - t_ini[k]);
      c := 0.3 + demo_azar(semilla || 'vuelta' || k) * 0.4;
      if f < 0.25 then
        lat := t_lat1[k] + (t_lat2[k] - t_lat1[k]) * c * (f / 0.25);
        lng := t_lng1[k];
      elsif f < 0.5 then
        lat := t_lat1[k] + (t_lat2[k] - t_lat1[k]) * c;
        lng := t_lng1[k] + (t_lng2[k] - t_lng1[k]) * c * ((f - 0.25) / 0.25);
      elsif f < 0.75 then
        lat := t_lat1[k] + (t_lat2[k] - t_lat1[k]) * (c + (1 - c) * ((f - 0.5) / 0.25));
        lng := t_lng1[k] + (t_lng2[k] - t_lng1[k]) * c;
      else
        lat := t_lat2[k];
        lng := t_lng1[k] + (t_lng2[k] - t_lng1[k]) * (c + (1 - c) * ((f - 0.75) / 0.25));
      end if;
      lat := lat + (demo_azar(semilla || 'j' || minuto) - 0.5) * 0.00015;
      lng := lng + (demo_azar(semilla || 'k' || minuto) - 0.5) * 0.00015;
      vel := (6 + demo_azar(semilla || 'v' || minuto) * 8)::real;
    else
      -- Detenido: el GPS rebota unos metros alrededor del lugar.
      lat := t_lat1[k] + (demo_azar(semilla || 'j' || minuto) - 0.5) * 0.0002;
      lng := t_lng1[k] + (demo_azar(semilla || 'k' || minuto) - 0.5) * 0.0002;
      vel := 0;
    end if;
    insert into ubicaciones_tecnicos (tecnico_id, registrado_en, lat, lng, precision_m, velocidad_ms, bateria)
    values (p_tecnico, (p_dia + time '08:00' + minuto * interval '1 minute') at time zone zona, lat, lng,
            (5 + demo_azar(semilla || 'p' || minuto) * 10)::real, vel, greatest(25, 100 - minuto / 9)::smallint);
    insertados := insertados + 1;
  end loop;
  return insertados;
end;
$$;

-- Los 6 técnicos que «tienen teléfono de la empresa» en el demo.
create or replace function public.demo_tecnicos_rastreados()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles
  where role = 'tecnico' and activo
    and full_name in ('Carlos Mendoza', 'Daniel Ortiz', 'Fernando Aguilar', 'Adriana Fuentes', 'Miguel Torres', 'Rebeca Peña');
$$;

-- Cada noche: borra lo simulado y vuelve a llenar los últimos 5 días hábiles y hoy hasta ahora.
create or replace function public.demo_simular_rastreo()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  zona constant text := 'America/Mexico_City';
  hoy date := (now() at time zone zona)::date;
  dia date := hoy;
  dias date[] := '{}';
  tec uuid;
  total integer := 0;
begin
  if not exists (select 1 from public.demo_accesos) then
    raise exception 'demo_simular_rastreo() solo corre en la instalación demo';
  end if;
  delete from ubicaciones_tecnicos where tecnico_id in (select demo_tecnicos_rastreados());
  -- Los 5 días hábiles anteriores a hoy (de lunes a viernes).
  while array_length(dias, 1) is null or array_length(dias, 1) < 5 loop
    dia := dia - 1;
    if extract(isodow from dia) <= 5 then
      dias := dias || dia;
    end if;
  end loop;
  for tec in select demo_tecnicos_rastreados() loop
    foreach dia in array dias loop
      total := total + demo_rastreo_dia(tec, dia, 'infinity');
    end loop;
    if extract(isodow from hoy) <= 5 then
      total := total + demo_rastreo_dia(tec, hoy, now());
    end if;
  end loop;
  return total || ' puntos simulados';
end;
$$;

-- Cada minuto: el punto de hoy de cada técnico (de lunes a viernes, de 8 a 18).
create or replace function public.demo_rastreo_ahora()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  zona constant text := 'America/Mexico_City';
  hoy date := (now() at time zone zona)::date;
  tec uuid;
  total integer := 0;
begin
  if not exists (select 1 from public.demo_accesos) then
    return 0;
  end if;
  if extract(isodow from hoy) > 5 then
    return 0;
  end if;
  for tec in select demo_tecnicos_rastreados() loop
    total := total + demo_rastreo_dia(tec, hoy, now());
  end loop;
  return total;
end;
$$;

-- Solo el servidor (cron) las usa.
revoke all on function public.demo_rastreo_dia(uuid, date, timestamptz) from public, anon, authenticated;
revoke all on function public.demo_simular_rastreo() from public, anon, authenticated;
revoke all on function public.demo_rastreo_ahora() from public, anon, authenticated;
revoke all on function public.demo_tecnicos_rastreados() from public, anon, authenticated;

-- Tareas: cada noche después del reinicio (00:08 hora de México) y cada minuto.
select cron.unschedule(jobid) from cron.job where jobname in ('demo-rastreo-dias', 'demo-rastreo-vivo');
select cron.schedule('demo-rastreo-dias', '8 6 * * *', 'select public.demo_simular_rastreo()');
select cron.schedule('demo-rastreo-vivo', '* * * * *', 'select public.demo_rastreo_ahora()');

-- Llenar ya.
select public.demo_simular_rastreo();
