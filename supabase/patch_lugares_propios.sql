-- ============================================================
-- Lugares propios para el buscador de visitas
-- ============================================================
-- La oficina, el almacén o cualquier lugar de la empresa. En el buscador
-- por técnico, una parada ahí sale con su nombre («Oficina») en vez de
-- «Lugar sin identificar», y no cuenta como algo que revisar.
--
-- Solo supervisión los ve y los administra.
--
-- Requiere patch_busqueda_visitas.sql. Ejecutar completo. Idempotente.

create table if not exists public.lugares_propios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 60),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radio_m integer not null default 150 check (radio_m between 50 and 2000),
  creado_por uuid not null default auth.uid() references public.profiles(id),
  creado_en timestamptz not null default now()
);

alter table public.lugares_propios enable row level security;

drop policy if exists lugares_propios_supervision on public.lugares_propios;
create policy lugares_propios_supervision on public.lugares_propios for all
  using (public.get_my_role() = 'supervisor' and public.mi_cuenta_activa())
  with check (public.get_my_role() = 'supervisor' and public.mi_cuenta_activa());

grant select, insert, update, delete on public.lugares_propios to authenticated;

-- Verificación: debe devolver 1.
-- select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'lugares_propios';
