-- ============================================================
-- Gestion de usuarios: quien puede editar nombres
-- ============================================================
-- Cada usuario puede cambiar su correo y su telefono. Los nombres ya estan
-- correctos y no se tocan desde el perfil propio: cambiarlos es una decision
-- administrativa, no una preferencia.
--
-- El permiso vive aqui, no en el codigo. Comparar el nombre escrito en pantalla
-- para decidir quien manda se rompe el dia que alguien acentua distinto su
-- apellido. Se sigue el mismo patron que can_manage_almacen y can_manage_billing.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

-- 1. Columnas -------------------------------------------------

alter table public.profiles
  add column if not exists telefono text,
  add column if not exists can_manage_usuarios boolean not null default false,
  add column if not exists activo boolean not null default true;

-- 2. Quien tiene el permiso -----------------------------------
-- Semilla inicial por nombre. De aqui en adelante el permiso se otorga
-- cambiando esta bandera, no editando codigo.

update public.profiles
   set can_manage_usuarios = true
 where full_name in (
         'Clara Zepeda',
         'Maria Clara Zepeda',
         'María Clara Zepeda',
         'Everardo Sanchez Diaz',
         'Everardo Sánchez Díaz',
         'Ing. Everardo Sanchez Diaz',
         'Ing. Everardo Sánchez Díaz'
       )
   and can_manage_usuarios is distinct from true;

-- 3. Funcion de permiso ---------------------------------------
-- SECURITY DEFINER: una politica sobre profiles que consulte profiles se
-- muerde la cola y Postgres responde con infinite recursion. La funcion lee
-- la tabla por fuera de RLS y corta el ciclo.

create or replace function public.puede_gestionar_usuarios()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select can_manage_usuarios from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function public.puede_gestionar_usuarios() from public;
grant execute on function public.puede_gestionar_usuarios() to authenticated;

-- 4. Politicas -------------------------------------------------

-- Update: cada quien lo suyo, y los autorizados sobre cualquiera.
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_own_or_gestor" on public.profiles;
create policy "profiles_update_own_or_gestor"
  on public.profiles for update
  using (id = auth.uid() or public.puede_gestionar_usuarios())
  with check (id = auth.uid() or public.puede_gestionar_usuarios());

-- Delete: solo los autorizados. Aun asi la app no borra, desactiva.
drop policy if exists "profiles_delete_gestor" on public.profiles;
create policy "profiles_delete_gestor"
  on public.profiles for delete
  using (public.puede_gestionar_usuarios());

-- 5. Nadie se quita el permiso a si mismo ---------------------
-- Si el ultimo gestor se desactiva o se retira el permiso por error, la
-- pantalla queda sin quien la administre y hay que entrar a Supabase a mano.

create or replace function public.proteger_ultimo_gestor()
returns trigger
language plpgsql
as $$
begin
  if (old.can_manage_usuarios is true)
     and (new.can_manage_usuarios is not true or new.activo is not true) then
    if (select count(*) from public.profiles
         where can_manage_usuarios is true and activo is true and id <> old.id) = 0 then
      raise exception 'No se puede dejar la gestion de usuarios sin nadie a cargo.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_ultimo_gestor on public.profiles;
create trigger trg_proteger_ultimo_gestor
  before update on public.profiles
  for each row execute function public.proteger_ultimo_gestor();

-- 6. Verificacion ---------------------------------------------
-- Debe devolver 1, 1, 1 y al menos 1 gestor.
--
-- select
--   (select count(*) from information_schema.columns
--      where table_name='profiles' and column_name='telefono') as col_telefono,
--   (select count(*) from information_schema.columns
--      where table_name='profiles' and column_name='can_manage_usuarios') as col_permiso,
--   (select count(*) from pg_policies
--      where tablename='profiles' and policyname='profiles_update_own_or_gestor') as politica,
--   (select count(*) from public.profiles where can_manage_usuarios) as gestores;
