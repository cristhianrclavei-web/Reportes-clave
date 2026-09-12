-- ============================================================
-- Existencias mínimas por artículo
-- ============================================================
-- Hoy la falta de material se descubre cuando el técnico ya está en la puerta
-- del almacén. Con un mínimo por artículo, el sistema avisa antes.
--
-- El mínimo es por artículo y aplica al inventario general: lo reservado a un
-- proyecto se compró para esa obra y se agota por diseño, no por descuido.
--
-- Ejecutar después de patch_almacen.sql. Idempotente.

alter table public.almacen_articulos
  add column if not exists minimo numeric not null default 0;
