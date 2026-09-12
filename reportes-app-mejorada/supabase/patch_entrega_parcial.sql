-- ============================================================
-- Entrega parcial: cantidades en lugar de solo palomita
-- ============================================================
-- Hasta ahora el estado de cada renglón era binario: salió o no salió. Si el
-- checklist pedía 20 tubos y el almacén solo tenía 10, el técnico debía
-- marcar la pieza como NO entregada con motivo "no había en almacén", y se
-- perdía que sí recibió 10.
--
-- Ahora se guarda cuánto se entregó y cuánto regresó. Los campos booleanos se
-- conservan y siguen significando "hubo entrega / hubo retorno", para no
-- romper lo que ya depende de ellos.
--
-- Ejecutar en el SQL Editor de Supabase, después de patch_no_entregado.sql.
-- Idempotente.

alter table public.servicio_insumo_estado
  add column if not exists cantidad_entregada numeric not null default 0,
  add column if not exists cantidad_retornada numeric not null default 0;

-- Lo ya marcado se considera entregado/devuelto completo: antes no había
-- forma de expresar otra cosa.
update public.servicio_insumo_estado e
set cantidad_entregada = i.cantidad
from public.servicio_insumos i
where i.id = e.insumo_id
  and e.salida
  and e.cantidad_entregada = 0;

update public.servicio_insumo_estado e
set cantidad_retornada = i.cantidad
from public.servicio_insumos i
where i.id = e.insumo_id
  and e.retorno
  and e.cantidad_retornada = 0;
