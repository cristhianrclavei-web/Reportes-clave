-- ============================================================
-- Cuentas de prueba y datos reales del técnico
-- ============================================================
-- Los técnicos entraron con cuentas genéricas para probar. Marcarlas permite
-- identificarlas en reportes y evitar que queden firmados por "tecnico1@prueba.com"
-- sin forma de contactar a nadie.
--
-- El teléfono y correo se actualizan desde el perfil (/perfil) donde cada usuario
-- puede cambiar sus datos de contacto. Los nombres se editan SOLO desde el panel
-- de admin (si el usuario es Clara Zepeda o Everardo Sánchez Díaz).
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

alter table public.profiles
  add column if not exists es_cuenta_prueba boolean not null default false,
  add column if not exists telefono text,
  add column if not exists datos_actualizados_en timestamptz;

-- Un técnico no puede quitarse solo la marca de prueba sin llenar sus datos:
-- el trigger exige nombre y teléfono para darla por real.
create or replace function public.validar_datos_reales()
returns trigger
language plpgsql
as $$
begin
  if old.es_cuenta_prueba and not new.es_cuenta_prueba then
    if coalesce(trim(new.full_name), '') = '' or coalesce(trim(new.telefono), '') = '' then
      raise exception 'Para dejar de ser cuenta de prueba hay que registrar nombre completo y teléfono';
    end if;
    new.datos_actualizados_en := now();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_validar_datos on public.profiles;
create trigger profiles_validar_datos
  before update on public.profiles
  for each row execute function public.validar_datos_reales();

-- Marca como de prueba las cuentas que lo sean. AJUSTA el filtro a tus
-- correos reales antes de correrlo; así está, no marca nada.
-- update public.profiles set es_cuenta_prueba = true
-- where id in (select id from auth.users where email like '%prueba%');
