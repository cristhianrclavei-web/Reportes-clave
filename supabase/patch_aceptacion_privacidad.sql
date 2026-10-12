-- Aceptación del aviso de privacidad: constancia de quién lo aceptó, qué
-- versión y cuándo.
--
-- El aviso estaba publicado pero nadie lo aceptaba. Ahora la app lo pide la
-- primera vez que cada persona entra y cada vez que el aviso cambia de
-- versión (lib/privacidad.ts), y guarda aquí un renglón por aceptación.
-- Los renglones no se editan ni se borran desde la app: son la constancia.
--
-- Se puede correr varias veces.

create table if not exists public.aceptaciones_privacidad (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  version text not null,
  aceptado_en timestamptz not null default now(),
  unique (usuario_id, version)
);

alter table public.aceptaciones_privacidad enable row level security;

-- Cada quien registra y ve su propia aceptación.
drop policy if exists aceptaciones_privacidad_propia_alta on public.aceptaciones_privacidad;
create policy aceptaciones_privacidad_propia_alta
on public.aceptaciones_privacidad for insert
to authenticated
with check (usuario_id = auth.uid());

drop policy if exists aceptaciones_privacidad_propia_ver on public.aceptaciones_privacidad;
create policy aceptaciones_privacidad_propia_ver
on public.aceptaciones_privacidad for select
to authenticated
using (usuario_id = auth.uid() or public.get_my_role() = 'supervisor');

-- Consulta útil: quién ya aceptó la versión vigente y quién falta.
--   select p.full_name, a.aceptado_en
--     from public.profiles p
--     left join public.aceptaciones_privacidad a
--            on a.usuario_id = p.id and a.version = '2026-10-12'
--    where p.activo is true
--    order by a.aceptado_en nulls first, p.full_name;
