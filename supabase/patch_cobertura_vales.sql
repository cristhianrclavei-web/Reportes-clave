-- Lista del proyecto ↔ vales de almacén.
--
-- Desde 2026-10-26 el inventario solo se mueve con los vales: el almacén
-- entrega y el técnico firma de recibido. La lista de herramienta, material y
-- equipo del proyecto ya no se firma; sirve de guía para pedir el vale. Para
-- que la lista diga qué ya está pedido o entregado hace falta sumar los vales
-- de TODO el proyecto, incluidos los de compañeros de la cuadrilla, que el
-- técnico no puede leer directamente (RLS de almacen_vales: solo los suyos).
--
-- Esta función devuelve solo totales por artículo y folios, sin firmas ni
-- fotos. Puede llamarla supervisión, el almacén o quien esté asignado a algún
-- día del proyecto.
--
-- Idempotente. Correr en Supabase → SQL Editor.

create or replace function public.cobertura_vales_proyecto(p_grupo uuid)
returns table (articulo_id uuid, pedido numeric, entregado numeric, folios text[])
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.mi_cuenta_activa() then
    raise exception 'Tu cuenta está desactivada';
  end if;
  if not (
    public.get_my_role() = 'supervisor'
    or public.puedo_gestionar_almacen()
    or exists (
      select 1 from public.servicio_tecnicos st
      join public.servicios_programados s on s.id = st.servicio_id
      where s.grupo_id = p_grupo and st.tecnico_id = auth.uid()
    )
  ) then
    raise exception 'Sin permiso para ver los vales de este proyecto';
  end if;

  return query
  select
    i.articulo_id,
    -- Pedido y todavía sin surtir.
    coalesce(sum(i.cantidad_solicitada) filter (where v.estado = 'solicitado'), 0) as pedido,
    -- Ya salió del almacén (aunque después se haya devuelto: la lista es de
    -- lo que hay que llevar, no de lo que sigue en la obra).
    coalesce(sum(coalesce(i.cantidad_entregada, 0)) filter (where v.estado <> 'solicitado'), 0) as entregado,
    array_agg(distinct v.folio) as folios
  from public.almacen_vales v
  join public.almacen_vale_items i on i.vale_id = v.id
  join public.servicios_programados s on s.id = v.servicio_id
  where s.grupo_id = p_grupo
    and v.estado in ('solicitado', 'por_firmar', 'en_uso', 'devolucion_por_confirmar', 'cerrado')
  group by i.articulo_id;
end;
$$;

grant execute on function public.cobertura_vales_proyecto(uuid) to authenticated;
