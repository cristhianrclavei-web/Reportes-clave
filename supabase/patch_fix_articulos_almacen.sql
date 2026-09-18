-- Corrige tres artículos del catálogo de almacén detectados en revisión:
--
-- 1. "Pala redonda" está duplicada (dos filas idénticas, creadas con 64
--    segundos de diferencia). La primera (c4021fb9...) nunca se usó — 0
--    movimientos. La segunda (4cf0fb77...) sí tiene 2 salidas registradas.
--    Se da de baja la que no tiene historial; la otra se queda tal cual.
--
-- 2. "Fuente de poder" y "Sirenas" están en el catálogo pero con activo =
--    false, por eso no aparecían al registrar una entrada (la pantalla solo
--    lista artículos activos). Se reactivan.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente (usa los ids exactos).

update public.almacen_articulos
set activo = false
where id = 'c4021fb9-4f27-4c4b-b8e6-09b216cc75a6'; -- Pala redonda duplicada, sin movimientos

update public.almacen_articulos
set activo = true
where id in (
  'e1d74ea2-2d11-4b79-b3af-9d865d48716e', -- Fuente de poder
  '6ff6a1c3-b8e0-446a-a7e2-8555f9175e55'  -- Sirenas
);
