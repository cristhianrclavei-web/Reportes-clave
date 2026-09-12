-- ============================================================
-- Avance parcial por tarea (0–100%) + % global del proyecto
-- ============================================================
-- Una tarea puede quedar "a medias" (ej. cámaras instaladas pero sin
-- conectar = 50%). El técnico registra el porcentaje y cada avance
-- parcial queda auditado como evento (quién, cuándo, %, foto, ubicación).
-- "Completada" equivale a avance 100%.
--
-- Ejecutar completo en el SQL Editor de Supabase, DESPUÉS del patch
-- patch_tareas_compartidas_por_proyecto.sql. Es idempotente.

-- 1) Porcentaje de avance por tarea.
alter table public.servicio_tareas
  add column if not exists avance_pct integer not null default 0;

-- Las tareas ya completadas valen 100%.
update public.servicio_tareas
set avance_pct = 100
where completada and avance_pct <> 100;

alter table public.servicio_tareas drop constraint if exists servicio_tareas_avance_pct_check;
alter table public.servicio_tareas
  add constraint servicio_tareas_avance_pct_check check (avance_pct between 0 and 100);

-- 2) Nuevo tipo de evento: 'avance' (registro auditado de avance parcial).
alter table public.servicio_eventos drop constraint if exists servicio_eventos_tipo_check;
alter table public.servicio_eventos
  add constraint servicio_eventos_tipo_check
  check (tipo in ('llegada', 'inicio', 'retraso', 'evidencia', 'cierre', 'avance'));

-- (Sin cambios de RLS: las políticas existentes de servicio_tareas y
-- servicio_eventos ya cubren estas operaciones.)
