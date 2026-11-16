-- Avance de obra: historial por equipo, reglas del flujo y revertir.
--
-- Lo que ya está marcado (lazo_planos.avance) no se toca. Desde aquí:
--   · Cada marca guarda quién, cuándo, comentario y foto opcionales, y se
--     anota en `lazo_avance_historial` (antes y después).
--   · «Probado» solo después de «Direccionado». Supervisión puede saltarlo
--     con un motivo (queda en la marca como «forzado»).
--   · «No se puede instalar» exige motivo y foto (y nota si el motivo es «Otro»).
--   · Supervisión puede revertir un cambio del historial.
--
-- Marca de un equipo (dentro de avance):
--   { estado, bloqueo?: { motivo, nota?, foto }, comentario?, foto?, forzado?, en, por, nombre }
--
-- Requiere patch_lazos_avance.sql. Se puede correr más de una vez.

create table if not exists public.lazo_avance_historial (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references public.lazo_planos(id) on delete cascade,
  equipo_id text not null,
  -- 'marca' (un cambio normal) o 'revertido' (supervisión lo regresó).
  accion text not null default 'marca' check (accion in ('marca', 'revertido')),
  antes jsonb,
  despues jsonb,
  por uuid references public.profiles(id),
  nombre text,
  en timestamptz not null default now()
);

create index if not exists lazo_avance_historial_equipo on public.lazo_avance_historial (plano_id, equipo_id, en desc);

alter table public.lazo_avance_historial enable row level security;
drop policy if exists lazo_avance_historial_leer on public.lazo_avance_historial;
create policy lazo_avance_historial_leer on public.lazo_avance_historial for select to authenticated
  using (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa());
-- Nadie escribe directo: solo las funciones de abajo.

