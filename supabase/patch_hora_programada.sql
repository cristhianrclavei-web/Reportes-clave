-- ============================================================
-- Hora programada de llegada
-- ============================================================
-- Hasta ahora un servicio solo tenia fecha. Se sabia a que hora llego el
-- tecnico, pero no a que hora debia llegar, asi que la puntualidad no se
-- podia medir: faltaba contra que comparar.
--
-- Se guarda como `time` y no como `timestamptz` a proposito. Una cita a las
-- 9:00 es una hora de reloj en el sitio; guardarla con zona horaria hace que
-- se recorra sola cuando cambia el servidor o el horario de verano.
--
-- Queda opcional. Los servicios ya programados no tienen hora y deben seguir
-- funcionando: la puntualidad simplemente no se calcula para ellos.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

alter table public.servicios_programados
  add column if not exists hora_programada time;

comment on column public.servicios_programados.hora_programada is
  'Hora de llegada acordada con el cliente, en hora local del sitio. Nula en servicios anteriores a esta columna: la puntualidad no se calcula para esos.';

-- Verificacion: debe devolver 1.
--
-- select count(*) from information_schema.columns
--  where table_name='servicios_programados' and column_name='hora_programada';
