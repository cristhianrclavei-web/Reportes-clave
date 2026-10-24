-- ============================================================
-- Actividad por sección
-- ============================================================
-- Cada sección (Servicios, Reportes, Cotizaciones, Facturación, Clientes,
-- Personal y Almacén) tiene su subsección «Actividad» con lo que pasó en
-- ella. Para eso:
--   1. auditoria_global lleva la sección de cada registro (columna
--      «seccion»), también los de antes.
--   2. La base anota sola los cambios de las tablas que todavía no se
--      registraban: cotizaciones, levantamientos, clientes, facturas,
--      almacén (artículos, movimientos, vales, traspasos y conteos),
--      reportes y solicitudes de personal. Así se registran aunque se hagan
--      desde cualquier pantalla.
--   3. Si la app anota algo más específico del mismo registro (por ejemplo
--      «Aplicó una corrección»), ese reemplaza al genérico «Modificó el
--      reporte» para no duplicar.
--   4. Quien maneja el almacén ve la actividad del almacén, y quien
--      factura, la de facturación (supervisión ve todo, como antes).
--
-- Solo se anota lo que hace una persona con sesión (auth.uid()); procesos
-- automáticos (firma por enlace, cron) no llenan la actividad.
--
-- Aditivo e idempotente. Ejecutar completo en el SQL Editor de Supabase.

-- ---------- 1. Columnas ----------
alter table public.auditoria_global add column if not exists seccion text;
-- true = lo anotó la base (genérico); false = lo anotó la app (específico).
alter table public.auditoria_global add column if not exists automatico boolean not null default false;
-- La entidad ya no se limita a servicio/reporte/proyecto/día.
alter table public.auditoria_global drop constraint if exists auditoria_global_entidad_check;

create index if not exists idx_auditoria_global_seccion on public.auditoria_global (seccion, created_at desc);

-- Sección de un registro según su acción y entidad.
create or replace function public.seccion_de_actividad(p_accion text, p_entidad text)
returns text
language sql
immutable
as $$
  select case
    when p_accion in ('justifico_dia', 'autorizo_justificacion', 'rechazo_justificacion', 'marco_festivo', 'quito_festivo') then 'reportes'
    when p_accion in ('subio_factura', 'marco_no_facturable') then 'facturacion'
    when p_accion in ('agrego_insumo', 'solicito_insumo', 'aprobo_insumo', 'rechazo_insumo', 'firmo_resguardo', 'devolvio_herramienta', 'recibio_herramienta') then 'almacen'
    when p_accion in ('creo_usuario', 'edito_usuario', 'elimino_usuario') then 'personal'
    when p_accion in ('unio_clientes', 'creo_proyecto', 'actualizo_estado_proyecto', 'elimino_proyecto') then 'clientes'
    when p_entidad in ('reporte', 'levantamiento') then 'reportes'
    when p_entidad = 'cotizacion' then 'cotizaciones'
    when p_entidad = 'factura' then 'facturacion'
    when p_entidad in ('cliente', 'proyecto') then 'clientes'
    when p_entidad in ('articulo', 'movimiento', 'vale', 'traspaso', 'conteo') then 'almacen'
    when p_entidad in ('usuario', 'solicitud') then 'personal'
    else 'servicios'
  end;
$$;

update public.auditoria_global
   set seccion = public.seccion_de_actividad(accion, entidad)
 where seccion is null;

-- ---------- 2. Al anotar: sección y sin duplicados ----------
create or replace function public.preparar_actividad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.seccion is null then
    new.seccion := public.seccion_de_actividad(new.accion, new.entidad);
  end if;
  -- Lo que anota la app es más claro que el genérico «Modificó…/Editó…» de
  -- la base: si hace poco se anotó uno del mismo registro y la misma
  -- persona, se quita (también «Eliminó…», que la app anota con más
  -- detalle). Las altas se quedan.
  if not new.automatico and new.entidad_id is not null then
    delete from public.auditoria_global g
     where g.automatico
       and (g.accion like 'modifico\_%' or g.accion like 'edito\_%' or g.accion like 'elimino\_%')
       and g.actor_id = new.actor_id
       and g.entidad_id = new.entidad_id
       and g.created_at > now() - interval '3 minutes';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_preparar_actividad on public.auditoria_global;
