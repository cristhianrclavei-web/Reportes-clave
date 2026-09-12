-- ============================================================
-- Sistemas, marca/modelo y números de serie en almacén
-- ============================================================
-- El catálogo crecía como una lista plana. Al clasificarlo por SISTEMA (CCTV,
-- alarma y detección de incendios, control de acceso, energía solar…) buscar
-- deja de ser un scroll largo y el almacén refleja cómo trabaja la empresa.
--
-- Dónde va cada dato:
--   marca y modelo -> en el ARTÍCULO. Describen qué es; una cámara Hikvision
--                     DS-2CD siempre es esa, entre en la compra que entre.
--   número de serie -> en el MOVIMIENTO. Identifica la pieza física, y cada
--                      entrada trae piezas distintas.
--
-- Ejecutar después de patch_almacen.sql. Idempotente.

-- 1) Sistemas
create table if not exists public.almacen_sistemas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true,
  creado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.almacen_sistemas enable row level security;

drop policy if exists sistemas_lectura on public.almacen_sistemas;
create policy sistemas_lectura on public.almacen_sistemas for select
  using (auth.uid() is not null);

drop policy if exists sistemas_escritura on public.almacen_sistemas;
create policy sistemas_escritura on public.almacen_sistemas for all
  using (public.puedo_gestionar_almacen() or public.get_my_role() = 'supervisor')
  with check (public.puedo_gestionar_almacen() or public.get_my_role() = 'supervisor');

-- Los sistemas que la empresa maneja hoy. Se pueden agregar y desactivar más.
insert into public.almacen_sistemas (nombre) values
  ('CCTV y videovigilancia'),
  ('Alarma y detección de incendios'),
  ('Control de acceso'),
  ('Energía solar'),
  ('Automatización industrial'),
  ('Redes y cableado'),
  ('Uso general')
on conflict (nombre) do nothing;

-- 2) El artículo pertenece a un sistema y tiene marca y modelo.
alter table public.almacen_articulos
  add column if not exists sistema_id uuid references public.almacen_sistemas(id) on delete set null,
  add column if not exists marca text,
  add column if not exists modelo text;

create index if not exists idx_articulos_sistema on public.almacen_articulos(sistema_id);

-- 3) Las series de las piezas que entraron en ese movimiento.
alter table public.almacen_movimientos
  add column if not exists numeros_serie text;

-- 4) Lo que ya existía queda en "Uso general" para no dejarlo huérfano.
update public.almacen_articulos a
set sistema_id = s.id
from public.almacen_sistemas s
where a.sistema_id is null and s.nombre = 'Uso general';
