-- ============================================================
-- Asistente de IA: borradores de cotización
-- ============================================================
-- El asistente puede armar una cotización y guardarla como borrador. Estas
-- dos columnas marcan esos borradores para avisar en la app que hay que
-- revisarlos; son internas y NO salen en el PDF que recibe el cliente.
--
-- Se puede correr más de una vez.

alter table public.cotizaciones
  add column if not exists generada_por_ia boolean not null default false,
  -- Lo que el asistente supuso o no pudo confirmar (precios de referencia,
  -- cantidades estimadas…), para quien revisa el borrador.
  add column if not exists notas_ia text;
