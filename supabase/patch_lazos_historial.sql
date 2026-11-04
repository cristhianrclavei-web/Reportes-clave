-- ============================================================
-- Historial de cambios de lazos y circuitos
-- ============================================================
-- Cada alta, corrección y borrado en un lazo (sus datos, sus dispositivos,
-- las búsquedas de falla y los cortes) queda anotado con quién y cuándo, y
-- solo los campos que cambiaron (antes y después). Lo anota la propia base
-- con disparadores: no depende de la app, y también cubre lo que se capturó
-- sin señal y subió después.
--
-- Nadie escribe ni borra el historial a mano: solo se lee. Si se borra un
-- lazo completo, su historial se borra con él.
--
-- Requiere patch_lazos.sql. Ejecutar completo en el SQL Editor. Idempotente.

create table if not exists public.lazo_historial (
  id uuid primary key default gen_random_uuid(),
  -- Sin llave foránea a propósito: el renglón de un dispositivo borrado
  -- tiene que quedarse.
  lazo_id uuid not null,
  tabla text not null,
  registro_id uuid,
  elemento_id uuid,
  accion text not null check (accion in ('alta', 'cambio', 'baja')),
  antes jsonb,
  despues jsonb,
  usuario uuid references public.profiles(id) on delete set null,
  creado_en timestamptz not null default now()
);

create index if not exists idx_lazo_historial_lazo on public.lazo_historial(lazo_id, creado_en desc);

alter table public.lazo_historial enable row level security;

drop policy if exists lazo_historial_select on public.lazo_historial;
create policy lazo_historial_select on public.lazo_historial for select
  using (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa());

grant select on public.lazo_historial to authenticated;

create or replace function public.lazo_registrar_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes jsonb;
  v_despues jsonb;
  v_fila jsonb;
  v_lazo uuid;
  v_elemento uuid;
  v_accion text;
  -- Columnas que no dicen nada al leer el historial.
  v_ignorar text[] := array['creado_en', 'creado_por', 'abierta_por'];
begin
  if TG_OP <> 'INSERT' then v_antes := to_jsonb(old) - v_ignorar; end if;
  if TG_OP <> 'DELETE' then v_despues := to_jsonb(new) - v_ignorar; end if;
  v_fila := coalesce(v_despues, v_antes);

  -- Borrar un lazo completo: se va también su historial.
  if TG_TABLE_NAME = 'lazos' and TG_OP = 'DELETE' then
    delete from public.lazo_historial where lazo_id = old.id;
    return null;
  end if;

  if TG_TABLE_NAME = 'lazos' then
    v_lazo := (v_fila->>'id')::uuid;
  elsif TG_TABLE_NAME = 'lazo_elementos' then
    v_lazo := (v_fila->>'lazo_id')::uuid;
    v_elemento := (v_fila->>'id')::uuid;
  elsif TG_TABLE_NAME = 'lazo_fallas' then
    v_lazo := (v_fila->>'lazo_id')::uuid;
    v_elemento := (v_fila->>'elemento_id')::uuid;
  else
    select f.lazo_id into v_lazo from public.lazo_fallas f where f.id = (v_fila->>'falla_id')::uuid;
    v_elemento := (v_fila->>'elemento_id')::uuid;
  end if;

  -- Borrados en cascada de un lazo que ya no existe: nada que anotar.
  if v_lazo is null or not exists (select 1 from public.lazos where id = v_lazo) then
    return null;
  end if;

  if TG_OP = 'UPDATE' then
    -- Solo los campos que cambiaron. Un reintento sin cambios no se anota.
    select jsonb_object_agg(a.key, a.value) into v_antes
      from jsonb_each(to_jsonb(old) - v_ignorar) a
      where (to_jsonb(new) - v_ignorar)->a.key is distinct from a.value;
    if v_antes is null then return null; end if;
    select jsonb_object_agg(d.key, d.value) into v_despues
      from jsonb_each(to_jsonb(new) - v_ignorar) d
      where (to_jsonb(old) - v_ignorar)->d.key is distinct from d.value;
  end if;

  v_accion := case TG_OP when 'INSERT' then 'alta' when 'UPDATE' then 'cambio' else 'baja' end;

  insert into public.lazo_historial (lazo_id, tabla, registro_id, elemento_id, accion, antes, despues, usuario)
  values (v_lazo, TG_TABLE_NAME, (v_fila->>'id')::uuid, v_elemento, v_accion, v_antes, v_despues, auth.uid());

  return null;
end;
$$;

revoke all on function public.lazo_registrar_historial() from public, anon, authenticated;

drop trigger if exists lazos_historial on public.lazos;
create trigger lazos_historial after insert or update or delete on public.lazos
  for each row execute function public.lazo_registrar_historial();

drop trigger if exists lazo_elementos_historial on public.lazo_elementos;
create trigger lazo_elementos_historial after insert or update or delete on public.lazo_elementos
  for each row execute function public.lazo_registrar_historial();

drop trigger if exists lazo_fallas_historial on public.lazo_fallas;
create trigger lazo_fallas_historial after insert or update or delete on public.lazo_fallas
  for each row execute function public.lazo_registrar_historial();

drop trigger if exists lazo_cortes_historial on public.lazo_cortes;
create trigger lazo_cortes_historial after insert or update or delete on public.lazo_cortes
  for each row execute function public.lazo_registrar_historial();

-- Verificación: debe devolver 4.
-- select count(*) from pg_trigger where tgname like 'lazo%historial';
