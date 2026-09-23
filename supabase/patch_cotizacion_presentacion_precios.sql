-- ============================================================
-- Presentación de precios: desglosado o por kit
-- ============================================================
-- No cambia el formulario ni cómo se capturan las partidas — sigue siendo
-- descripción + unidad + cantidad + costo + % de ganancia por línea, igual
-- que siempre. Lo único que cambia es cómo se ve el PDF:
--
--   'desglose' (como hasta ahora): cada partida muestra su propio precio
--   unitario en la columna P.Unit.
--
--   'kit': la columna P.Unit no muestra precio por partida — en su lugar,
--   se dibuja un solo número (la suma de esa sección) centrado en medio de
--   esa columna, como si fuera una celda combinada. Las descripciones,
--   cantidades e importes por línea se siguen viendo igual.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

alter table public.cotizaciones
  add column if not exists presentacion_precios text not null default 'desglose'
    check (presentacion_precios in ('desglose', 'kit'));

comment on column public.cotizaciones.presentacion_precios is
  'Cómo se muestra el precio por partida en el PDF: "desglose" (precio unitario visible por línea) o "kit" (un solo precio total por sección, sin desglose por partida).';

-- Verificación: debe devolver 1.
--
-- select count(*) from information_schema.columns
--  where table_name='cotizaciones' and column_name='presentacion_precios';
