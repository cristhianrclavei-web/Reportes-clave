-- ============================================================
-- Costo y % de ganancia por partida de cotización
-- ============================================================
-- Cada concepto ahora captura su costo real y un % de ganancia (0-100), y
-- el precio unitario que se le muestra al cliente se calcula solo:
-- precio_unitario = costo * (1 + margen_pct / 100).
--
-- precio_unitario e importe se siguen guardando tal cual (son lo que ya
-- usa el PDF): costo/margen_pct son el detalle interno de cómo se llegó a
-- ese precio, y solo se ven dentro de la app, nunca en el PDF del cliente.
--
-- Ejecutar después de patch_cotizaciones.sql. Idempotente.

alter table public.cotizacion_lineas
  add column if not exists costo numeric not null default 0,
  add column if not exists margen_pct numeric not null default 0;
