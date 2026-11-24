-- Título por sistema en la cotización: además del nombre del proyecto de toda
-- la cotización (titulo_proyecto), cada sistema puede llevar el suyo, que el
-- PDF pone arriba de la tabla de ese sistema. Se guarda en cada partida del
-- sistema (igual que «sistema»), así que todas las de un sistema llevan el
-- mismo. Opcional: las cotizaciones de antes quedan igual.
--
-- Idempotente.

alter table public.cotizacion_lineas add column if not exists titulo_sistema text;

alter table public.cotizacion_lineas drop constraint if exists cotizacion_lineas_titulo_sistema_largo;
alter table public.cotizacion_lineas add constraint cotizacion_lineas_titulo_sistema_largo
  check (titulo_sistema is null or char_length(titulo_sistema) <= 150);

-- Comprobar: select sistema, titulo_sistema, count(*) from public.cotizacion_lineas group by 1, 2 order by 3 desc limit 10;
