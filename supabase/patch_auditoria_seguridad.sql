-- ============================================================
-- Auditoría de seguridad: cuentas desactivadas y edición de reportes
-- ============================================================
-- Continúa patch_fix_activo_en_funciones_rol.sql (get_my_role y permisos de
-- almacén/facturación ya respetan profiles.activo). Aquí:
--
-- 1) Funciones security definer que autorizaban solo con auth.uid() y no
--    miraban si la cuenta está activa: un usuario dado de baja con una
--    sesión todavía válida podía seguir usándolas.
--      · puede_gestionar_usuarios  (CRÍTICO: un administrador de usuarios
--        desactivado podía seguir creando/editando cuentas)
--      · registrar_salida_resguardo, personal_de_servicio (técnico)
--      · catalogo_clientes, agregar_alias_cliente
--      · confirmar_servicio, marcar_servicios_vistos, sitios_activos_hoy
--    Los cuerpos son idénticos a la versión vigente; solo se agrega la
--    revisión de cuenta activa.
-- 2) Las dos funciones viejas de push (suscripciones_para_envio,
--    destinatarios_notificacion) se revocan si todavía existen. Hoy ya no se
--    pueden llamar sin sesión; esto lo deja cerrado también con sesión.
-- 3) Reportes: la política reports_update_own deja al creador actualizar su
--    reporte SIEMPRE; el «solo con corrección autorizada» lo ponía la app.
--    Ahora lo exige la base: un técnico solo puede cambiar fecha, cliente,
--    tipo o el contenido de su reporte si hay una corrección autorizada o si
--    lo acaba de crear (30 min, para adjuntar las fotos). Fuera de eso solo
--    puede: pedir corrección, pedir la firma a distancia y marcar el
--    servicio como concluido. Supervisores, facturación y los procesos
--    internos (firma a distancia del cliente, triggers) no cambian.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.
-- Después correr supabase/verificar_auditoria_seguridad.sql (no cambia nada).

-- ---------- 0) Helper ----------
create or replace function public.mi_cuenta_activa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and activo = true);
$$;
revoke all on function public.mi_cuenta_activa() from public, anon;
grant execute on function public.mi_cuenta_activa() to authenticated, service_role;

-- ---------- 1) Funciones con cuenta activa ----------
create or replace function public.puede_gestionar_usuarios()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select can_manage_usuarios from public.profiles where id = auth.uid() and activo = true),
    false
  );
$$;

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
  -- Autorización explícita: supervisor o técnico activo asignado a ese día.
  if not (
    public.get_my_role() = 'supervisor'
    or (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.activo = true)
      and exists (select 1 from public.servicio_tecnicos st
                 where st.servicio_id = p_servicio_id and st.tecnico_id = auth.uid())
    )
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

create or replace function public.personal_de_servicio(p_servicio_id uuid)
returns table (full_name text)
language sql
security definer
set search_path = public
as $$
  select p.full_name
  from public.servicio_tecnicos st
  join public.profiles p on p.id = st.tecnico_id
  where st.servicio_id = p_servicio_id
    and (
      public.get_my_role() = 'supervisor'
      or (
        exists (select 1 from public.profiles yo where yo.id = auth.uid() and yo.activo = true)
        and exists (
          select 1
          from public.servicio_tecnicos mio
          where mio.servicio_id = p_servicio_id
            and mio.tecnico_id = auth.uid()
        )
      )
    )
  order by p.full_name;
$$;

