-- ============================================================
-- Módulo de almacén — fase 1: catálogo, entradas y existencias
-- ============================================================
-- Tres piezas:
--   almacen_articulos    — QUÉ existe. Catálogo único: descripción, unidad,
--                          categoría y si la pieza regresa o se consume.
--   almacen_movimientos  — TODO lo que entra y sale. El inventario NO se
--                          guarda como un número editable: se calcula
--                          sumando movimientos. Así cualquier saldo se puede
--                          rastrear hasta una factura, y nadie puede
--                          "corregir" existencias sin dejar rastro.
--   vista de existencias — el saldo por artículo e inventario.
--
-- Dos inventarios, como se maneja hoy en la empresa: el general para el
-- trabajo del día a día, y uno por proyecto para lo comprado con una orden
-- de compra específica.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

-- 1) Permiso: solo quien lleva el almacén captura entradas.
alter table public.profiles
  add column if not exists can_manage_almacen boolean not null default false;

-- 2) Catálogo
create table if not exists public.almacen_articulos (
  id uuid primary key default gen_random_uuid(),
  categoria text not null check (categoria in ('herramienta', 'material', 'equipo')),
  descripcion text not null,
  unidad text not null default 'pza',
  -- La herramienta se presta y vuelve; el material se consume. Esto define
  -- cómo se cierra su ciclo cuando el técnico regresa.
  retornable boolean not null default false,
  activo boolean not null default true,
  creado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_articulos_categoria on public.almacen_articulos(categoria);

-- 3) Movimientos
create table if not exists public.almacen_movimientos (
  id uuid primary key default gen_random_uuid(),
  articulo_id uuid not null references public.almacen_articulos(id) on delete restrict,
  tipo text not null check (tipo in ('entrada', 'salida', 'retorno', 'ajuste')),
  -- Siempre positiva; el signo lo define el tipo.
  cantidad numeric not null check (cantidad > 0),
  inventario text not null default 'general' check (inventario in ('general', 'proyecto')),
  -- Proyecto al que quedó reservado (grupo_id del servicio programado).
  grupo_id uuid,
  proveedor text,
  factura_path text,
  orden_compra_path text,
  nota text,
  -- Para cuando la salida se ligue a un servicio (fase 3).
  servicio_id uuid references public.servicios_programados(id) on delete set null,
  creado_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_movimientos_articulo on public.almacen_movimientos(articulo_id);
create index if not exists idx_movimientos_grupo on public.almacen_movimientos(grupo_id);

-- Un movimiento de proyecto tiene que decir de qué proyecto.
alter table public.almacen_movimientos drop constraint if exists movimientos_proyecto_check;
alter table public.almacen_movimientos
  add constraint movimientos_proyecto_check
  check (inventario = 'general' or grupo_id is not null);

-- 4) Existencias: saldo por artículo e inventario.
create or replace view public.almacen_existencias as
select
  m.articulo_id,
  m.inventario,
  m.grupo_id,
  sum(
    case
      when m.tipo in ('entrada', 'retorno') then m.cantidad
      when m.tipo in ('salida') then -m.cantidad
      else m.cantidad  -- los ajustes se capturan ya con su sentido en la nota
    end
  ) as existencia
from public.almacen_movimientos m
group by m.articulo_id, m.inventario, m.grupo_id;

-- 5) RLS
alter table public.almacen_articulos enable row level security;
alter table public.almacen_movimientos enable row level security;

-- Todo el equipo puede consultar el catálogo y las existencias: sirve para
-- saber si hay algo antes de pedirlo.
drop policy if exists articulos_lectura on public.almacen_articulos;
create policy articulos_lectura on public.almacen_articulos for select
  using (auth.uid() is not null);

drop policy if exists movimientos_lectura on public.almacen_movimientos;
create policy movimientos_lectura on public.almacen_movimientos for select
  using (auth.uid() is not null);

-- Capturar es exclusivo de quien lleva el almacén.
create or replace function public.puedo_gestionar_almacen()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.can_manage_almacen from public.profiles p where p.id = auth.uid()), false);
$$;

grant execute on function public.puedo_gestionar_almacen() to authenticated;

drop policy if exists articulos_escritura on public.almacen_articulos;
create policy articulos_escritura on public.almacen_articulos for all
  using (public.puedo_gestionar_almacen())
  with check (public.puedo_gestionar_almacen());

drop policy if exists movimientos_escritura on public.almacen_movimientos;
create policy movimientos_escritura on public.almacen_movimientos for all
  using (public.puedo_gestionar_almacen())
  with check (public.puedo_gestionar_almacen() and creado_por = auth.uid());

-- 6) Bucket para facturas y órdenes de compra del almacén
insert into storage.buckets (id, name, public)
values ('almacen', 'almacen', false)
on conflict (id) do nothing;

drop policy if exists "almacen_insert" on storage.objects;
create policy "almacen_insert" on storage.objects for insert
  with check (bucket_id = 'almacen' and public.puedo_gestionar_almacen());

drop policy if exists "almacen_select" on storage.objects;
create policy "almacen_select" on storage.objects for select
  using (bucket_id = 'almacen' and (public.puedo_gestionar_almacen() or public.get_my_role() = 'supervisor'));

-- 7) Dar el permiso a quien lleva el almacén. Ajusta el nombre si hace falta.
update public.profiles
set can_manage_almacen = true
where full_name ilike '%julio%gomez%' or full_name ilike '%julio%gómez%';
