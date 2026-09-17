-- ============================================================
-- Aprobación interna de cotizaciones (firma + gate de "enviada")
-- ============================================================
-- Antes de mandarle una cotización al cliente, alguien la revisa y la firma
-- (firma interna de aprobación, no la del cliente). Solo hasta que quede
-- firmada se puede marcar como "enviada" — mandarla sin que nadie la
-- revisara sería justo lo que se quiere evitar con este paso.
--
-- El estado "aceptada" se renombra a "aprobada": significaba lo mismo
-- (aprobación interna), pero el nombre generaba confusión con "el cliente
-- aceptó la cotización", que es otra cosa (eso se registra afuera del
-- estado, cuando el cliente responde después de recibirla enviada).
--
-- Ejecutar después de patch_cotizaciones.sql. Idempotente.

update public.cotizaciones set estado = 'aprobada' where estado = 'aceptada';

alter table public.cotizaciones drop constraint if exists cotizaciones_estado_check;
alter table public.cotizaciones
  add constraint cotizaciones_estado_check
  check (estado in ('borrador', 'aprobada', 'enviada', 'rechazada'));

alter table public.cotizaciones
  add column if not exists aprobada_por text,
  add column if not exists aprobada_firma text,
  add column if not exists aprobada_en timestamptz;
