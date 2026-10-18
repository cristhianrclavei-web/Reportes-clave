-- ============================================================
-- Levantamientos: equipos existentes y recomendaciones por sistema
-- ============================================================
-- Cada sistema del levantamiento ahora guarda:
--   equipos         → tabla de lo que ya hay instalado:
--                     [{ cantidad, descripcion, modelo, estado }]
--   recomendaciones → lista numerada de puntos: ["...", "..."]
-- Se guardan como jsonb en la misma fila del sistema (igual que las fotos)
-- para no crear tablas nuevas ni políticas extra.
--
-- Ejecutar en el SQL Editor de Supabase. Se puede correr varias veces.

alter table public.levantamiento_sistemas
  add column if not exists equipos jsonb not null default '[]'::jsonb;

alter table public.levantamiento_sistemas
  add column if not exists recomendaciones jsonb not null default '[]'::jsonb;
