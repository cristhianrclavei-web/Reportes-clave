-- ============================================================
-- Motivo de lo que NO se entregó al técnico en la salida
-- ============================================================
-- Caso: el técnico no marca dos herramientas porque el almacén no se las
-- entregó (no había en stock, estaban en uso). Sin registrar eso:
--   - No se sabe si faltó por olvido o porque no había.
--   - Peor: al regresar le aparecen en el retorno como si las tuviera, y
--     quedaría como que las perdió.
--
-- Con el motivo capturado, esas piezas se excluyen del retorno (no se
-- devuelve lo que nunca se recibió) y el supervisor se entera de qué faltó
-- en almacén, que es justo el dato que sirve para la próxima salida.
--
-- Ejecutar en el SQL Editor de Supabase, después de
-- patch_resguardo_herramienta.sql. Idempotente.

alter table public.servicio_insumo_estado
  add column if not exists motivo_no_entregado text,
  add column if not exists nota_no_entregado text;

alter table public.servicio_insumo_estado drop constraint if exists insumo_motivo_no_entregado_check;
alter table public.servicio_insumo_estado
  add constraint insumo_motivo_no_entregado_check
  check (motivo_no_entregado is null or motivo_no_entregado in ('sin_stock', 'en_uso', 'no_localizado', 'no_requerido', 'otro'));
