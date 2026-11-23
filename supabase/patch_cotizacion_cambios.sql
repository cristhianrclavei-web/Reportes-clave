-- Historial de cambios de una cotización: cada vez que alguien la edita y
-- guarda, la app compara antes y después (lib/cambiosCotizacion.ts) y anota
-- aquí quién cambió qué. Sirve sobre todo cuando quien aprueba (Clara,
-- Everardo) la corrige desde el enlace de aprobación en vez de pedir cambios:
-- quien la armó ve exactamente qué se cambió.
--
-- Solo supervisión lee y escribe; nadie edita ni borra lo anotado.
-- Idempotente.

create table if not exists public.cotizacion_cambios (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references public.cotizaciones(id) on delete cascade,
  autor_id uuid not null default auth.uid() references public.profiles(id),
  creado_en timestamptz not null default now(),
  cambios text[] not null check (cardinality(cambios) between 1 and 200)
);

create index if not exists idx_cotizacion_cambios_cot on public.cotizacion_cambios(cotizacion_id, creado_en desc);

alter table public.cotizacion_cambios enable row level security;

drop policy if exists cotizacion_cambios_select on public.cotizacion_cambios;
create policy cotizacion_cambios_select on public.cotizacion_cambios for select
  using (public.get_my_role() = 'supervisor' and public.mi_cuenta_activa());

drop policy if exists cotizacion_cambios_insert on public.cotizacion_cambios;
create policy cotizacion_cambios_insert on public.cotizacion_cambios for insert
  with check (public.get_my_role() = 'supervisor' and public.mi_cuenta_activa() and autor_id = auth.uid());

-- Comprobar: select c.creado_en, p.full_name, c.cambios from public.cotizacion_cambios c join public.profiles p on p.id = c.autor_id order by c.creado_en desc limit 5;
