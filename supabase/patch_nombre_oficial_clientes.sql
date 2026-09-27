-- ============================================================
-- Nombre oficial del cliente en reportes, cotizaciones y levantamientos
-- ============================================================
-- Hasta ahora el documento se ligaba al cliente pero conservaba lo que se
-- escribió («Plaza del angel»), así que en listas, búsquedas y PDF seguía
-- saliendo distinto del nombre de Clientes. Desde aquí:
--
-- 1) Al guardar un documento ligado a un cliente, su texto de empresa toma
--    el nombre oficial del cliente.
-- 2) Si un cliente se renombra, todos sus documentos se actualizan.
-- 3) unir_clientes() también mueve cotizaciones, levantamientos y servicios
--    de los clientes absorbidos, liga por nombre los sueltos de cotizaciones
--    y levantamientos, y deja el nombre final en todos los documentos.
-- 4) Se actualizan los documentos que ya existen.
--
-- Los servicios programados conservan su nombre (lleva la etapa).
-- Requiere patch_clientes_vinculo_reportes.sql, patch_clientes_fase3.sql y
-- patch_unir_clientes.sql. Ejecutar completo en el SQL Editor de Supabase.
-- Idempotente.

-- ---------- 1a) Reportes ----------
create or replace function public.vincular_cliente_reporte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text;
  v_id uuid;
  v_oficial text;
begin
  if tg_op = 'UPDATE' then
    if new.empresa_cliente is not distinct from old.empresa_cliente then
      return new;
    end if;
    if new.cliente_id is not distinct from old.cliente_id then
      new.cliente_id := null;
    end if;
  end if;

  if new.cliente_id is null then
    v_norm := public.normalizar_nombre(new.empresa_cliente);
    if v_norm = '' then
      return new;
    end if;

    select id into v_id from public.clientes where nombre_norm = v_norm order by created_at limit 1;
    if v_id is null then
      select cliente_id into v_id from public.cliente_alias where alias_norm = v_norm limit 1;
    end if;
    if v_id is null then
      insert into public.clientes (nombre, created_by, pendiente_revision)
      values (trim(new.empresa_cliente), new.created_by, true)
      returning id into v_id;
    end if;
    new.cliente_id := v_id;
  end if;

  select nombre into v_oficial from public.clientes where id = new.cliente_id;
  if v_oficial is not null then
    new.empresa_cliente := v_oficial;
  end if;
  return new;
end;
$$;

-- ---------- 1b) Cotizaciones, levantamientos (y servicios, sin renombrar) ----------
create or replace function public.vincular_cliente_generico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_col text := tg_argv[0];
  v_crear boolean := coalesce(tg_argv[1], 'crear') = 'crear';
  v_texto text := to_jsonb(new) ->> v_col;
  v_norm text;
  v_id uuid;
  v_actor uuid;
  v_oficial text;
begin
  if tg_op = 'UPDATE' then
    if v_texto is not distinct from (to_jsonb(old) ->> v_col) then
      return new;
    end if;
    if new.cliente_id is not distinct from old.cliente_id then
      new.cliente_id := null;
    end if;
  end if;

  if new.cliente_id is null then
    v_norm := public.normalizar_nombre(v_texto);
    if v_norm = '' then
      return new;
    end if;

    select id into v_id from public.clientes where nombre_norm = v_norm order by created_at limit 1;
    if v_id is null then
      select cliente_id into v_id from public.cliente_alias where alias_norm = v_norm limit 1;
    end if;

    if v_id is null and v_crear then
      v_actor := coalesce(
        auth.uid(),
        (to_jsonb(new) ->> 'created_by')::uuid,
        (to_jsonb(new) ->> 'creado_por')::uuid
      );
      if v_actor is not null then
        insert into public.clientes (nombre, created_by, pendiente_revision)
        values (trim(v_texto), v_actor, true)
        returning id into v_id;
      end if;
    end if;
    new.cliente_id := v_id;
  end if;

  -- Documentos (modo 'crear'): el texto toma el nombre oficial.
  if v_crear and new.cliente_id is not null then
    select nombre into v_oficial from public.clientes where id = new.cliente_id;
    if v_oficial is not null then
      new := jsonb_populate_record(new, jsonb_build_object(v_col, v_oficial));
    end if;
  end if;
  return new;
