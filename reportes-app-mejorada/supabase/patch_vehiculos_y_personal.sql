-- ============================================================
-- Vehiculos del catalogo y lista de personal para el reporte
-- ============================================================
-- Dos cosas que hoy se escriben a mano en cada reporte y salen distintas
-- cada vez: el vehiculo con sus placas, y quien estuvo en el servicio.
--
-- Los vehiculos van en tabla y no en el codigo para que sumar una camioneta
-- sea un insert y no un despliegue.
--
-- El personal no se resuelve abriendo la lectura de `profiles`: RLS filtra
-- renglones, no columnas, asi que dejar que todos lean la tabla expondria
-- tambien los telefonos. Se expone una funcion que devuelve solo el nombre.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

-- 1. Vehiculos ---------------------------------------------------

create table if not exists public.vehiculos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  placas text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Las placas identifican al vehiculo: no puede haber dos iguales.
create unique index if not exists vehiculos_placas_unicas
  on public.vehiculos (upper(replace(placas, '-', '')));

alter table public.vehiculos enable row level security;

-- Cualquiera que haya entrado puede verlos: el tecnico necesita elegir el
-- suyo al llenar el reporte.
drop policy if exists "vehiculos_select_autenticados" on public.vehiculos;
create policy "vehiculos_select_autenticados"
  on public.vehiculos for select
  to authenticated
  using (true);

-- Altas y bajas solo desde Supabase por ahora. Cuando haya pantalla para
-- administrarlos, aqui va la politica con can_manage_usuarios.

insert into public.vehiculos (nombre, placas)
select v.nombre, v.placas
  from (values
    ('Nissan Frontier', 'HW-9774-B'),
    ('E10 X',           '34N-656')
  ) as v(nombre, placas)
 where not exists (
   select 1 from public.vehiculos e
    where upper(replace(e.placas, '-', '')) = upper(replace(v.placas, '-', ''))
 );

-- 2. Lista de personal -------------------------------------------
-- Devuelve solo id, nombre y rol. SECURITY DEFINER para leer por encima de
-- la politica de profiles, que hoy solo deja a cada quien ver su renglon.
-- Se excluyen las cuentas dadas de baja: nombrar en un reporte a alguien que
-- ya no trabaja aqui es justo lo que se quiere evitar.

create or replace function public.listar_personal()
returns table (id uuid, full_name text, role text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.role
    from public.profiles p
   where coalesce(p.activo, true) is true
     and coalesce(p.full_name, '') <> ''
   order by p.full_name;
$$;

revoke all on function public.listar_personal() from public;
grant execute on function public.listar_personal() to authenticated;

-- 3. Verificacion -------------------------------------------------
-- Debe devolver 2 vehiculos y la lista de personal.
--
-- select nombre, placas from public.vehiculos where activo order by nombre;
-- select full_name, role from public.listar_personal();
