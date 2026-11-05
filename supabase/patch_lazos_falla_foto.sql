-- ============================================================
-- Foto de evidencia al cerrar una búsqueda de falla a tierra
-- ============================================================
-- Al marcar «Encontré la falla» el técnico puede tomar una foto (la caja
-- con agua, el cable dañado…). Se guarda en el bucket 'evidencias' bajo
-- lazos/<lazo_id>/, con las mismas políticas que las fotos de dispositivos
-- (patch_lazos.sql), así que aquí solo falta la columna.
--
-- Requiere patch_lazos.sql. Ejecutar completo en el SQL Editor. Idempotente.

alter table public.lazo_fallas add column if not exists foto_path text;

-- Verificación: debe devolver 1.
-- select count(*) from information_schema.columns where table_name = 'lazo_fallas' and column_name = 'foto_path';
