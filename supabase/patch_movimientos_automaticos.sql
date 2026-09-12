-- ============================================================
-- Fase 3: la entrega descuenta y el retorno suma
-- ============================================================
-- Hasta ahora el resguardo y el inventario eran dos mundos: el técnico se
-- llevaba 10 tubos y el almacén seguía diciendo que había 40. Ahora:
--
--   Firma de salida       -> movimiento de salida  (descuenta)
--   Confirmación de recepción -> movimiento de retorno (suma)
--
-- El retorno se registra cuando el ALMACENISTA confirma la recepción, no
-- cuando el técnico firma: es cuando la pieza está físicamente en el almacén
-- y cuando se decide a qué inventario entra.
--
-- Lo que salió y no volvió queda descontado, que es justo lo que se busca:
-- el material se consumió y la herramienta perdida ya no está.
--
-- Los técnicos no pueden escribir en almacen_movimientos (el permiso es del
-- almacenista), así que estas dos funciones son SECURITY DEFINER y validan
-- por dentro que quien llama esté asignado al servicio.
--
-- Ejecutar después de patch_checklist_catalogo.sql. Idempotente.

-- Evita duplicar movimientos si se firma dos veces.
alter table public.almacen_movimientos
  add column if not exists resguardo_id uuid references public.servicio_resguardos(id) on delete set null;

create unique index if not exists idx_movimiento_unico_por_resguardo
  on public.almacen_movimientos(resguardo_id, articulo_id, tipo)
  where resguardo_id is not null;

-- Descuenta lo entregado. Toma primero del inventario reservado al proyecto
-- (es lo que se compró para esa obra) y el resto del general.
create or replace function public.registrar_salida_resguardo(p_servicio_id uuid, p_resguardo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupo uuid;
  r record;
  v_en_proyecto numeric;
  v_del_proyecto numeric;
  v_del_general numeric;
begin
  -- Autorización explícita: supervisor o técnico asignado a ese día.
  if not (
    public.get_my_role() = 'supervisor'
    or exists (select 1 from public.servicio_tecnicos st
               where st.servicio_id = p_servicio_id and st.tecnico_id = auth.uid())
  ) then
    raise exception 'Sin permiso para registrar la salida de este servicio';
  end if;

  select grupo_id into v_grupo from public.servicios_programados where id = p_servicio_id;

  for r in
    select i.articulo_id, e.cantidad_entregada as cant
    from public.servicio_insumo_estado e
    join public.servicio_insumos i on i.id = e.insumo_id
    where e.servicio_id = p_servicio_id
      and e.cantidad_entregada > 0
      and i.articulo_id is not null
  loop
    select coalesce(sum(existencia), 0) into v_en_proyecto
    from public.almacen_existencias
    where articulo_id = r.articulo_id and inventario = 'proyecto' and grupo_id = v_grupo;

    v_del_proyecto := least(greatest(v_en_proyecto, 0), r.cant);
    v_del_general := r.cant - v_del_proyecto;

    if v_del_proyecto > 0 then
      insert into public.almacen_movimientos
        (articulo_id, tipo, cantidad, inventario, grupo_id, servicio_id, resguardo_id, creado_por, nota)
      values (r.articulo_id, 'salida', v_del_proyecto, 'proyecto', v_grupo, p_servicio_id, p_resguardo_id, auth.uid(),
              'Salida por resguardo firmado')
      on conflict do nothing;
    end if;

    if v_del_general > 0 then
      insert into public.almacen_movimientos
        (articulo_id, tipo, cantidad, inventario, grupo_id, servicio_id, resguardo_id, creado_por, nota)
      values (r.articulo_id, 'salida', v_del_general, 'general', null, p_servicio_id, p_resguardo_id, auth.uid(),
              'Salida por resguardo firmado')
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

grant execute on function public.registrar_salida_resguardo(uuid, uuid) to authenticated;

-- Suma lo devuelto, al inventario que decida el almacenista.
create or replace function public.registrar_retorno_resguardo(
  p_servicio_id uuid,
  p_resguardo_id uuid,
  p_destino text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupo uuid;
  r record;
begin
  if not public.puedo_gestionar_almacen() then
    raise exception 'Solo quien lleva el almacén puede confirmar la recepción';
  end if;
  if p_destino not in ('general', 'proyecto') then
    raise exception 'Destino inválido';
  end if;

  select grupo_id into v_grupo from public.servicios_programados where id = p_servicio_id;

  for r in
    select i.articulo_id, e.cantidad_retornada as cant
    from public.servicio_insumo_estado e
    join public.servicio_insumos i on i.id = e.insumo_id
    where e.servicio_id = p_servicio_id
      and e.cantidad_retornada > 0
      and i.articulo_id is not null
  loop
    insert into public.almacen_movimientos
      (articulo_id, tipo, cantidad, inventario, grupo_id, servicio_id, resguardo_id, creado_por, nota)
    values (
      r.articulo_id, 'retorno', r.cant,
      p_destino,
      case when p_destino = 'proyecto' then v_grupo else null end,
      p_servicio_id, p_resguardo_id, auth.uid(),
      'Retorno confirmado en almacén'
    )
    on conflict do nothing;
  end loop;
end;
$$;

grant execute on function public.registrar_retorno_resguardo(uuid, uuid, text) to authenticated;