-- Marca uno o varios equipos. Quién y con qué nombre lo pone el servidor.
-- Devuelve el avance completo, con lo que hayan marcado los demás.
create or replace function public.marcar_avance_plano(p_plano uuid, p_cambios jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_sello jsonb;
  v_avance jsonb;
  v_actual jsonb;
  v_supervisor boolean := public.get_my_role() = 'supervisor';
  cambio record;
  v_antes jsonb;
  v_nueva jsonb;
begin
  if auth.uid() is null or public.get_my_role() not in ('tecnico', 'supervisor') or not public.mi_cuenta_activa() then
    raise exception 'No tienes permiso para marcar el avance.';
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' then
    raise exception 'Cambios no válidos';
  end if;
  if (select count(*) from jsonb_object_keys(p_cambios)) > 3000 then
    raise exception 'Demasiados equipos en un solo cambio';
  end if;
  if exists (
    select 1 from jsonb_each(p_cambios) c
    where char_length(c.key) > 40
       or jsonb_typeof(c.value) <> 'object'
       or coalesce(c.value ->> 'estado', '') not in ('pendiente', 'canalizado', 'instalado', 'direccionado', 'probado')
       or char_length(coalesce(c.value -> 'bloqueo' ->> 'motivo', '')) > 60
       or char_length(coalesce(c.value -> 'bloqueo' ->> 'nota', '')) > 300
       or char_length(coalesce(c.value -> 'bloqueo' ->> 'foto', '')) > 300
       or char_length(coalesce(c.value ->> 'comentario', '')) > 300
       or char_length(coalesce(c.value ->> 'foto', '')) > 300
       or char_length(coalesce(c.value ->> 'forzado', '')) > 200
  ) then
    raise exception 'Algún estado no es válido';
  end if;

  select avance into v_actual from public.lazo_planos where id = p_plano for update;
  if not found then
    raise exception 'No existe ese plano o no tienes permiso';
  end if;

  select full_name into v_nombre from public.profiles where id = auth.uid();
  v_sello := jsonb_build_object('por', auth.uid(), 'nombre', coalesce(v_nombre, ''));

  for cambio in select key, value from jsonb_each(p_cambios) loop
    v_antes := v_actual -> cambio.key;
    -- Probado sin pasar por Direccionado: solo supervisión, con motivo.
    if cambio.value ->> 'estado' = 'probado'
       and coalesce(v_antes ->> 'estado', 'pendiente') not in ('direccionado', 'probado')
       and not (v_supervisor and char_length(trim(coalesce(cambio.value ->> 'forzado', ''))) >= 3)
       -- Si ya estuvo probado (p. ej. «Deshacer» de un paso atrás), se puede regresar.
       and not exists (
         select 1 from public.lazo_avance_historial h
          where h.plano_id = p_plano and h.equipo_id = cambio.key and h.despues ->> 'estado' = 'probado'
       ) then
      raise exception 'Para marcar «Probado» primero debe estar «Direccionado». Supervisión puede autorizarlo con un motivo.';
    end if;
    -- «No se puede instalar» nuevo o cambiado: motivo, foto y, con «Otro», nota.
    if jsonb_typeof(cambio.value -> 'bloqueo') = 'object' and (v_antes -> 'bloqueo') is distinct from (cambio.value -> 'bloqueo') then
      if char_length(trim(coalesce(cambio.value -> 'bloqueo' ->> 'motivo', ''))) = 0 then
        raise exception 'Elige por qué no se puede instalar.';
      end if;
      if coalesce(cambio.value -> 'bloqueo' ->> 'foto', '') not like 'lazos/%' then
        raise exception '«No se puede instalar» necesita la foto de evidencia.';
      end if;
      if cambio.value -> 'bloqueo' ->> 'motivo' = 'Otro' and char_length(trim(coalesce(cambio.value -> 'bloqueo' ->> 'nota', ''))) < 3 then
        raise exception 'Con «Otro», escribe qué impide instalarlo.';
      end if;
    end if;
    if coalesce(cambio.value ->> 'foto', '') <> '' and cambio.value ->> 'foto' not like 'lazos/%' then
      raise exception 'La foto no es válida.';
    end if;

    v_nueva := cambio.value || v_sello;
    v_actual := jsonb_set(v_actual, array[cambio.key], v_nueva, true);
    insert into public.lazo_avance_historial (plano_id, equipo_id, accion, antes, despues, por, nombre)
    values (p_plano, cambio.key, 'marca', v_antes, v_nueva, auth.uid(), v_nombre);
  end loop;

  update public.lazo_planos set avance = v_actual where id = p_plano returning avance into v_avance;
  return v_avance;
end;
$$;

revoke all on function public.marcar_avance_plano(uuid, jsonb) from public, anon;
grant execute on function public.marcar_avance_plano(uuid, jsonb) to authenticated;

-- Supervisión regresa un equipo a como estaba antes de un cambio del historial.
create or replace function public.revertir_avance(p_historial uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.lazo_avance_historial;
  v_actual jsonb;
  v_avance jsonb;
  v_nombre text;
begin
  if auth.uid() is null or public.get_my_role() <> 'supervisor' or not public.mi_cuenta_activa() then
    raise exception 'Solo supervisión puede revertir el avance.';
  end if;
  select * into h from public.lazo_avance_historial where id = p_historial;
  if not found then
    raise exception 'No se encontró ese cambio.';
  end if;
  select avance into v_actual from public.lazo_planos where id = h.plano_id for update;
  select full_name into v_nombre from public.profiles where id = auth.uid();

  insert into public.lazo_avance_historial (plano_id, equipo_id, accion, antes, despues, por, nombre)
  values (h.plano_id, h.equipo_id, 'revertido', v_actual -> h.equipo_id, h.antes, auth.uid(), v_nombre);

  if h.antes is null then
    v_actual := v_actual - h.equipo_id;
  else
    v_actual := jsonb_set(v_actual, array[h.equipo_id], h.antes, true);
  end if;
  update public.lazo_planos set avance = v_actual where id = h.plano_id returning avance into v_avance;
  return v_avance;
end;
$$;

revoke all on function public.revertir_avance(uuid) from public, anon;
grant execute on function public.revertir_avance(uuid) to authenticated;

-- Verificación: tabla = 1, funciones = 2.
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'lazo_avance_historial') as tabla,
  (select count(*) from pg_proc where proname in ('marcar_avance_plano', 'revertir_avance')) as funciones;
