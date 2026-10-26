-- Vales de almacén: evidencia completa de ida y vuelta.
--
-- Hasta ahora la evidencia era de un solo lado: el técnico firmaba de recibido
-- y mandaba fotos al devolver, pero de la entrega no había foto y al recibir
-- la devolución el almacén solo capturaba cantidades. El técnico no tenía
-- cómo probar que regresó las cosas.
--
--   fotos_entrega       fotos que toma el almacén de lo que entrega (obligatoria)
--   firma_almacen       firma de quien recibe la devolución en el almacén
--   firma_almacen_en    cuándo firmó
--   nota_recepcion      por concepto: qué pasó cuando lo recibido no coincide
--                       con lo que el técnico dijo que devolvía (obligatoria)
--
-- entregar_vale y recibir_devolucion_vale cambian de firma (un parámetro más,
-- con valor por defecto para no romper la versión anterior de la app mientras
-- se publica la nueva; la base exige la foto y la firma igual).
--
-- Correr DESPUÉS de patch_vales_almacen.sql. Idempotente.

alter table public.almacen_vales
  add column if not exists fotos_entrega text[] not null default '{}',
  add column if not exists firma_almacen text,
  add column if not exists firma_almacen_en timestamptz;

alter table public.almacen_vale_items
  add column if not exists nota_recepcion text;

