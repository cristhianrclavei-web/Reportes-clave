-- ============================================================
-- Almacén Fase D: costos, préstamo entre técnicos e historial
-- ============================================================
-- 1) Costo unitario: se captura en cada entrada (movimiento) y queda como
--    «último costo» del artículo. Con eso se calcula lo que consumió cada
--    servicio o proyecto: (salidas − retornos) × costo.
-- 2) Préstamo entre técnicos: el técnico que tiene herramienta de un vale
--    en uso se la pasa a otro sin regresar al almacén. El que recibe acepta
--    con su firma y le queda un vale nuevo a su nombre (mismo plazo); el
--    vale original baja esas cantidades. El inventario no se mueve: sigue
--    fuera del almacén.
-- 3) Historial: se lee de vales, movimientos y equipos instalados (no
--    necesita tablas nuevas).
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

-- ---------- 1) Costos ----------
alter table public.almacen_articulos add column if not exists costo_unitario numeric check (costo_unitario is null or costo_unitario >= 0);
alter table public.almacen_movimientos add column if not exists costo_unitario numeric check (costo_unitario is null or costo_unitario >= 0);

-- Lo que el almacén puso en un servicio (o en todo su proyecto si el
-- servicio es parte de uno): por artículo, salidas menos retornos, con el
-- costo de la entrada más reciente que lo traiga (o el del artículo).
create or replace function public.costo_almacen_servicio(p_servicio uuid)
returns table (
  articulo_id uuid, descripcion text, unidad text, categoria text,
  salio numeric, regreso numeric, neto numeric, costo_unitario numeric, total numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_grupo uuid;
begin
  if not (public.get_my_role() = 'supervisor' or public.puedo_gestionar_almacen()) or not public.mi_cuenta_activa() then
    raise exception 'Sin permiso';
  end if;
  select grupo_id into v_grupo from public.servicios_programados where id = p_servicio;
  return query
  with svc as (
    select id from public.servicios_programados
    where id = p_servicio or (v_grupo is not null and grupo_id = v_grupo)
  ),
  m as (
    select mv.articulo_id,
           sum(case when mv.tipo = 'salida' then mv.cantidad else 0 end) as salio,
           sum(case when mv.tipo = 'retorno' then mv.cantidad else 0 end) as regreso
    from public.almacen_movimientos mv
    where mv.servicio_id in (select id from svc) and mv.tipo in ('salida', 'retorno')
    group by mv.articulo_id
  )
  select a.id, a.descripcion, a.unidad, a.categoria,
         m.salio, m.regreso, greatest(m.salio - m.regreso, 0),
         coalesce(
           (select e.costo_unitario from public.almacen_movimientos e
            where e.articulo_id = a.id and e.tipo = 'entrada' and e.costo_unitario is not null
            order by e.created_at desc limit 1),
           a.costo_unitario),
         greatest(m.salio - m.regreso, 0) * coalesce(
           (select e.costo_unitario from public.almacen_movimientos e
            where e.articulo_id = a.id and e.tipo = 'entrada' and e.costo_unitario is not null
            order by e.created_at desc limit 1),
           a.costo_unitario)
  from m join public.almacen_articulos a on a.id = m.articulo_id
  order by a.descripcion;
end;
$$;

revoke all on function public.costo_almacen_servicio(uuid) from public, anon;
grant execute on function public.costo_almacen_servicio(uuid) to authenticated;

-- ---------- 2) Préstamo entre técnicos ----------
create sequence if not exists public.almacen_traspasos_folio_seq;

create table if not exists public.almacen_traspasos (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('T-' || lpad(nextval('public.almacen_traspasos_folio_seq')::text, 4, '0')),
  vale_origen_id uuid not null references public.almacen_vales(id) on delete cascade,
  de_tecnico uuid not null references public.profiles(id),
  a_tecnico uuid not null references public.profiles(id),
  -- [{"item": "<almacen_vale_items.id>", "cantidad": 1}]
  items jsonb not null,
  nota text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptado', 'rechazado', 'cancelado')),
  vale_destino_id uuid references public.almacen_vales(id) on delete set null,
  motivo_rechazo text,
  created_at timestamptz not null default now(),
  resuelto_en timestamptz
);
create index if not exists idx_traspasos_a on public.almacen_traspasos (a_tecnico) where estado = 'pendiente';
create index if not exists idx_traspasos_origen on public.almacen_traspasos (vale_origen_id);