create or replace function public.catalogo_clientes()
returns table (id uuid, nombre text, alias text[], contactos jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.nombre,
         coalesce((select array_agg(a.alias order by a.alias) from public.cliente_alias a where a.cliente_id = c.id), '{}'),
         coalesce((select jsonb_agg(jsonb_build_object('nombre', k.nombre, 'puesto', k.puesto) order by k.nombre)
                   from public.cliente_contactos k where k.cliente_id = c.id), '[]'::jsonb)
  from public.clientes c
  where public.mi_cuenta_activa()
  order by c.nombre;
$$;

create or replace function public.agregar_alias_cliente(p_cliente uuid, p_alias text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text := public.normalizar_nombre(p_alias);
begin
  if not public.mi_cuenta_activa() or v_norm = '' then
    return;
  end if;
  -- Si ya es el nombre de algún cliente, no hace falta alias.
  if exists (select 1 from public.clientes where nombre_norm = v_norm) then
    return;
  end if;
  insert into public.cliente_alias (cliente_id, alias, created_by)
  values (p_cliente, trim(p_alias), auth.uid())
  on conflict (alias_norm) do nothing;
end;
$$;

create or replace function public.confirmar_servicio(p_servicio uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupo uuid;
  v_n integer;
begin
  if not public.mi_cuenta_activa() then
    raise exception 'Cuenta desactivada';
  end if;
  select grupo_id into v_grupo from public.servicios_programados where id = p_servicio;
  if v_grupo is null then
    raise exception 'Servicio no encontrado';
  end if;

  update public.servicio_tecnicos st
  set enterado_en = now(),
      visto_en = coalesce(st.visto_en, now())
  from public.servicios_programados sp
  where sp.id = st.servicio_id
    and sp.grupo_id = v_grupo
    and st.tecnico_id = auth.uid()
    and st.enterado_en is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.marcar_servicios_vistos(p_servicios uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.servicio_tecnicos
  set visto_en = now()
  where tecnico_id = auth.uid()
    and public.mi_cuenta_activa()
    and servicio_id = any (p_servicios)
    and visto_en is null;
$$;

create or replace function public.sitios_activos_hoy()
returns table (servicio_id uuid, lat numeric, lng numeric, radio_m integer)
language sql
security definer
set search_path = public
as $$
  select
    sp.id as servicio_id,
    (sp.ubicacion_programada->>'lat')::numeric as lat,
    (sp.ubicacion_programada->>'lng')::numeric as lng,
    sp.radio_geocerca_m as radio_m
  from public.servicios_programados sp
  where sp.fecha = current_date
    and sp.estado in ('programado', 'en_sitio', 'en_curso')
    and sp.ubicacion_programada is not null
    and public.mi_cuenta_activa()
    and not exists (
      select 1 from public.servicio_tecnicos st
      where st.servicio_id = sp.id and st.tecnico_id = auth.uid()
    );
$$;

-- ---------- 2) Funciones viejas de push ----------
do $$
begin
  if to_regprocedure('public.suscripciones_para_envio(uuid[])') is not null then
    execute 'revoke all on function public.suscripciones_para_envio(uuid[]) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.destinatarios_notificacion(text)') is not null then
    execute 'revoke all on function public.destinatarios_notificacion(text) from public, anon, authenticated';
  end if;
end $$;

-- ---------- 3) Edición de reportes ----------
create or replace function public.proteger_edicion_reporte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permitidas constant text[] := array['firmaRemota', 'servicioConcluido', 'fechaConcluido', 'facturaEstado'];
  v_cambiadas text[];
begin
  -- Procesos internos: firma del cliente por enlace (sin sesión), triggers
  -- de facturación, cron. Y supervisores / facturación, que ya tienen sus
  -- propias reglas.
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return new;
  end if;
  if public.get_my_role() = 'supervisor' or public.puedo_gestionar_facturacion() then
    return new;
  end if;

  if not public.mi_cuenta_activa() then
    raise exception 'Tu cuenta está desactivada';
  end if;

  -- Con corrección autorizada (o recién creado, para adjuntar fotos), el
  -- técnico puede editar su reporte. La app limita la corrección completa a
  -- reportes sin firma del cliente.
  if old.correccion_habilitada or old.created_at > now() - interval '30 minutes' then
    return new;
  end if;

  if new.fecha is distinct from old.fecha
     or new.empresa_cliente is distinct from old.empresa_cliente
     or new.cliente_id is distinct from old.cliente_id
     or new.tipo_servicio is distinct from old.tipo_servicio
     or new.sub_tipo_servicio is distinct from old.sub_tipo_servicio
     or new.created_by is distinct from old.created_by then
    raise exception 'Para cambiar el reporte pide una corrección al supervisor';
  end if;

  select coalesce(array_agg(k), '{}') into v_cambiadas
  from (
    select key as k from jsonb_each(coalesce(new.data, '{}'::jsonb))
    union
    select key from jsonb_each(coalesce(old.data, '{}'::jsonb))
  ) llaves
  where (new.data -> k) is distinct from (old.data -> k);

  if not (v_cambiadas <@ v_permitidas) then
    raise exception 'Para cambiar el reporte pide una corrección al supervisor (campos: %)',
      array_to_string(array(select unnest(v_cambiadas) except select unnest(v_permitidas)), ', ');
  end if;
  -- El técnico puede marcar su servicio como concluido, pero no el estado
  -- de la factura (eso es de facturación).
  if (new.data -> 'facturaEstado') is distinct from (old.data -> 'facturaEstado')
     and coalesce(new.data ->> 'facturaEstado', 'pendiente') <> 'pendiente' then
    raise exception 'El estado de la factura lo cambia facturación';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_edicion_reporte on public.reports;
create trigger trg_proteger_edicion_reporte
  before update on public.reports
  for each row execute function public.proteger_edicion_reporte();

-- Verificación rápida: deben salir las 3 en true.
select
  to_regprocedure('public.mi_cuenta_activa()') is not null as helper,
  exists (select 1 from pg_trigger where tgname = 'trg_proteger_edicion_reporte') as trigger_reportes,
  position('activo = true' in pg_get_functiondef('public.puede_gestionar_usuarios()'::regprocedure)) > 0 as gestion_usuarios;
