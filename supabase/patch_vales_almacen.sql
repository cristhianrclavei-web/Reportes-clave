-- ============================================================
-- Vales de almacén: salida y retorno de herramienta, material y equipo
-- ============================================================
-- Reemplaza el vale de papel. El técnico pide desde la app (para qué
-- cliente o servicio, qué artículos y cuántos); el almacenista entrega; el
-- técnico firma de recibido en su celular; al regresar marca lo que
-- devuelve con foto obligatoria y el almacenista confirma lo recibido.
-- Cada paso mueve el inventario solo (almacen_movimientos), así que las
-- existencias siempre reflejan lo que hay en el almacén.
--
--   solicitado → por_firmar → en_uso → devolucion_por_confirmar → cerrado
--   (solicitado → cancelado por el técnico / rechazado por el almacén)
--
-- Plazo: 3 días desde la entrega; el técnico puede pedir más días y el
-- almacenista lo aprueba o rechaza.
--
-- Solo se puede pedir lo que existe en el catálogo. Si falta algo, el
-- técnico lo reporta (almacen_altas_solicitadas) y al almacenista le llega
-- el aviso para darlo de alta si sí lo tiene.
--
-- Todo cambio de estado pasa por funciones security definer que validan
-- quién lo hace; las tablas no aceptan escrituras directas.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

-- ---------- 1) Tablas ----------
create sequence if not exists public.almacen_vales_folio_seq;

create table if not exists public.almacen_vales (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('V-' || lpad(nextval('public.almacen_vales_folio_seq')::text, 4, '0')),
  tecnico_id uuid not null references public.profiles(id),
  cliente_id uuid references public.clientes(id) on delete set null,
  cliente_nombre text not null,
  servicio_id uuid references public.servicios_programados(id) on delete set null,
  nota text,
  estado text not null default 'solicitado'
    check (estado in ('solicitado', 'por_firmar', 'en_uso', 'devolucion_por_confirmar', 'cerrado', 'rechazado', 'cancelado')),
  entregado_por uuid references public.profiles(id),
  entregado_en timestamptz,
  nota_entrega text,
  firma_recepcion text,
  firmado_en timestamptz,
  fecha_limite timestamptz,
  extension_dias integer,
  extension_motivo text,
  extension_estado text check (extension_estado is null or extension_estado in ('pendiente', 'aprobada', 'rechazada')),
  devuelto_en timestamptz,
  fotos_devolucion text[] not null default '{}',
  nota_devolucion text,
  recibido_por uuid references public.profiles(id),
  recibido_en timestamptz,
  nota_recepcion text,
  motivo_rechazo text,
  created_at timestamptz not null default now()
);

create index if not exists idx_vales_tecnico on public.almacen_vales(tecnico_id);
create index if not exists idx_vales_estado on public.almacen_vales(estado);

create table if not exists public.almacen_vale_items (
  id uuid primary key default gen_random_uuid(),
  vale_id uuid not null references public.almacen_vales(id) on delete cascade,
  articulo_id uuid not null references public.almacen_articulos(id) on delete restrict,
  orden integer not null default 0,
  cantidad_solicitada numeric not null check (cantidad_solicitada > 0),
  cantidad_entregada numeric check (cantidad_entregada is null or cantidad_entregada >= 0),
  cantidad_devuelta numeric check (cantidad_devuelta is null or cantidad_devuelta >= 0),
  cantidad_recibida numeric check (cantidad_recibida is null or cantidad_recibida >= 0),
  -- Por qué no regresó todo: consumido (material), se quedó en obra, se
  -- dañó, se perdió u otro.
  motivo_faltante text check (motivo_faltante is null or motivo_faltante in ('consumido', 'en_obra', 'danado', 'perdido', 'otro')),
  nota text
);

create index if not exists idx_vale_items_vale on public.almacen_vale_items(vale_id);

alter table public.almacen_movimientos
  add column if not exists vale_id uuid references public.almacen_vales(id) on delete set null;
create index if not exists idx_movimientos_vale on public.almacen_movimientos(vale_id);

