-- ============================================================
-- Guardar el avance parcial de forma consultable
-- ============================================================
-- Los avances parciales se registraban solo dentro del texto del evento
-- ("«Instalar cámaras» — avance 50%"). Servía para leerlo, pero no para
-- calcular: por eso el avance del proyecto mostraba 0% en un día donde sí
-- hubo trabajo, si ninguna tarea llegó a completarse.
--
-- Con la tarea y el porcentaje en columnas, se puede reconstruir cuánto se
-- había avanzado al cierre de cada día.
--
-- Ejecutar después de patch_avance_parcial_tareas.sql. Idempotente.

alter table public.servicio_eventos
  add column if not exists tarea_id uuid references public.servicio_tareas(id) on delete cascade,
  add column if not exists avance_pct integer;

create index if not exists idx_eventos_tarea on public.servicio_eventos(tarea_id) where tarea_id is not null;