alter table public.almacen_traspasos enable row level security;
drop policy if exists traspasos_lectura on public.almacen_traspasos;
create policy traspasos_lectura on public.almacen_traspasos for select to authenticated
  using (
    ((de_tecnico = auth.uid() or a_tecnico = auth.uid()) and public.mi_cuenta_activa())
    or public.puedo_gestionar_almacen()
    or public.get_my_role() = 'supervisor'
  );

-- El que recibe tiene que poder ver el vale de origen (de quién viene y qué es).
drop policy if exists vales_lectura on public.almacen_vales;
create policy vales_lectura on public.almacen_vales for select to authenticated
  using (
    (tecnico_id = auth.uid() and public.mi_cuenta_activa())
    or public.puedo_gestionar_almacen()
    or public.get_my_role() = 'supervisor'
    or exists (select 1 from public.almacen_traspasos t
               where t.vale_origen_id = almacen_vales.id and t.a_tecnico = auth.uid() and t.estado = 'pendiente')
  );

-- Cantidad de una partida que todavía tiene el técnico y no está ya
-- comprometida en otro traspaso pendiente.
create or replace function public.disponible_para_traspaso(p_item uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(i.cantidad_entregada, 0) - coalesce((
    select sum((x->>'cantidad')::numeric)
    from public.almacen_traspasos t, jsonb_array_elements(t.items) x
    where t.vale_origen_id = i.vale_id and t.estado = 'pendiente' and (x->>'item')::uuid = i.id
  ), 0)
  from public.almacen_vale_items i where i.id = p_item;
$$;

create or replace function public.proponer_traspaso(p_vale uuid, p_a_tecnico uuid, p_items jsonb, p_nota text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  x jsonb;
  v_item record;
  v_cant numeric;
  v_limpios jsonb := '[]'::jsonb;
  v_id uuid;
begin
  select * into v from public.almacen_vales where id = p_vale for update;
  if v.id is null or v.tecnico_id <> auth.uid() or not public.mi_cuenta_activa() then
    raise exception 'Este vale no es tuyo';
  end if;
  if v.estado <> 'en_uso' then raise exception 'Solo se puede prestar lo de un vale en uso (firmado)'; end if;
  if p_a_tecnico is null or p_a_tecnico = auth.uid() then raise exception 'Elige a quién se lo pasas'; end if;
  if not exists (select 1 from public.profiles where id = p_a_tecnico and coalesce(activo, true)) then
    raise exception 'Ese usuario no existe o está desactivado';
  end if;

  for x in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_cant := coalesce((x->>'cantidad')::numeric, 0);
    continue when v_cant <= 0;
    select i.*, a.descripcion into v_item
    from public.almacen_vale_items i join public.almacen_articulos a on a.id = i.articulo_id
    where i.id = (x->>'item')::uuid and i.vale_id = p_vale;
    if v_item.id is null then raise exception 'Partida no válida'; end if;
    if v_cant > public.disponible_para_traspaso(v_item.id) then
      raise exception 'No tienes tantas piezas de «%» para pasar', v_item.descripcion;
    end if;
    v_limpios := v_limpios || jsonb_build_object('item', v_item.id, 'cantidad', v_cant);
  end loop;
  if jsonb_array_length(v_limpios) = 0 then raise exception 'Indica qué y cuánto le pasas'; end if;

  insert into public.almacen_traspasos (vale_origen_id, de_tecnico, a_tecnico, items, nota)
  values (p_vale, auth.uid(), p_a_tecnico, v_limpios, nullif(trim(coalesce(p_nota, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- El que recibe acepta con su firma: se crea su vale (en uso, mismo plazo)
-- y el vale original baja esas cantidades; si se queda sin nada, se cierra.
create or replace function public.aceptar_traspaso(p_traspaso uuid, p_firma text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  v record;
  x jsonb;
  v_item record;
  v_cant numeric;
  v_nuevo uuid;
  v_de text;
  v_orden integer := 0;
begin
  select * into t from public.almacen_traspasos where id = p_traspaso for update;
  if t.id is null or t.a_tecnico <> auth.uid() or not public.mi_cuenta_activa() then
    raise exception 'Este préstamo no es para ti';
  end if;
  if t.estado <> 'pendiente' then raise exception 'Este préstamo ya no está pendiente'; end if;
  if coalesce(length(p_firma), 0) < 50 then raise exception 'Firma de recibido'; end if;
  select * into v from public.almacen_vales where id = t.vale_origen_id for update;
  if v.estado <> 'en_uso' then raise exception 'El vale de origen ya no está en uso'; end if;
  select coalesce(full_name, 'otro técnico') into v_de from public.profiles where id = t.de_tecnico;

  insert into public.almacen_vales (
    tecnico_id, cliente_id, cliente_nombre, servicio_id, nota, estado,
    entregado_por, entregado_en, nota_entrega, firma_recepcion, firmado_en, fecha_limite
  ) values (
    auth.uid(), v.cliente_id, v.cliente_nombre, v.servicio_id,
    'Préstamo ' || t.folio || ' de ' || v_de || ' (vale ' || v.folio || ')', 'en_uso',
    t.de_tecnico, now(), t.nota, p_firma, now(), coalesce(v.fecha_limite, now() + interval '3 days')
  ) returning id into v_nuevo;

  for x in select * from jsonb_array_elements(t.items) loop
    v_cant := (x->>'cantidad')::numeric;
    select * into v_item from public.almacen_vale_items where id = (x->>'item')::uuid for update;
    if v_item.id is null or coalesce(v_item.cantidad_entregada, 0) < v_cant then
      raise exception 'El vale de origen ya no tiene esas cantidades';
    end if;
    update public.almacen_vale_items set cantidad_entregada = cantidad_entregada - v_cant where id = v_item.id;
    v_orden := v_orden + 1;
    insert into public.almacen_vale_items (vale_id, articulo_id, orden, cantidad_solicitada, cantidad_entregada)
    values (v_nuevo, v_item.articulo_id, v_orden, v_cant, v_cant);
  end loop;

  update public.almacen_traspasos set estado = 'aceptado', vale_destino_id = v_nuevo, resuelto_en = now() where id = t.id;

  -- Si el técnico de origen ya no tiene nada en ese vale, se cierra solo.
  if not exists (select 1 from public.almacen_vale_items where vale_id = v.id and coalesce(cantidad_entregada, 0) > 0) then
    update public.almacen_vales
    set estado = 'cerrado', recibido_en = now(), nota_recepcion = 'Todo se pasó en préstamo ' || t.folio
    where id = v.id;
  end if;
  return v_nuevo;
end;
$$;

-- Rechaza (el que recibe) o cancela (el que lo ofreció).
create or replace function public.resolver_traspaso(p_traspaso uuid, p_estado text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare t record;
begin
  select * into t from public.almacen_traspasos where id = p_traspaso for update;
  if t.id is null or not public.mi_cuenta_activa() then raise exception 'No encontrado'; end if;
  if t.estado <> 'pendiente' then raise exception 'Este préstamo ya no está pendiente'; end if;
  if p_estado = 'rechazado' and t.a_tecnico = auth.uid() then
    update public.almacen_traspasos set estado = 'rechazado', motivo_rechazo = nullif(trim(coalesce(p_motivo, '')), ''), resuelto_en = now() where id = t.id;
  elsif p_estado = 'cancelado' and (t.de_tecnico = auth.uid() or public.puedo_gestionar_almacen()) then
    update public.almacen_traspasos set estado = 'cancelado', resuelto_en = now() where id = t.id;
  else
    raise exception 'Sin permiso';
  end if;
end;
$$;

-- Lista de compañeros a quienes se puede pasar herramienta (nombre e id).
create or replace function public.companeros_para_prestamo()
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name from public.profiles p
  where public.mi_cuenta_activa() and p.id <> auth.uid() and coalesce(p.activo, true) and p.full_name is not null
  order by p.full_name;
$$;

revoke all on function public.disponible_para_traspaso(uuid) from public, anon;
grant execute on function public.disponible_para_traspaso(uuid) to authenticated;
revoke all on function public.proponer_traspaso(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.proponer_traspaso(uuid, uuid, jsonb, text) to authenticated;
revoke all on function public.aceptar_traspaso(uuid, text) from public, anon;
grant execute on function public.aceptar_traspaso(uuid, text) to authenticated;
revoke all on function public.resolver_traspaso(uuid, text, text) from public, anon;
grant execute on function public.resolver_traspaso(uuid, text, text) to authenticated;
revoke all on function public.companeros_para_prestamo() from public, anon;
grant execute on function public.companeros_para_prestamo() to authenticated;

-- Verificación: deben salir 3 en true.
select
  exists (select 1 from information_schema.columns where table_name = 'almacen_articulos' and column_name = 'costo_unitario') as costos,
  to_regclass('public.almacen_traspasos') is not null as traspasos,
  exists (select 1 from pg_proc where proname = 'aceptar_traspaso') as aceptar;
