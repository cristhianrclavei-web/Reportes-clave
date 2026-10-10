-- ============================================================
-- Auditoría de seguridad 3 (2026-10-10)
-- ============================================================
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.
--
-- IMPORTANTE: correrlo DESPUÉS de que el código de esta misma entrega esté
-- en producción. La versión anterior de la app pide «todas las columnas» del
-- almacén y, con el punto 1 aplicado, la base se lo negaría.
--
-- Qué cierra:
--   1. Los costos del almacén se podían leer con cualquier cuenta.
--   2. Un técnico podía inflar sus minutos de pausa (ahora los cuenta la base).
--   3. Los buckets de archivos no tenían tope de tamaño.

-- ============================================================
-- 1) El costo del almacén solo lo ven almacén y supervisión
-- ============================================================
-- Las políticas (RLS) deciden qué FILAS ve cada quien, no qué columnas. Los
-- técnicos necesitan el catálogo y los movimientos (para pedir material y
-- ver existencias), pero no el costo. Por eso el permiso de lectura se da
-- columna por columna, sin costo_unitario, y el costo se entrega con una
-- función que revisa quién pregunta.
--
-- OJO al agregar una columna a almacen_articulos o almacen_movimientos:
-- después hay que correr «select public.ocultar_costos_almacen();» para que
-- la columna nueva se pueda leer.
create or replace function public.ocultar_costos_almacen()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tabla text;
  v_columnas text;
begin
  foreach v_tabla in array array['almacen_articulos', 'almacen_movimientos'] loop
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
      into v_columnas
    from information_schema.columns
    where table_schema = 'public' and table_name = v_tabla and column_name <> 'costo_unitario';

    execute format('revoke select on public.%I from authenticated, anon', v_tabla);
    execute format('grant select (%s) on public.%I to authenticated', v_columnas, v_tabla);
  end loop;
end;
$$;

revoke all on function public.ocultar_costos_almacen() from public, anon, authenticated;

select public.ocultar_costos_almacen();

create or replace function public.costos_articulos()
returns table (articulo_id uuid, costo_unitario numeric)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.costo_unitario
  from public.almacen_articulos a
  where public.puedo_gestionar_almacen() or public.get_my_role() = 'supervisor';
$$;

revoke all on function public.costos_articulos() from public, anon;
grant execute on function public.costos_articulos() to authenticated, service_role;

-- ============================================================
-- 2) Los minutos de pausa los cuenta el reloj de la base
-- ============================================================
-- La app calcula los minutos en el teléfono al reanudar. Llamando a la base
-- directo, un técnico podía anotar los que quisiera (o empezar la pausa «en
-- el pasado») para esconder un retraso. Ahora, para quien no es supervisor,
-- la base pone la hora de inicio de la pausa y cuenta los minutos con su
-- propio reloj (misma fórmula que la app: minutos redondeados). No rechaza
-- nada del flujo normal, así que un teléfono con la hora mal no se traba.
create or replace function public.proteger_pausas_servicio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sin usuario: tareas del servidor (cron). Supervisores: sin cambios.
  if auth.uid() is null or pg_trigger_depth() > 1 or public.get_my_role() = 'supervisor' then
    return new;
  end if;

  if old.pausado_desde is null and new.pausado_desde is not null then
    -- Empieza una pausa: cuenta desde ahora.
    new.pausado_desde := now();
    new.minutos_pausados := old.minutos_pausados;
  elsif old.pausado_desde is not null and new.pausado_desde is null then
    -- Termina la pausa: se suma lo que duró.
    new.minutos_pausados := old.minutos_pausados
      + greatest(0, round(extract(epoch from (now() - old.pausado_desde)) / 60.0))::integer;
  else
    -- Ni empieza ni termina: la pausa no se mueve.
    if new.minutos_pausados is distinct from old.minutos_pausados then
      raise exception 'Los minutos de pausa solo cambian al reanudar el servicio.';
    end if;
    new.pausado_desde := old.pausado_desde;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_proteger_pausas_servicio on public.servicios_programados;
create trigger trg_proteger_pausas_servicio
  before update on public.servicios_programados
  for each row execute function public.proteger_pausas_servicio();

-- ============================================================
-- 3) Tope de tamaño por archivo en cada bucket
-- ============================================================
-- Sin tope, una cuenta podía llenar el almacenamiento subiendo archivos
-- enormes. Los topes quedan por encima de lo que la app sube hoy (el video
-- de respaldo más pesado es de 45 MB). Los avatares, que son públicos, solo
-- aceptan imágenes.
update storage.buckets set file_size_limit = 50 * 1024 * 1024 where id = 'evidencias';
update storage.buckets set file_size_limit = 50 * 1024 * 1024 where id = 'proyectos-documentos';
update storage.buckets set file_size_limit = 20 * 1024 * 1024 where id = 'almacen';
update storage.buckets set file_size_limit = 20 * 1024 * 1024 where id = 'facturas';
update storage.buckets set file_size_limit = 10 * 1024 * 1024 where id = 'solicitudes';
update storage.buckets set file_size_limit = 5 * 1024 * 1024, allowed_mime_types = array['image/*'] where id = 'avatares';

-- ============================================================
-- Verificación: las cuatro filas deben decir «true»
-- ============================================================
select 'el costo ya no se lee de la tabla' as revision,
       not has_column_privilege('authenticated', 'public.almacen_articulos', 'costo_unitario', 'select')
       and not has_column_privilege('authenticated', 'public.almacen_movimientos', 'costo_unitario', 'select') as ok
union all
select 'el resto del catálogo sí se lee',
       has_column_privilege('authenticated', 'public.almacen_articulos', 'descripcion', 'select')
       and has_column_privilege('authenticated', 'public.almacen_movimientos', 'cantidad', 'select')
union all
select 'candado de pausas',
       exists (select 1 from pg_trigger where tgname = 'trg_proteger_pausas_servicio')
union all
select 'todos los buckets tienen tope',
       not exists (select 1 from storage.buckets where file_size_limit is null);