-- ---------- Entregar: ahora con foto ----------
drop function if exists public.entregar_vale(uuid, jsonb, text);
create or replace function public.entregar_vale(p_vale uuid, p_items jsonb, p_nota text, p_fotos text[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  it record;
  v_cant numeric;
  v_grupo uuid;
  v_disp numeric;
  v_proy numeric;
  v_del_proy numeric;
  v_total numeric := 0;
begin
  if not public.puedo_gestionar_almacen() or not public.mi_cuenta_activa() then
    raise exception 'Solo el almacén puede entregar';
  end if;
  if p_fotos is null or array_length(p_fotos, 1) is null then
    raise exception 'Toma al menos una foto de lo que entregas';
  end if;
  select * into v from public.almacen_vales where id = p_vale for update;
  if v.id is null then raise exception 'Vale no encontrado'; end if;
  if v.estado <> 'solicitado' then raise exception 'Este vale ya no está pendiente de entrega'; end if;
  select grupo_id into v_grupo from public.servicios_programados where id = v.servicio_id;

  for it in
    select i.id, i.articulo_id, i.cantidad_solicitada, a.descripcion, a.unidad
    from public.almacen_vale_items i join public.almacen_articulos a on a.id = i.articulo_id
    where i.vale_id = p_vale
  loop
    select coalesce((x->>'cantidad')::numeric, it.cantidad_solicitada) into v_cant
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x where (x->>'id')::uuid = it.id;
    v_cant := coalesce(v_cant, it.cantidad_solicitada);
    if v_cant < 0 then raise exception 'Cantidad inválida'; end if;

    if v_cant > 0 then
      v_disp := public.existencia_para_vale(it.articulo_id, v_grupo);
      if v_cant > v_disp then
        raise exception 'No hay suficiente «%»: hay % %', it.descripcion, greatest(v_disp, 0), it.unidad;
      end if;
      select coalesce(sum(existencia), 0) into v_proy from public.almacen_existencias
      where articulo_id = it.articulo_id and inventario = 'proyecto' and grupo_id = v_grupo;
      v_del_proy := case when v_grupo is null then 0 else least(greatest(v_proy, 0), v_cant) end;
      if v_del_proy > 0 then
        insert into public.almacen_movimientos (articulo_id, tipo, cantidad, inventario, grupo_id, servicio_id, vale_id, creado_por, nota)
        values (it.articulo_id, 'salida', v_del_proy, 'proyecto', v_grupo, v.servicio_id, p_vale, auth.uid(), 'Vale ' || v.folio);
      end if;
      if v_cant - v_del_proy > 0 then
        insert into public.almacen_movimientos (articulo_id, tipo, cantidad, inventario, grupo_id, servicio_id, vale_id, creado_por, nota)
        values (it.articulo_id, 'salida', v_cant - v_del_proy, 'general', null, v.servicio_id, p_vale, auth.uid(), 'Vale ' || v.folio);
      end if;
    end if;
    update public.almacen_vale_items set cantidad_entregada = v_cant where id = it.id;
    v_total := v_total + v_cant;
  end loop;

  if v_total <= 0 then
    raise exception 'No se entregó nada: si no hay existencias, rechaza el vale';
  end if;

  update public.almacen_vales
  set estado = 'por_firmar', entregado_por = auth.uid(), entregado_en = now(),
      nota_entrega = nullif(trim(coalesce(p_nota, '')), ''),
      fotos_entrega = p_fotos,
      fecha_limite = now() + interval '3 days'
  where id = p_vale;
end;
$$;

-- ---------- Recibir la devolución: concepto por concepto y con firma ----------
drop function if exists public.recibir_devolucion_vale(uuid, jsonb, text);
create or replace function public.recibir_devolucion_vale(p_vale uuid, p_items jsonb, p_nota text, p_firma text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  it record;
  x jsonb;
  v_rec numeric;
  v_nota text;
  v_salio_proy numeric;
  v_grupo uuid;
  v_a_proy numeric;
begin
  if not public.puedo_gestionar_almacen() or not public.mi_cuenta_activa() then
    raise exception 'Solo el almacén puede recibir devoluciones';
  end if;
  if p_firma is null or p_firma not like 'data:image/png;base64,%' or length(p_firma) > 400000 then
    raise exception 'Falta tu firma de recibido';
  end if;
  select * into v from public.almacen_vales where id = p_vale for update;
  if v.id is null then raise exception 'Vale no encontrado'; end if;
  if v.estado <> 'devolucion_por_confirmar' then raise exception 'Este vale no tiene una devolución por confirmar'; end if;

  for it in
    select i.id, i.articulo_id, i.cantidad_devuelta, a.descripcion
    from public.almacen_vale_items i join public.almacen_articulos a on a.id = i.articulo_id
    where i.vale_id = p_vale
  loop
    x := null;
    select e into x from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e where (e->>'id')::uuid = it.id;
    v_rec := coalesce((x->>'cantidad')::numeric, it.cantidad_devuelta, 0);
    if v_rec < 0 or v_rec > coalesce(it.cantidad_devuelta, 0) then
      raise exception 'No se puede recibir más de lo que el técnico devolvió';
    end if;
    v_nota := nullif(trim(coalesce(x->>'nota', '')), '');
    -- Si llegó menos de lo que el técnico dijo, queda escrito por qué: es lo
    -- que se le avisa a él y lo que se ve en el vale.
    if v_rec < coalesce(it.cantidad_devuelta, 0) and v_nota is null then
      raise exception 'Escribe qué pasó con «%»: recibiste menos de lo que dice la devolución', it.descripcion;
    end if;
    if v_rec > 0 then
      select coalesce(sum(cantidad), 0), max(grupo_id::text)::uuid into v_salio_proy, v_grupo
      from public.almacen_movimientos
      where vale_id = p_vale and articulo_id = it.articulo_id and tipo = 'salida' and inventario = 'proyecto';
      v_a_proy := least(v_salio_proy, v_rec);
      if v_a_proy > 0 then
        insert into public.almacen_movimientos (articulo_id, tipo, cantidad, inventario, grupo_id, servicio_id, vale_id, creado_por, nota)
        values (it.articulo_id, 'retorno', v_a_proy, 'proyecto', v_grupo, v.servicio_id, p_vale, auth.uid(), 'Devolución vale ' || v.folio);
      end if;
      if v_rec - v_a_proy > 0 then
        insert into public.almacen_movimientos (articulo_id, tipo, cantidad, inventario, grupo_id, servicio_id, vale_id, creado_por, nota)
        values (it.articulo_id, 'retorno', v_rec - v_a_proy, 'general', null, v.servicio_id, p_vale, auth.uid(), 'Devolución vale ' || v.folio);
      end if;
    end if;
    update public.almacen_vale_items set cantidad_recibida = v_rec, nota_recepcion = v_nota where id = it.id;
  end loop;

  update public.almacen_vales
  set estado = 'cerrado', recibido_por = auth.uid(), recibido_en = now(),
      nota_recepcion = nullif(trim(coalesce(p_nota, '')), ''),
      firma_almacen = p_firma, firma_almacen_en = now()
  where id = p_vale;
end;
$$;

revoke all on function public.entregar_vale(uuid, jsonb, text, text[]) from public, anon;
grant execute on function public.entregar_vale(uuid, jsonb, text, text[]) to authenticated;
revoke all on function public.recibir_devolucion_vale(uuid, jsonb, text, text) from public, anon;
grant execute on function public.recibir_devolucion_vale(uuid, jsonb, text, text) to authenticated;

-- Comprobación: debe regresar 4.
select count(*) as columnas_nuevas
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'almacen_vales' and column_name in ('fotos_entrega', 'firma_almacen', 'firma_almacen_en'))
    or (table_name = 'almacen_vale_items' and column_name = 'nota_recepcion'));
