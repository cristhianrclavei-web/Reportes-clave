-- ============================================================
-- Lazos: ubicación del dispositivo por partes (área, nivel, referencia)
-- ============================================================
-- Antes la ubicación era un solo texto («Central de enfermeras nivel -1»).
-- Ahora se captura por partes para poder ver y contar por nivel o por área:
--   area:       Cocina, Central de enfermeras, Bodega 1
--   nivel:      Planta baja, Nivel 1, Nivel -2, Azotea
--   referencia: sobre plafón, junto a la puerta
-- La columna `ubicacion` se sigue llenando con todo junto («Cocina · Planta
-- baja · sobre plafón»): así el PDF, la búsqueda y los lazos ya capturados
-- siguen igual.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

alter table public.lazo_elementos add column if not exists area text check (char_length(area) <= 80);
alter table public.lazo_elementos add column if not exists nivel text check (char_length(nivel) <= 40);
alter table public.lazo_elementos add column if not exists referencia text check (char_length(referencia) <= 80);
