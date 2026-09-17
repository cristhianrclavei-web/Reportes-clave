-- ============================================================
-- Moneda (MXN / USD) por cotización
-- ============================================================
-- Algunas cotizaciones se manejan en dólares. Cada cotización guarda en qué
-- moneda está cotizada y, si es USD, el tipo de cambio usado en ese momento
-- (no uno "actual" que cambiaría con el tiempo) para poder mostrar siempre
-- el equivalente en pesos con el que se armó esa cotización.
--
-- Ejecutar después de patch_cotizaciones.sql. Idempotente.

alter table public.cotizaciones
  add column if not exists moneda text not null default 'MXN',
  add column if not exists tipo_cambio numeric not null default 1;

alter table public.cotizaciones drop constraint if exists cotizaciones_moneda_check;
alter table public.cotizaciones
  add constraint cotizaciones_moneda_check
  check (moneda in ('MXN', 'USD'));
