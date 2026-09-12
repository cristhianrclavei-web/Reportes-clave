-- ============================================================
-- Fase 2: el checklist apunta al catálogo de almacén
-- ============================================================
-- Hasta ahora cada renglón guardaba texto libre: uno escribe "Taladro", otro
-- "taladro 1/2", otro "Taladro Dewalt". Con tres nombres para la misma cosa
-- el inventario nunca cuadra.
--
-- Ahora cada renglón puede apuntar a un artículo del catálogo. La columna es
-- opcional a propósito: los renglones capturados antes siguen funcionando con
-- su descripción, y no se pierde nada al actualizar.
--
-- Ejecutar en el SQL Editor de Supabase, después de patch_almacen.sql.
-- Idempotente.

alter table public.servicio_insumos
  add column if not exists articulo_id uuid references public.almacen_articulos(id) on delete set null;

create index if not exists idx_insumos_articulo on public.servicio_insumos(articulo_id);

-- El catálogo lo alimenta cualquier supervisor: quien programa un servicio
-- necesita poder dar de alta lo que va a pedir. Lo que sigue restringido al
-- almacenista es capturar entradas y movimientos, que es donde está el
-- control del inventario.
drop policy if exists articulos_escritura on public.almacen_articulos;
create policy articulos_escritura on public.almacen_articulos for all
  using (public.puedo_gestionar_almacen() or public.get_my_role() = 'supervisor')
  with check (public.puedo_gestionar_almacen() or public.get_my_role() = 'supervisor');

-- Vincula automáticamente los renglones existentes cuyo texto coincide
-- exactamente con un artículo del catálogo. Lo que no coincida se queda como
-- estaba y se puede vincular a mano después.
update public.servicio_insumos i
set articulo_id = a.id
from public.almacen_articulos a
where i.articulo_id is null
  and lower(trim(i.descripcion)) = lower(trim(a.descripcion))
  and i.categoria = a.categoria;