create trigger trg_preparar_actividad
  before insert on public.auditoria_global
  for each row execute function public.preparar_actividad();

-- Anota un registro hecho por la base. No anota nada sin sesión.
create or replace function public.anotar_actividad(p_accion text, p_entidad text, p_entidad_id uuid, p_detalle text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  -- Si la app ya anotó algo específico de este registro hace un momento,
  -- no hace falta el genérico.
  if exists (
    select 1 from public.auditoria_global g
     where not g.automatico and g.actor_id = auth.uid() and g.entidad_id = p_entidad_id
       and g.created_at > now() - interval '1 minute'
  ) then
    return;
  end if;
  -- Anotar nunca debe impedir el cambio que se está guardando.
  begin
    insert into public.auditoria_global (actor_id, accion, entidad, entidad_id, detalle, automatico)
    values (auth.uid(), p_accion, p_entidad, p_entidad_id, left(p_detalle, 500), true);
  exception when others then
    raise warning 'No se pudo anotar la actividad %: %', p_accion, sqlerrm;
  end;
end;
$$;

revoke all on function public.anotar_actividad(text, text, uuid, text) from public, anon, authenticated;

-- ---------- 3. Cotizaciones ----------
create or replace function public.actividad_cotizaciones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.anotar_actividad('creo_cotizacion', 'cotizacion', new.id,
      format('Creó la cotización %s para %s', new.folio, coalesce(new.empresa, 'sin cliente')));
  elsif tg_op = 'DELETE' then
    perform public.anotar_actividad('elimino_cotizacion', 'cotizacion', old.id,
      format('Eliminó la cotización %s de %s', old.folio, coalesce(old.empresa, 'sin cliente')));
    return old;
  elsif new.estado is distinct from old.estado then
    perform public.anotar_actividad('cambio_estado_cotizacion', 'cotizacion', new.id,
      format('Cotización %s de %s: %s → %s', new.folio, coalesce(new.empresa, ''), old.estado, new.estado));
  elsif to_jsonb(new) - 'updated_at' is distinct from to_jsonb(old) - 'updated_at' then
    perform public.anotar_actividad('edito_cotizacion', 'cotizacion', new.id,
      format('Editó la cotización %s de %s', new.folio, coalesce(new.empresa, '')));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_actividad_cotizaciones on public.cotizaciones;
create trigger trg_actividad_cotizaciones
  after insert or update or delete on public.cotizaciones
  for each row execute function public.actividad_cotizaciones();

-- ---------- 4. Levantamientos (Reportes → Levantamientos) ----------
create or replace function public.actividad_levantamientos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.anotar_actividad('creo_levantamiento', 'levantamiento', new.id,
      format('Hizo el levantamiento %s de %s', new.folio, new.empresa));
  elsif tg_op = 'DELETE' then
    perform public.anotar_actividad('elimino_levantamiento', 'levantamiento', old.id,
      format('Eliminó el levantamiento %s de %s', old.folio, old.empresa));
    return old;
  elsif to_jsonb(new) - 'updated_at' is distinct from to_jsonb(old) - 'updated_at' then
    perform public.anotar_actividad('edito_levantamiento', 'levantamiento', new.id,
      format('Editó el levantamiento %s de %s', new.folio, new.empresa));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_actividad_levantamientos on public.levantamientos;
create trigger trg_actividad_levantamientos
  after insert or update or delete on public.levantamientos
  for each row execute function public.actividad_levantamientos();

-- ---------- 5. Clientes ----------
create or replace function public.actividad_clientes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.anotar_actividad('creo_cliente', 'cliente', new.id, format('Dio de alta al cliente %s', new.nombre));
  elsif tg_op = 'DELETE' then
    perform public.anotar_actividad('elimino_cliente', 'cliente', old.id, format('Eliminó al cliente %s', old.nombre));
    return old;
  elsif new.nombre is distinct from old.nombre then
    perform public.anotar_actividad('edito_cliente', 'cliente', new.id, format('Cambió el nombre del cliente «%s» a «%s»', old.nombre, new.nombre));
  elsif to_jsonb(new) is distinct from to_jsonb(old) then
    perform public.anotar_actividad('edito_cliente', 'cliente', new.id, format('Editó los datos del cliente %s', new.nombre));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_actividad_clientes on public.clientes;
create trigger trg_actividad_clientes
  after insert or update or delete on public.clientes
  for each row execute function public.actividad_clientes();

-- ---------- 6. Facturas ----------
create or replace function public.actividad_facturas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.anotar_actividad('creo_factura', 'factura', new.id, format('Creó la prefactura %s para %s', new.folio, new.receptor_nombre));
  elsif tg_op = 'DELETE' then
    perform public.anotar_actividad('elimino_factura', 'factura', old.id, format('Eliminó la factura %s de %s', old.folio, old.receptor_nombre));
    return old;
  elsif new.estado is distinct from old.estado then
    perform public.anotar_actividad('cambio_estado_factura', 'factura', new.id,
      format('Factura %s de %s: %s → %s', new.folio, new.receptor_nombre, old.estado, new.estado));
  elsif to_jsonb(new) - 'updated_at' is distinct from to_jsonb(old) - 'updated_at' then
    perform public.anotar_actividad('edito_factura', 'factura', new.id, format('Editó la factura %s de %s', new.folio, new.receptor_nombre));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_actividad_facturas on public.facturas;
create trigger trg_actividad_facturas
  after insert or update or delete on public.facturas
  for each row execute function public.actividad_facturas();

-- ---------- 7. Almacén ----------
create or replace function public.actividad_almacen_movimientos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_articulo text;
  v_tipo text;
begin
  select a.descripcion || ' (' || a.unidad || ')' into v_articulo from public.almacen_articulos a where a.id = new.articulo_id;
  v_tipo := case new.tipo when 'entrada' then 'Entrada' when 'salida' then 'Salida' when 'retorno' then 'Regreso' else initcap(new.tipo) end;
  perform public.anotar_actividad('movimiento_almacen', 'movimiento', new.id,
    format('%s de %s · %s%s', v_tipo, trim(to_char(new.cantidad, 'FM999999990.##')), coalesce(v_articulo, 'artículo'),
      case when coalesce(new.nota, '') <> '' then ' · ' || new.nota else '' end));
  return new;
end;
$$;

drop trigger if exists trg_actividad_almacen_movimientos on public.almacen_movimientos;
create trigger trg_actividad_almacen_movimientos
  after insert on public.almacen_movimientos
  for each row execute function public.actividad_almacen_movimientos();

create or replace function public.actividad_almacen_articulos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.anotar_actividad('creo_articulo', 'articulo', new.id, format('Dio de alta el artículo %s', new.descripcion));
  elsif tg_op = 'DELETE' then
    perform public.anotar_actividad('elimino_articulo', 'articulo', old.id, format('Eliminó el artículo %s', old.descripcion));
    return old;
  elsif new.activo is distinct from old.activo then
    perform public.anotar_actividad('edito_articulo', 'articulo', new.id,
      format('%s el artículo %s', case when new.activo then 'Reactivó' else 'Dio de baja' end, new.descripcion));
  elsif to_jsonb(new) is distinct from to_jsonb(old) then
    perform public.anotar_actividad('edito_articulo', 'articulo', new.id, format('Editó el artículo %s', new.descripcion));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_actividad_almacen_articulos on public.almacen_articulos;
create trigger trg_actividad_almacen_articulos
  after insert or update or delete on public.almacen_articulos
  for each row execute function public.actividad_almacen_articulos();

create or replace function public.actividad_almacen_vales()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tecnico text;
begin
  select p.full_name into v_tecnico from public.profiles p where p.id = coalesce(new.tecnico_id, old.tecnico_id);
  if tg_op = 'INSERT' then
    perform public.anotar_actividad('creo_vale', 'vale', new.id,
      format('Vale %s para %s · %s', new.folio, coalesce(v_tecnico, 'técnico'), new.cliente_nombre));
  elsif tg_op = 'DELETE' then
    perform public.anotar_actividad('elimino_vale', 'vale', old.id, format('Eliminó el vale %s de %s', old.folio, coalesce(v_tecnico, 'técnico')));
    return old;
  elsif new.estado is distinct from old.estado then
    perform public.anotar_actividad('cambio_estado_vale', 'vale', new.id,
      format('Vale %s de %s: %s → %s', new.folio, coalesce(v_tecnico, 'técnico'), replace(old.estado, '_', ' '), replace(new.estado, '_', ' ')));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_actividad_almacen_vales on public.almacen_vales;
create trigger trg_actividad_almacen_vales
  after insert or update or delete on public.almacen_vales
  for each row execute function public.actividad_almacen_vales();

create or replace function public.actividad_almacen_traspasos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_de text;
  v_a text;
begin
  select p.full_name into v_de from public.profiles p where p.id = new.de_tecnico;
  select p.full_name into v_a from public.profiles p where p.id = new.a_tecnico;
  if tg_op = 'INSERT' then
    perform public.anotar_actividad('traspaso_almacen', 'traspaso', new.id,
      format('Traspaso %s de %s a %s', new.folio, coalesce(v_de, '?'), coalesce(v_a, '?')));
  elsif new.estado is distinct from old.estado then
    perform public.anotar_actividad('traspaso_almacen', 'traspaso', new.id,
      format('Traspaso %s de %s a %s: %s', new.folio, coalesce(v_de, '?'), coalesce(v_a, '?'), new.estado));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_actividad_almacen_traspasos on public.almacen_traspasos;
create trigger trg_actividad_almacen_traspasos
  after insert or update on public.almacen_traspasos
  for each row execute function public.actividad_almacen_traspasos();

create or replace function public.actividad_almacen_conteos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.anotar_actividad('conteo_almacen', 'conteo', new.id, format('Inició el conteo físico %s', new.folio));
  elsif new.estado is distinct from old.estado then
    perform public.anotar_actividad('conteo_almacen', 'conteo', new.id,
      format('%s el conteo físico %s', case new.estado when 'cerrado' then 'Cerró' when 'cancelado' then 'Canceló' else 'Reabrió' end, new.folio));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_actividad_almacen_conteos on public.almacen_conteos;
create trigger trg_actividad_almacen_conteos
  after insert or update on public.almacen_conteos
  for each row execute function public.actividad_almacen_conteos();

-- ---------- 8. Reportes ----------
-- Cambios que no cuentan como «modificar el reporte»: las fotos que se
-- ligan al guardarlo, revisión, facturación y firmas por enlace (tienen su
-- propio registro o los hace un proceso automático).
create or replace function public.datos_reporte_comparables(p_data jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(p_data, '{}'::jsonb)
    - 'fotos' - 'fotosPendientes' - 'motivoFotosPendientes' - 'fotosNoSubidas'
    - 'revisionEstado' - 'firmaRevisionData' - 'firmaRevisionNombre' - 'firmaRevisionFecha'
    - 'facturaEstado' - 'fechaConcluido' - 'firmaRemota' - 'firmaPendiente' - 'claveFormato';
$$;

create or replace function public.actividad_reportes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_folio text;
begin
  v_folio := coalesce(nullif(coalesce(new.data, old.data) ->> 'claveFormato', ''), 'sin folio');
  if tg_op = 'INSERT' then
    perform public.anotar_actividad('creo_reporte', 'reporte', new.id, format('Hizo el reporte %s de %s', v_folio, new.empresa_cliente));
  elsif tg_op = 'DELETE' then
    perform public.anotar_actividad('elimino_reporte', 'reporte', old.id, format('Eliminó el reporte %s de %s', v_folio, old.empresa_cliente));
    return old;
  elsif new.fecha is distinct from old.fecha
     or new.empresa_cliente is distinct from old.empresa_cliente
     or new.tipo_servicio is distinct from old.tipo_servicio
     or new.sub_tipo_servicio is distinct from old.sub_tipo_servicio
     or public.datos_reporte_comparables(new.data) is distinct from public.datos_reporte_comparables(old.data) then
    perform public.anotar_actividad('modifico_reporte', 'reporte', new.id, format('Modificó el reporte %s de %s', v_folio, new.empresa_cliente));
  elsif (new.data -> 'fotos') is distinct from (old.data -> 'fotos') and old.created_at < now() - interval '30 minutes' then
    perform public.anotar_actividad('modifico_reporte', 'reporte', new.id, format('Cambió las fotos del reporte %s de %s', v_folio, new.empresa_cliente));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_actividad_reportes on public.reports;
create trigger trg_actividad_reportes
  after insert or update or delete on public.reports
  for each row execute function public.actividad_reportes();

-- ---------- 9. Solicitudes de personal ----------
create or replace function public.actividad_solicitudes_personal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien text;
  v_tipo text;
begin
  select p.full_name into v_quien from public.profiles p where p.id = new.solicitante_id;
  v_tipo := case new.tipo when 'horas_extra' then 'horas extra' else new.tipo end;
  if tg_op = 'INSERT' then
    perform public.anotar_actividad('creo_solicitud', 'solicitud', new.id,
      format('Solicitud de %s de %s%s', v_tipo, coalesce(v_quien, '?'), case when new.folio is not null then ' (' || new.folio || ')' else '' end));
  elsif new.estado is distinct from old.estado then
    perform public.anotar_actividad('cambio_estado_solicitud', 'solicitud', new.id,
      format('Solicitud de %s de %s: %s → %s', v_tipo, coalesce(v_quien, '?'), old.estado, new.estado));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_actividad_solicitudes_personal on public.solicitudes_personal;
create trigger trg_actividad_solicitudes_personal
  after insert or update on public.solicitudes_personal
  for each row execute function public.actividad_solicitudes_personal();

-- Las funciones de los triggers no se llaman desde la app.
revoke all on function public.actividad_cotizaciones() from public, anon, authenticated;
revoke all on function public.actividad_levantamientos() from public, anon, authenticated;
revoke all on function public.actividad_clientes() from public, anon, authenticated;
revoke all on function public.actividad_facturas() from public, anon, authenticated;
revoke all on function public.actividad_almacen_movimientos() from public, anon, authenticated;
revoke all on function public.actividad_almacen_articulos() from public, anon, authenticated;
revoke all on function public.actividad_almacen_vales() from public, anon, authenticated;
revoke all on function public.actividad_almacen_traspasos() from public, anon, authenticated;
revoke all on function public.actividad_almacen_conteos() from public, anon, authenticated;
revoke all on function public.actividad_reportes() from public, anon, authenticated;
revoke all on function public.actividad_solicitudes_personal() from public, anon, authenticated;

-- ---------- 10. Quién ve cada actividad ----------
drop policy if exists auditoria_global_almacen_select on public.auditoria_global;
create policy auditoria_global_almacen_select on public.auditoria_global for select
  using (seccion = 'almacen' and public.puedo_gestionar_almacen());

drop policy if exists auditoria_global_facturacion_select on public.auditoria_global;
create policy auditoria_global_facturacion_select on public.auditoria_global for select
  using (seccion = 'facturacion' and public.puedo_gestionar_facturacion());

-- Verificación: registros por sección.
select seccion, count(*) from public.auditoria_global group by seccion order by seccion;