end;
$$;

-- ---------- 2) Renombrar un cliente actualiza sus documentos ----------
create or replace function public.sincronizar_nombre_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.nombre is not distinct from old.nombre then
    return new;
  end if;
  update public.reports set empresa_cliente = new.nombre
  where cliente_id = new.id and empresa_cliente is distinct from new.nombre;
  update public.cotizaciones set empresa = new.nombre
  where cliente_id = new.id and empresa is distinct from new.nombre;
  update public.levantamientos set empresa = new.nombre
  where cliente_id = new.id and empresa is distinct from new.nombre;
  return new;
end;
$$;

drop trigger if exists trg_sincronizar_nombre_cliente on public.clientes;
create trigger trg_sincronizar_nombre_cliente
  after update of nombre on public.clientes
  for each row execute function public.sincronizar_nombre_cliente();

-- ---------- 3) Unir clientes, ahora para todos los documentos ----------
create or replace function public.unir_clientes(
  p_principal uuid,
  p_nombre text,
  p_otros uuid[],
  p_nombres text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_principal;
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_viejo text;
  v_norm text;
  o uuid;
  n text;
  v_absorbidos text[] := '{}';
  v_rep int := 0;
  v_tmp int;
begin
  if public.get_my_role() is distinct from 'supervisor' then
    raise exception 'Solo un supervisor puede unir clientes';
  end if;

  if v_id is null then
    if v_nombre = '' then
      raise exception 'Falta el nombre del cliente';
    end if;
    insert into public.clientes (nombre, created_by) values (v_nombre, auth.uid()) returning id into v_id;
  else
    select nombre into v_viejo from public.clientes where id = v_id;
    if v_viejo is null then
      raise exception 'No se encontró el cliente principal';
    end if;
    if v_nombre <> '' and v_nombre <> v_viejo then
      update public.clientes set nombre = v_nombre where id = v_id;
      if public.normalizar_nombre(v_nombre) <> public.normalizar_nombre(v_viejo) then
        insert into public.cliente_alias (cliente_id, alias, created_by)
        values (v_id, v_viejo, auth.uid())
        on conflict (alias_norm) do nothing;
      end if;
    end if;
  end if;

  update public.clientes set pendiente_revision = false where id = v_id;
  select nombre_norm, nombre into v_norm, v_nombre from public.clientes where id = v_id;

  foreach o in array coalesce(p_otros, '{}'::uuid[]) loop
    continue when o = v_id or not exists (select 1 from public.clientes where id = o);

    update public.reports set cliente_id = v_id where cliente_id = o;
    get diagnostics v_tmp = row_count;
    v_rep := v_rep + v_tmp;
    update public.cotizaciones set cliente_id = v_id where cliente_id = o;
    update public.levantamientos set cliente_id = v_id where cliente_id = o;
    update public.servicios_programados set cliente_id = v_id where cliente_id = o;
    update public.proyectos set cliente_id = v_id where cliente_id = o;

    delete from public.cliente_contactos k
    where k.cliente_id = o
      and exists (
        select 1 from public.cliente_contactos p
        where p.cliente_id = v_id
          and public.normalizar_nombre(p.nombre) = public.normalizar_nombre(k.nombre)
      );
    update public.cliente_contactos set cliente_id = v_id where cliente_id = o;
    update public.cliente_alias set cliente_id = v_id where cliente_id = o;

    update public.clientes p set
      direccion = coalesce(p.direccion, x.direccion),
      calle = coalesce(p.calle, x.calle),
      num_exterior = coalesce(p.num_exterior, x.num_exterior),
      num_interior = coalesce(p.num_interior, x.num_interior),
      colonia = coalesce(p.colonia, x.colonia),
      codigo_postal = coalesce(p.codigo_postal, x.codigo_postal),
      ciudad = coalesce(p.ciudad, x.ciudad),
      estado = coalesce(p.estado, x.estado),
      logo_path = coalesce(p.logo_path, x.logo_path),
      foto_portada_path = coalesce(p.foto_portada_path, x.foto_portada_path)
    from public.clientes x
    where p.id = v_id and x.id = o;

    select nombre into n from public.clientes where id = o;
    v_absorbidos := v_absorbidos || n;
    delete from public.clientes where id = o;

    if public.normalizar_nombre(n) <> v_norm then
      insert into public.cliente_alias (cliente_id, alias, created_by)
      values (v_id, n, auth.uid())
      on conflict (alias_norm) do nothing;
    end if;
  end loop;

  foreach n in array coalesce(p_nombres, '{}'::text[]) loop
    continue when public.normalizar_nombre(n) = '';
    update public.reports set cliente_id = v_id
    where cliente_id is null
      and public.normalizar_nombre(empresa_cliente) = public.normalizar_nombre(n);
    get diagnostics v_tmp = row_count;
    v_rep := v_rep + v_tmp;
    update public.cotizaciones set cliente_id = v_id
    where cliente_id is null and public.normalizar_nombre(empresa) = public.normalizar_nombre(n);
    update public.levantamientos set cliente_id = v_id
    where cliente_id is null and public.normalizar_nombre(empresa) = public.normalizar_nombre(n);
    v_absorbidos := v_absorbidos || trim(n);

    if public.normalizar_nombre(n) <> v_norm then
      insert into public.cliente_alias (cliente_id, alias, created_by)
      values (v_id, trim(n), auth.uid())
      on conflict (alias_norm) do nothing;
    end if;
  end loop;

  -- Todos los documentos del cliente con su nombre final.
  update public.reports set empresa_cliente = v_nombre
  where cliente_id = v_id and empresa_cliente is distinct from v_nombre;
  update public.cotizaciones set empresa = v_nombre
  where cliente_id = v_id and empresa is distinct from v_nombre;
  update public.levantamientos set empresa = v_nombre
  where cliente_id = v_id and empresa is distinct from v_nombre;

  insert into public.auditoria_global (actor_id, accion, entidad, entidad_id, detalle)
  values (
    auth.uid(), 'unio_clientes', 'proyecto', v_id,
    case when coalesce(array_length(v_absorbidos, 1), 0) = 0
      then 'Dio de alta al cliente «' || v_nombre || '»'
      else 'Unió «' || array_to_string(v_absorbidos, '», «') || '» en «' || v_nombre || '» (' || v_rep || ' reporte(s) vinculados)'
    end
  );

  return jsonb_build_object('cliente_id', v_id, 'reportes', v_rep);
end;
$$;

revoke all on function public.unir_clientes(uuid, text, uuid[], text[]) from public, anon;
grant execute on function public.unir_clientes(uuid, text, uuid[], text[]) to authenticated;

-- ---------- 4) Documentos que ya existen ----------
update public.reports r set empresa_cliente = c.nombre
from public.clientes c
where r.cliente_id = c.id and r.empresa_cliente is distinct from c.nombre;

update public.cotizaciones t set empresa = c.nombre
from public.clientes c
where t.cliente_id = c.id and t.empresa is distinct from c.nombre;

update public.levantamientos t set empresa = c.nombre
from public.clientes c
where t.cliente_id = c.id and t.empresa is distinct from c.nombre;

-- Verificación: debe dar 0 en las tres columnas (ningún documento ligado
-- con un nombre distinto al de su cliente).
select
  (select count(*) from public.reports r join public.clientes c on c.id = r.cliente_id where r.empresa_cliente <> c.nombre) as reportes_distintos,
  (select count(*) from public.cotizaciones t join public.clientes c on c.id = t.cliente_id where t.empresa <> c.nombre) as cotizaciones_distintas,
  (select count(*) from public.levantamientos t join public.clientes c on c.id = t.cliente_id where t.empresa <> c.nombre) as levantamientos_distintos;
