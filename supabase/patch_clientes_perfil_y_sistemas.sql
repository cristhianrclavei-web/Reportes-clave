-- ============================================================
-- Perfil de cliente (dirección, contactos, logo) + nombre de proyecto
-- ============================================================
-- Amplía el módulo de Proyectos (patch_proyectos_clientes.sql):
--
--   1. clientes gana dirección y una foto/logo (archivo en el mismo bucket
--      privado 'proyectos-documentos', bajo la carpeta clientes/<id>/).
--   2. cliente_contactos: un cliente puede tener varios contactos
--      (nombre, puesto, teléfono, correo) — antes no había dónde ponerlos.
--   3. proyectos gana `nombre` (el trabajo concreto dentro de un sistema,
--      ej. "Cambio de NVR" dentro del sistema "CCTV") y `concluido_en`
--      (cuándo pasó a Concluido, para mostrarlo en la lista sin adivinar
--      con updated_at, que cambia con cualquier edición).
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

alter table public.clientes
  add column if not exists direccion text,
  add column if not exists logo_path text;

create table if not exists public.cliente_contactos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nombre text not null,
  puesto text,
  telefono text,
  correo text,
  created_at timestamptz not null default now()
);

alter table public.cliente_contactos enable row level security;

drop policy if exists cliente_contactos_supervisor_all on public.cliente_contactos;
create policy cliente_contactos_supervisor_all on public.cliente_contactos for all
  using (public.get_my_role() = 'supervisor') with check (public.get_my_role() = 'supervisor');

create index if not exists idx_cliente_contactos_cliente on public.cliente_contactos(cliente_id);

-- `nombre` con default temporal solo para no romper filas ya existentes
-- (hoy nomás la de prueba); en la práctica el formulario siempre lo pide.
alter table public.proyectos
  add column if not exists nombre text not null default 'Proyecto',
  add column if not exists concluido_en timestamptz;

-- Verificación: debe devolver 2.
--
-- select count(*) from information_schema.columns
--  where table_name='clientes' and column_name in ('direccion','logo_path');