create table if not exists public.almacen_altas_solicitadas (
  id uuid primary key default gen_random_uuid(),
  tecnico_id uuid not null references public.profiles(id) default auth.uid(),
  descripcion text not null check (length(trim(descripcion)) >= 2),
  cantidad numeric not null default 1 check (cantidad > 0),
  unidad text not null default 'pza',
  contexto text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'atendida', 'descartada')),
  articulo_id uuid references public.almacen_articulos(id) on delete set null,
  atendido_por uuid references public.profiles(id),
  atendido_en timestamptz,
  nota_atencion text,
  created_at timestamptz not null default now()
);

-- ---------- 2) Lectura (RLS) ----------
alter table public.almacen_vales enable row level security;
alter table public.almacen_vale_items enable row level security;
alter table public.almacen_altas_solicitadas enable row level security;

drop policy if exists vales_lectura on public.almacen_vales;
create policy vales_lectura on public.almacen_vales for select to authenticated
  using (
    (tecnico_id = auth.uid() and public.mi_cuenta_activa())
    or public.puedo_gestionar_almacen()
    or public.get_my_role() = 'supervisor'
  );

drop policy if exists vale_items_lectura on public.almacen_vale_items;
create policy vale_items_lectura on public.almacen_vale_items for select to authenticated
  using (exists (select 1 from public.almacen_vales v where v.id = vale_id));

drop policy if exists altas_lectura on public.almacen_altas_solicitadas;
create policy altas_lectura on public.almacen_altas_solicitadas for select to authenticated
  using (tecnico_id = auth.uid() or public.puedo_gestionar_almacen() or public.get_my_role() = 'supervisor');

-- ---------- 3) Funciones de cada paso ----------
-- Existencia total disponible de un artículo para un servicio: lo reservado
-- a su proyecto más el inventario general.
create or replace function public.existencia_para_vale(p_articulo uuid, p_grupo uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(existencia), 0)
  from public.almacen_existencias
  where articulo_id = p_articulo
    and (inventario = 'general' or (p_grupo is not null and inventario = 'proyecto' and grupo_id = p_grupo));
$$;

