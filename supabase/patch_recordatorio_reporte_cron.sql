-- ============================================================
-- Recordatorio automático: "reporte de servicio pendiente"
-- ============================================================
-- Dos avisos al día, mismo mecanismo que patch_recordatorio_cron.sql
-- (pg_cron + pg_net llamando a una ruta de la app):
--   18:00 México — recuerda el reporte de servicios de HOY sin reporte.
--   08:30 México — recuerda lo que sigue sin reporte de días anteriores,
--                  y se repite cada mañana mientras siga pendiente.
--
-- pg_cron corre en UTC. México hoy vive fijo en UTC-6 (sin horario de
-- verano desde 2022), así que 18:00 y 08:30 México son 00:00 y 14:30 UTC.
-- Si México volviera a usar horario de verano, estos horarios se
-- correrían una hora y habría que reprogramar el cron a mano.
--
-- *** ANTES DE EJECUTAR ***
-- Reemplaza REEMPLAZA_CON_TU_CRON_SECRET (aparece dos veces abajo) por el
-- MISMO valor que ya usaste en patch_recordatorio_cron.sql / la variable de
-- entorno CRON_SECRET en Vercel. Nunca subas el valor real a git.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'recordatorio-reporte-tarde') then
    perform cron.unschedule('recordatorio-reporte-tarde');
  end if;
  if exists (select 1 from cron.job where jobname = 'recordatorio-reporte-manana') then
    perform cron.unschedule('recordatorio-reporte-manana');
  end if;
end $$;

select cron.schedule(
  'recordatorio-reporte-tarde',
  '0 0 * * *',
  $cron$
  select net.http_post(
    url := 'https://reportes-clave.vercel.app/api/cron/recordatorio-reporte',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'REEMPLAZA_CON_TU_CRON_SECRET'
    ),
    body := '{"momento": "tarde"}'::jsonb
  );
  $cron$
);

select cron.schedule(
  'recordatorio-reporte-manana',
  '30 14 * * *',
  $cron$
  select net.http_post(
    url := 'https://reportes-clave.vercel.app/api/cron/recordatorio-reporte',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'REEMPLAZA_CON_TU_CRON_SECRET'
    ),
    body := '{"momento": "manana"}'::jsonb
  );
  $cron$
);

-- Verificación: debe devolver dos filas, con schedule '0 0 * * *' y
-- '30 14 * * *'.
--
-- select jobname, schedule, active from cron.job
-- where jobname in ('recordatorio-reporte-tarde', 'recordatorio-reporte-manana');

-- Para apagarlos más adelante si hace falta:
--
-- select cron.unschedule('recordatorio-reporte-tarde');
-- select cron.unschedule('recordatorio-reporte-manana');
