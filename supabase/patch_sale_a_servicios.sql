-- Permiso «Sale a servicios»: alguien de supervisión que a veces sale a campo
-- puede hacer reportes desde su menú y aparece en la lista de personal al
-- agendar o asignar servicios. Al personal técnico no le hace falta (ya lo es).
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

alter table public.profiles
  add column if not exists sale_a_servicios boolean not null default false;

-- Mismo blindaje que los demás permisos: solo quien administra usuarios lo
-- cambia (copia de la versión vigente con la columna nueva al final).
create or replace function public.proteger_columnas_privilegio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SQL Editor / service role (sin usuario) y gestores de usuarios: libre.
  if auth.uid() is null or public.puede_gestionar_usuarios() then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.activo is distinct from old.activo
     or new.can_manage_usuarios is distinct from old.can_manage_usuarios
     or new.can_manage_almacen is distinct from old.can_manage_almacen
     or new.can_manage_billing is distinct from old.can_manage_billing
     or new.can_approve_review is distinct from old.can_approve_review
     or new.can_approve_cotizacion is distinct from old.can_approve_cotizacion
     or new.can_approve_personal is distinct from old.can_approve_personal
     or new.sale_a_servicios is distinct from old.sale_a_servicios then
    raise exception 'Solo quien administra usuarios puede cambiar rol, permisos o estado de una cuenta';
  end if;
  return new;
end;
$$;

-- Clave: Braulio, Julio y Everardo salen a servicios (en otra instalación no
-- coincide nadie y no cambia nada; después se ajusta en Personal → Usuarios).
update public.profiles set sale_a_servicios = true
where role = 'supervisor'
  and (full_name ilike 'Braulio Sanchez%' or full_name ilike 'Julio Gomez%' or full_name ilike '%Everardo S_nchez%');

-- Comprobación: debe listar a los tres.
select full_name, role, sale_a_servicios from public.profiles where sale_a_servicios order by full_name;
