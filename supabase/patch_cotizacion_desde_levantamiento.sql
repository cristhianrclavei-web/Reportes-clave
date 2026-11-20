-- Cotizar un levantamiento.
--
-- · cotizaciones.levantamiento_id: de qué levantamiento salió la cotización.
--   El levantamiento muestra «Cotizado → COT-0043» y la cotización «Viene de
--   LEV-0006». Si se borra el levantamiento, la cotización se queda (sin liga).
--
-- Idempotente.

alter table public.cotizaciones
  add column if not exists levantamiento_id uuid references public.levantamientos(id) on delete set null;

create index if not exists idx_cotizaciones_levantamiento on public.cotizaciones(levantamiento_id);

-- Comprobar: select count(levantamiento_id) from public.cotizaciones;
