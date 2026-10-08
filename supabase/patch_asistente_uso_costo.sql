-- ============================================================
-- Asistente de IA: detalle de consumo por consulta
-- ============================================================
-- Para el panel de uso del asistente. Sin estas columnas el asistente
-- funciona igual; solo que el panel no puede mostrar el costo estimado.
--
-- Se puede correr más de una vez.

alter table public.asistente_uso
  -- Parte de tokens_entrada que se leyó de la caché (se cobra a una fracción).
  add column if not exists tokens_cache integer not null default 0,
  -- Búsquedas en internet hechas en esa consulta (se cobran aparte).
  add column if not exists busquedas integer not null default 0,
  -- Costo estimado en dólares con los precios del modelo al momento.
  add column if not exists costo_usd numeric(10, 5),
  -- La consulta llevaba fotos (el texto de la pregunta no las incluye).
  add column if not exists con_imagen boolean not null default false,
  -- Pulgar de quien preguntó: 1 útil, -1 no sirvió, null sin calificar.
  add column if not exists calificacion smallint check (calificacion in (1, -1));
