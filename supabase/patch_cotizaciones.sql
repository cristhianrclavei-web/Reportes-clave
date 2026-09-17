-- ============================================================
-- Cotizaciones (solo supervisores)
-- ============================================================
-- Formulario para armar cotizaciones con el mismo formato que ya se le
-- manda a los clientes (ver ~/Documents/Formatos_ClaveI, ejemplo Torre
-- Classiqa): datos del cliente, una o más secciones por sistema (CCTV,
-- Control de acceso, Alarma, etc.), cada una con sus partidas
-- (descripción/unidad/cantidad/precio), subtotal por sistema, y al final
-- SUBTOTAL + IVA + TOTAL.
--
-- Este es el primer paso de un plan más largo hacia un asistente de IA que
-- arme la cotización solo conversando con el usuario (ver la propuesta
-- interna de Cristhian) — por eso las líneas quedan en `cotizacion_lineas`
-- como su propia tabla desde ahora, aunque hoy sean texto libre: el día que
-- exista un catálogo de productos, se le agrega una columna `producto_id`
-- opcional a esta tabla sin tener que rehacer el esquema.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

create table if not exists public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  folio text not null,
  -- Referencia a profiles (no auth.users) y con nombre explícito: es lo que
  -- permite pedir profiles(full_name) al consultar, igual que en reports
  -- (ver patch_add_reports_profiles_fk.sql).
  created_by uuid not null constraint cotizaciones_created_by_profiles_fkey references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fecha date not null default current_date,

  -- Cliente
  atencion text,
  empresa text not null,
  telefono text,
  correo text,
  direccion text,

  -- Condiciones comerciales — con default igual al formato de referencia,
  -- editables por cotización.
  forma_pago text not null default 'Contado 100% contra entrega',
  tiempo_entrega text not null default 'De 5 a 7 días hábiles previamente programados para todos los servicios que integran la cotización.',
  garantia text not null default 'Equipos 12 meses, contra defectos de fabricación.',
  vigencia_dias integer not null default 15,
  notas text,

  -- Firma de quien la envía (no siempre es el mismo supervisor)
  firmante_nombre text,
  firmante_correo text,

  -- Totales: se recalculan y guardan al editar, para que el PDF de una
  -- cotización vieja no cambie si después se ajustan las líneas de otra.
  iva_pct numeric not null default 16,
  subtotal numeric not null default 0,
  iva numeric not null default 0,
  total numeric not null default 0,

  estado text not null default 'borrador' check (estado in ('borrador', 'enviada', 'aceptada', 'rechazada'))
);

create table if not exists public.cotizacion_lineas (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references public.cotizaciones(id) on delete cascade,
  sistema text not null, -- agrupador visible: "CCTV", "Control de Acceso Vehicular", etc.
  orden integer not null default 0,
  descripcion text not null,
  unidad text not null default 'Pza',
  cantidad numeric not null default 1,
  precio_unitario numeric not null default 0,
  importe numeric not null default 0
);

alter table public.cotizaciones enable row level security;
alter table public.cotizacion_lineas enable row level security;

drop policy if exists cotizaciones_supervisor_all on public.cotizaciones;
create policy cotizaciones_supervisor_all on public.cotizaciones for all
  using (public.get_my_role() = 'supervisor')
  with check (public.get_my_role() = 'supervisor');

drop policy if exists cotizacion_lineas_supervisor_all on public.cotizacion_lineas;
create policy cotizacion_lineas_supervisor_all on public.cotizacion_lineas for all
  using (public.get_my_role() = 'supervisor')
  with check (public.get_my_role() = 'supervisor');

create index if not exists idx_cotizacion_lineas_cotizacion on public.cotizacion_lineas(cotizacion_id);
create index if not exists idx_cotizaciones_created_by on public.cotizaciones(created_by);
create index if not exists idx_cotizaciones_fecha on public.cotizaciones(fecha desc);
