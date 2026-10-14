-- Cotizaciones: título del proyecto.
--
-- Un nombre de proyecto que se captura en el formulario y sale como título
-- principal, centrado, en la primera página del PDF de la cotización.
-- Es opcional: las cotizaciones sin título se ven como antes.
--
-- Se puede correr varias veces.

alter table public.cotizaciones
  add column if not exists titulo_proyecto text;
