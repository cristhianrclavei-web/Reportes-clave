-- ============================================================
-- Rastreo: el teléfono manda los puntos por su cuenta
-- ============================================================
-- Antes los puntos pasaban por la página web dentro de la app, y Android
-- congela la página cuando la pantalla se apaga un rato: los puntos dejaban
-- de llegar. Ahora el servicio nativo del teléfono los manda directo, con
-- una «llave de rastreo» propia del teléfono (no la sesión del usuario).
--
-- · crear_llave_rastreo(): la app la pide al abrir con la sesión del
--   técnico. Cada técnico tiene una sola llave vigente; pedir otra anula la
--   anterior. En la base solo se guarda su huella (sha256), no la llave.
-- · ubicaciones_por_llave(llave, puntos): guarda los puntos (mismas reglas
--   de horario que registrar_ubicaciones) y responde si toca tener el GPS
--   prendido ahora. Con una lista vacía sirve solo para preguntar.
--
-- Requiere patch_ubicacion_tecnicos.sql. Aditivo e idempotente.

create table if not exists public.rastreo_llaves (
  tecnico_id uuid primary key references public.profiles(id) on delete cascade,
  llave_hash text not null unique,
  creada_en timestamptz not null default now()
);

-- Nadie la lee ni la escribe directo: solo las funciones de abajo.
alter table public.rastreo_llaves enable row level security;

-- Lo que antes hacía registrar_ubicaciones por dentro, ahora para
-- cualquier técnico. Interna: no se puede llamar desde la app.
create or replace function public.guardar_ubicaciones_de(p_tecnico uuid, p_puntos jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_punto jsonb;
  v_momento timestamptz;
  v_guardados integer := 0;
begin
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
    if not public.rastreo_permitido(p_tecnico, v_momento) then
      continue;
    end if;

    begin
      insert into public.ubicaciones_tecnicos (tecnico_id, registrado_en, lat, lng, precision_m, velocidad_ms, bateria)
      values (
        p_tecnico,
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

-- Igual que antes, pero usando la función de arriba.
create or replace function public.registrar_ubicaciones(p_puntos jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sin sesión';
  end if;
  return public.guardar_ubicaciones_de(auth.uid(), p_puntos);
end;
$$;

create or replace function public.crear_llave_rastreo()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_llave text;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión';
  end if;
  -- Dos uuid aleatorios: 244 bits al azar.
  v_llave := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.rastreo_llaves (tecnico_id, llave_hash, creada_en)
  values (auth.uid(), encode(sha256(convert_to(v_llave, 'UTF8')), 'hex'), now())
  on conflict (tecnico_id) do update set llave_hash = excluded.llave_hash, creada_en = excluded.creada_en;
  return v_llave;
end;
$$;

-- null = llave desconocida o usuario dado de baja; el teléfono apaga el GPS
-- hasta que alguien vuelva a abrir la app con su sesión.
create or replace function public.ubicaciones_por_llave(p_llave text, p_puntos jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tecnico uuid;
begin
  if p_llave is null or length(p_llave) < 40 then
    return null;
  end if;
  select l.tecnico_id into v_tecnico
  from public.rastreo_llaves l
  join public.profiles p on p.id = l.tecnico_id
  where l.llave_hash = encode(sha256(convert_to(p_llave, 'UTF8')), 'hex')
    and coalesce(p.activo, true);
  if v_tecnico is null then
    return null;
  end if;

  perform public.guardar_ubicaciones_de(v_tecnico, coalesce(p_puntos, '[]'::jsonb));
  return public.rastreo_permitido(v_tecnico, now());
end;
$$;

revoke all on function public.guardar_ubicaciones_de(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.crear_llave_rastreo() from public, anon;
revoke all on function public.ubicaciones_por_llave(text, jsonb) from public;
grant execute on function public.crear_llave_rastreo() to authenticated;
-- El servicio del teléfono llama sin sesión: la llave es la que identifica.
grant execute on function public.ubicaciones_por_llave(text, jsonb) to anon, authenticated;

-- Verificación: debe decir tabla = 1, funciones = 3.
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'rastreo_llaves') as tabla,
  (select count(*) from pg_proc where proname in ('guardar_ubicaciones_de', 'crear_llave_rastreo', 'ubicaciones_por_llave')) as funciones;
