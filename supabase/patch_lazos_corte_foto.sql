-- ============================================================
-- Foto de evidencia en cada corte de la búsqueda de falla a tierra
-- ============================================================
-- Al registrar un corte el técnico puede tomar una foto (la caja abierta,
-- el multímetro con la medición…). Va al bucket 'evidencias' bajo
-- lazos/<lazo_id>/ con las políticas de patch_lazos.sql; aquí solo falta la
-- columna. Sale en el anexo «Búsqueda de falla a tierra» del reporte.
--
-- Requiere patch_lazos.sql. Ejecutar completo en el SQL Editor. Idempotente.

alter table public.lazo_cortes add column if not exists foto_path text;

-- Verificación: debe devolver 1.
-- select count(*) from information_schema.columns where table_name = 'lazo_cortes' and column_name = 'foto_path';
