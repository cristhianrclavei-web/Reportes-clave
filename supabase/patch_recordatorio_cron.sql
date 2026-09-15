-- ============================================================
-- Recordatorio automático: "sigues en sitio sin iniciar"
-- ============================================================
-- Cada 10 minutos, Supabase mismo (pg_cron) llama a una ruta de la app
-- (pg_net) que revisa qué servicios llevan "en sitio" sin haber iniciado, y
-- les manda un push a los técnicos asignados. No depende de que nadie tenga
-- la app abierta — corre del lado del servidor de Supabase.
--
-- *** ANTES DE EJECUTAR ***
-- Reemplaza REEMPLAZA_CON_TU_CRON_SECRET (aparece una vez abajo) por un
-- valor secreto largo y aleatorio, EL MISMO que pongas en Vercel como
-- variable de entorno CRON_SECRET. Nunca subas el valor real a git — este
-- archivo se queda con el placeholder; el valor real solo vive en Supabase
-- (pegado aquí, al ejecutar) y en Vercel.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'recordatorios-iniciar-servicio') then
    perform cron.unschedule('recordatorios-iniciar-servicio');
  end if;
end $$;

select cron.schedule(
  'recordatorios-iniciar-servicio',
  '*/10 * * * *',
  $cron$
  select net.http_post(
    url := 'https://reportes-clave.vercel.app/api/cron/recordatorios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'REEMPLAZA_CON_TU_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- Verificación: debe devolver una fila con schedule = '*/10 * * * *'.
--
-- select jobname, schedule, active from cron.job where jobname = 'recordatorios-iniciar-servicio';

-- Para apagarlo más adelante si hace falta:
--
-- select cron.unschedule('recordatorios-iniciar-servicio');
