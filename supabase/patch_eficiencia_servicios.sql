-- ============================================================
-- Eficiencia de servicios: resultado del cierre y motivos
-- ============================================================
-- Hasta ahora se sabia a que hora llego y a que hora cerro el tecnico, pero
-- no POR QUE llego tarde o se fue antes, ni si el trabajo quedo terminado
-- cuando el supervisor no capturo tareas. Sin eso, salir antes no se puede
-- leer ni como bueno (acabo pronto) ni como malo (dejo trabajo).
--
-- Se agregan al servicio:
--   resultado            como cerro el dia: terminado | pendiente | no_realizado
--   resultado_motivo     por que no quedo terminado (clave de lib/eficiencia.ts)
--   llegada_motivo       por que llego mas de 15 min tarde
--   salida_motivo        por que cerro mas de 15 min despues de lo programado
--   *_comentario         detalle libre de cada motivo
--
-- Los motivos se guardan como clave corta (trafico, cliente_ausente, ...): la
-- clasificacion externo/propio vive en el codigo, para poder ajustarla sin
-- tocar la base. Los servicios anteriores quedan con todo en null y el panel
-- los muestra como "sin clasificar".
--
-- No cambia permisos: el tecnico asignado ya puede actualizar su servicio
-- (servicios_tecnico_update) y el trigger de bloqueo de edicion no vigila
-- estas columnas.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

alter table public.servicios_programados
  add column if not exists resultado text
    check (resultado in ('terminado', 'pendiente', 'no_realizado')),
  add column if not exists resultado_motivo text,
  add column if not exists resultado_comentario text,
  add column if not exists llegada_motivo text,
  add column if not exists llegada_comentario text,
  add column if not exists salida_motivo text,
  add column if not exists salida_comentario text;

-- Comprobacion: debe regresar 7.
select count(*) as columnas_nuevas
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'servicios_programados'
   and column_name in (
     'resultado', 'resultado_motivo', 'resultado_comentario',
     'llegada_motivo', 'llegada_comentario', 'salida_motivo', 'salida_comentario'
   );
