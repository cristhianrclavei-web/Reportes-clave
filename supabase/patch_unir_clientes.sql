-- ============================================================
-- Clientes fase 2: unir duplicados y vincular reportes viejos
-- ============================================================
-- 1) cliente_duplicado_descartado: pares que un supervisor marcó como
--    «No son el mismo», para no volver a sugerirlos.
-- 2) unir_clientes(): junta varios clientes y/o nombres sueltos de reportes
--    en uno solo:
--      · p_principal: el cliente que se queda (null = crear uno nuevo con
--        p_nombre);
--      · p_nombre: nombre final (si cambia, el anterior queda como alias);
--      · p_otros: clientes que se absorben (sus reportes, proyectos,
--        contactos y alias pasan al principal; sus datos llenan los campos
--        vacíos del principal; su nombre queda como alias; se borran);
--      · p_nombres: nombres escritos en reportes sin vincular; esos reportes
--        se ligan al principal y el nombre queda como alias.
--    Al ligar reportes, el disparador de contactos registra solo a sus
--    contactos. Queda en Actividad. Solo supervisores.
--
-- Requiere patch_clientes_vinculo_reportes.sql. Ejecutar completo en el SQL
-- Editor de Supabase. Idempotente.

-- ---------- 1) Pares descartados ----------
create table if not exists public.cliente_duplicado_descartado (
  a_norm text not null,
  b_norm text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (a_norm, b_norm)
);

alter table public.cliente_duplicado_descartado enable row level security;

drop policy if exists cliente_duplicado_descartado_supervisor on public.cliente_duplicado_descartado;
create policy cliente_duplicado_descartado_supervisor on public.cliente_duplicado_descartado for all
  using (public.get_my_role() = 'supervisor') with check (public.get_my_role() = 'supervisor');

-- ---------- 2) Unir ----------
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

  -- Principal: existente (con posible cambio de nombre) o nuevo.
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

  -- Clientes que se absorben.
  foreach o in array coalesce(p_otros, '{}'::uuid[]) loop
    continue when o = v_id or not exists (select 1 from public.clientes where id = o);

    update public.reports set cliente_id = v_id where cliente_id = o;
    get diagnostics v_tmp = row_count;
    v_rep := v_rep + v_tmp;

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

    -- Los datos del absorbido llenan lo que al principal le falte.
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

  -- Nombres sueltos de reportes sin vincular.
  foreach n in array coalesce(p_nombres, '{}'::text[]) loop
    continue when public.normalizar_nombre(n) = '';
    update public.reports set cliente_id = v_id
    where cliente_id is null
      and public.normalizar_nombre(empresa_cliente) = public.normalizar_nombre(n);
    get diagnostics v_tmp = row_count;
    v_rep := v_rep + v_tmp;
    v_absorbidos := v_absorbidos || trim(n);

    if public.normalizar_nombre(n) <> v_norm then
      insert into public.cliente_alias (cliente_id, alias, created_by)
      values (v_id, trim(n), auth.uid())
      on conflict (alias_norm) do nothing;
    end if;
  end loop;

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

-- Verificación: debe devolver 1 fila con la función creada.
select proname from pg_proc where proname = 'unir_clientes';