-- El técnico pide. p_items = [{"articulo_id": "...", "cantidad": 2}, ...]
create or replace function public.crear_vale(
  p_cliente_id uuid, p_cliente_nombre text, p_servicio_id uuid, p_nota text, p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_folio text;
  it jsonb;
  v_orden integer := 0;
begin
  if not public.mi_cuenta_activa() then
    raise exception 'Tu cuenta está desactivada';
  end if;
  if coalesce(trim(p_cliente_nombre), '') = '' then
    raise exception 'Indica para qué cliente o servicio es';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un artículo';
  end if;
  if p_servicio_id is not null
     and public.get_my_role() is distinct from 'supervisor'
     and not exists (select 1 from public.servicio_tecnicos where servicio_id = p_servicio_id and tecnico_id = auth.uid()) then
    raise exception 'Ese servicio no está asignado a ti';
  end if;

  insert into public.almacen_vales (tecnico_id, cliente_id, cliente_nombre, servicio_id, nota)
  values (auth.uid(), p_cliente_id, trim(p_cliente_nombre), p_servicio_id, nullif(trim(coalesce(p_nota, '')), ''))
  returning id, folio into v_id, v_folio;

  for it in select * from jsonb_array_elements(p_items) loop
    if not exists (select 1 from public.almacen_articulos where id = (it->>'articulo_id')::uuid and activo) then
      raise exception 'Uno de los artículos no está en el inventario';
    end if;
    if coalesce((it->>'cantidad')::numeric, 0) <= 0 then
      raise exception 'Las cantidades deben ser mayores a cero';
    end if;
    insert into public.almacen_vale_items (vale_id, articulo_id, orden, cantidad_solicitada)
    values (v_id, (it->>'articulo_id')::uuid, v_orden, (it->>'cantidad')::numeric);
    v_orden := v_orden + 1;
  end loop;

  return jsonb_build_object('id', v_id, 'folio', v_folio);
end;
$$;

-- El almacenista entrega. p_items = [{"id": "<item>", "cantidad": 1}, ...]
-- Descuenta del inventario: primero lo reservado al proyecto del servicio,
-- luego el general. No deja entregar más de lo que hay.
create or replace function public.entregar_vale(p_vale uuid, p_items jsonb, p_nota text)
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
      fecha_limite = now() + interval '3 days'
  where id = p_vale;
end;
$$;

-- El técnico firma de recibido en su celular.
create or replace function public.firmar_vale(p_vale uuid, p_firma text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v record;
begin
  select * into v from public.almacen_vales where id = p_vale for update;
  if v.id is null or v.tecnico_id <> auth.uid() or not public.mi_cuenta_activa() then
    raise exception 'Este vale no es tuyo';
  end if;
  if v.estado <> 'por_firmar' then raise exception 'Este vale no está pendiente de firma'; end if;
  if p_firma is null or p_firma not like 'data:image/png;base64,%' or length(p_firma) > 400000 then
    raise exception 'Firma inválida';
  end if;
  update public.almacen_vales set estado = 'en_uso', firma_recepcion = p_firma, firmado_en = now() where id = p_vale;
end;
$$;

-- El técnico devuelve. p_items = [{"id": "<item>", "cantidad": 1, "motivo": "perdido", "nota": "..."}]
-- Foto de evidencia obligatoria. Lo que no regresa necesita motivo; en
-- material, lo que falta cuenta como consumido.
create or replace function public.devolver_vale(p_vale uuid, p_items jsonb, p_fotos text[], p_nota text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  it record;
  x jsonb;
  v_dev numeric;
  v_motivo text;
begin
  select * into v from public.almacen_vales where id = p_vale for update;
  if v.id is null or v.tecnico_id <> auth.uid() or not public.mi_cuenta_activa() then
    raise exception 'Este vale no es tuyo';
  end if;
  if v.estado not in ('en_uso', 'por_firmar') then raise exception 'Este vale no tiene nada por devolver'; end if;
  if p_fotos is null or array_length(p_fotos, 1) is null then
    raise exception 'Agrega al menos una foto de lo que entregas';
  end if;

  for it in
    select i.id, i.cantidad_entregada, a.categoria, a.descripcion
    from public.almacen_vale_items i join public.almacen_articulos a on a.id = i.articulo_id
    where i.vale_id = p_vale
  loop
    select e into x from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e where (e->>'id')::uuid = it.id;
    v_dev := coalesce((x->>'cantidad')::numeric, 0);
    if v_dev < 0 or v_dev > coalesce(it.cantidad_entregada, 0) then
      raise exception 'Cantidad devuelta inválida en «%»', it.descripcion;
    end if;
    v_motivo := nullif(x->>'motivo', '');
    if v_dev < coalesce(it.cantidad_entregada, 0) then
      if v_motivo is null then
        if it.categoria = 'material' then
          v_motivo := 'consumido';
        else
          raise exception 'Indica qué pasó con lo que no regresa de «%»', it.descripcion;
        end if;
      end if;
    else
      v_motivo := null;
    end if;
    update public.almacen_vale_items
    set cantidad_devuelta = v_dev, motivo_faltante = v_motivo, nota = nullif(trim(coalesce(x->>'nota', '')), '')
    where id = it.id;
  end loop;

  update public.almacen_vales
  set estado = 'devolucion_por_confirmar', devuelto_en = now(), fotos_devolucion = p_fotos,
      nota_devolucion = nullif(trim(coalesce(p_nota, '')), ''),
      firmado_en = coalesce(firmado_en, now())
  where id = p_vale;
end;
$$;

-- El almacenista confirma lo que recibió. p_items = [{"id": "<item>", "cantidad": 1}]
-- Regresa al inventario: primero al proyecto del que salió, el resto al general.
create or replace function public.recibir_devolucion_vale(p_vale uuid, p_items jsonb, p_nota text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  it record;
  v_rec numeric;
  v_salio_proy numeric;
  v_grupo uuid;
  v_a_proy numeric;
begin
  if not public.puedo_gestionar_almacen() or not public.mi_cuenta_activa() then
    raise exception 'Solo el almacén puede recibir devoluciones';
  end if;
  select * into v from public.almacen_vales where id = p_vale for update;
  if v.id is null then raise exception 'Vale no encontrado'; end if;
  if v.estado <> 'devolucion_por_confirmar' then raise exception 'Este vale no tiene una devolución por confirmar'; end if;

  for it in select i.id, i.articulo_id, i.cantidad_devuelta from public.almacen_vale_items i where i.vale_id = p_vale loop
    select coalesce((x->>'cantidad')::numeric, it.cantidad_devuelta) into v_rec
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x where (x->>'id')::uuid = it.id;
    v_rec := coalesce(v_rec, it.cantidad_devuelta, 0);
    if v_rec < 0 or v_rec > coalesce(it.cantidad_devuelta, 0) then
      raise exception 'No se puede recibir más de lo que el técnico devolvió';
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
    update public.almacen_vale_items set cantidad_recibida = v_rec where id = it.id;
  end loop;

  update public.almacen_vales
  set estado = 'cerrado', recibido_por = auth.uid(), recibido_en = now(), nota_recepcion = nullif(trim(coalesce(p_nota, '')), '')
  where id = p_vale;
end;
$$;

-- Más días: el técnico pide, el almacén resuelve.
create or replace function public.solicitar_extension_vale(p_vale uuid, p_dias integer, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v record;
begin
  select * into v from public.almacen_vales where id = p_vale for update;
  if v.id is null or v.tecnico_id <> auth.uid() or not public.mi_cuenta_activa() then
    raise exception 'Este vale no es tuyo';
  end if;
  if v.estado not in ('por_firmar', 'en_uso') then raise exception 'Este vale no está en uso'; end if;
  if p_dias is null or p_dias < 1 or p_dias > 60 then raise exception 'Pide entre 1 y 60 días'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escribe para qué necesitas más días'; end if;
  update public.almacen_vales
  set extension_dias = p_dias, extension_motivo = trim(p_motivo), extension_estado = 'pendiente'
  where id = p_vale;
end;
$$;

create or replace function public.resolver_extension_vale(p_vale uuid, p_aprobar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v record;
begin
  if not public.puedo_gestionar_almacen() or not public.mi_cuenta_activa() then
    raise exception 'Solo el almacén puede resolver plazos';
  end if;
  select * into v from public.almacen_vales where id = p_vale for update;
  if v.id is null or v.extension_estado is distinct from 'pendiente' then
    raise exception 'No hay una solicitud de más días pendiente';
  end if;
  update public.almacen_vales
  set extension_estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
      fecha_limite = case when p_aprobar then greatest(coalesce(fecha_limite, now()), now()) + make_interval(days => extension_dias) else fecha_limite end
  where id = p_vale;
end;
$$;

-- Cancelar (técnico) o rechazar (almacén) un vale que aún no se entrega.
create or replace function public.cancelar_vale(p_vale uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v record;
begin
  select * into v from public.almacen_vales where id = p_vale for update;
  if v.id is null then raise exception 'Vale no encontrado'; end if;
  if v.estado <> 'solicitado' then raise exception 'Solo se puede cancelar un vale que aún no se entrega'; end if;
  if public.puedo_gestionar_almacen() and public.mi_cuenta_activa() and v.tecnico_id <> auth.uid() then
    if coalesce(trim(p_motivo), '') = '' then raise exception 'Escribe por qué se rechaza'; end if;
    update public.almacen_vales set estado = 'rechazado', motivo_rechazo = trim(p_motivo) where id = p_vale;
  elsif v.tecnico_id = auth.uid() and public.mi_cuenta_activa() then
    update public.almacen_vales set estado = 'cancelado', motivo_rechazo = nullif(trim(coalesce(p_motivo, '')), '') where id = p_vale;
  else
    raise exception 'Sin permiso';
  end if;
end;
$$;

-- Lo que no está en el inventario: el técnico lo reporta.
create or replace function public.solicitar_alta_articulo(p_descripcion text, p_cantidad numeric, p_unidad text, p_contexto text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.mi_cuenta_activa() then raise exception 'Tu cuenta está desactivada'; end if;
  insert into public.almacen_altas_solicitadas (tecnico_id, descripcion, cantidad, unidad, contexto)
  values (auth.uid(), trim(p_descripcion), greatest(coalesce(p_cantidad, 1), 0.001), coalesce(nullif(trim(p_unidad), ''), 'pza'), nullif(trim(coalesce(p_contexto, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.resolver_alta_articulo(p_id uuid, p_estado text, p_articulo uuid, p_nota text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.puedo_gestionar_almacen() or not public.mi_cuenta_activa() then
    raise exception 'Solo el almacén puede atender estas solicitudes';
  end if;
  if p_estado not in ('atendida', 'descartada') then raise exception 'Estado inválido'; end if;
  update public.almacen_altas_solicitadas
  set estado = p_estado, articulo_id = p_articulo, atendido_por = auth.uid(), atendido_en = now(),
      nota_atencion = nullif(trim(coalesce(p_nota, '')), '')
  where id = p_id and estado = 'pendiente';
end;
$$;

revoke all on function public.existencia_para_vale(uuid, uuid) from public, anon;
grant execute on function public.existencia_para_vale(uuid, uuid) to authenticated;
revoke all on function public.crear_vale(uuid, text, uuid, text, jsonb) from public, anon;
grant execute on function public.crear_vale(uuid, text, uuid, text, jsonb) to authenticated;
revoke all on function public.entregar_vale(uuid, jsonb, text) from public, anon;
grant execute on function public.entregar_vale(uuid, jsonb, text) to authenticated;
revoke all on function public.firmar_vale(uuid, text) from public, anon;
grant execute on function public.firmar_vale(uuid, text) to authenticated;
revoke all on function public.devolver_vale(uuid, jsonb, text[], text) from public, anon;
grant execute on function public.devolver_vale(uuid, jsonb, text[], text) to authenticated;
revoke all on function public.recibir_devolucion_vale(uuid, jsonb, text) from public, anon;
grant execute on function public.recibir_devolucion_vale(uuid, jsonb, text) to authenticated;
revoke all on function public.solicitar_extension_vale(uuid, integer, text) from public, anon;
grant execute on function public.solicitar_extension_vale(uuid, integer, text) to authenticated;
revoke all on function public.resolver_extension_vale(uuid, boolean) from public, anon;
grant execute on function public.resolver_extension_vale(uuid, boolean) to authenticated;
revoke all on function public.cancelar_vale(uuid, text) from public, anon;
grant execute on function public.cancelar_vale(uuid, text) to authenticated;
revoke all on function public.solicitar_alta_articulo(text, numeric, text, text) from public, anon;
grant execute on function public.solicitar_alta_articulo(text, numeric, text, text) to authenticated;
revoke all on function public.resolver_alta_articulo(uuid, text, uuid, text) from public, anon;
grant execute on function public.resolver_alta_articulo(uuid, text, uuid, text) to authenticated;

-- ---------- 4) Fotos de devolución (bucket almacen, carpeta vales/<vale>/) ----------
drop policy if exists almacen_vales_fotos_insert on storage.objects;
create policy almacen_vales_fotos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'almacen'
    and (storage.foldername(name))[1] = 'vales'
    and exists (
      select 1 from public.almacen_vales v
      where v.id::text = (storage.foldername(name))[2] and v.tecnico_id = auth.uid()
    )
  );

drop policy if exists almacen_vales_fotos_select on storage.objects;
create policy almacen_vales_fotos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'almacen'
    and (storage.foldername(name))[1] = 'vales'
    and exists (
      select 1 from public.almacen_vales v
      where v.id::text = (storage.foldername(name))[2]
        and (v.tecnico_id = auth.uid() or public.puedo_gestionar_almacen() or public.get_my_role() = 'supervisor')
    )
  );

-- Verificación: deben salir 3 tablas y la función de entrega.
select
  to_regclass('public.almacen_vales') is not null as vales,
  to_regclass('public.almacen_vale_items') is not null as partidas,
  to_regclass('public.almacen_altas_solicitadas') is not null as altas,
  to_regprocedure('public.entregar_vale(uuid, jsonb, text)') is not null as entregar;
