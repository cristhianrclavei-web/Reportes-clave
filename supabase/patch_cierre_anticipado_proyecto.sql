-- Cierre anticipado de un proyecto: cuando el técnico termina todo el
-- trabajo antes del último día y elige «Ya se terminó todo el servicio»,
-- los días que faltan deben cancelarse.
--
-- La app intentaba borrarlos con los permisos del técnico, que no puede
-- borrar días ni renumerarlos (eso es de supervisión): no marcaba error y
-- los días seguían ahí («Día 2 de 5» después de haber terminado). Esta
-- función hace justo ese trabajo, y solo ese, con permisos propios:
--   · borra los días POSTERIORES que siguen «programados» y sin reporte;
--   · renumera los que quedan y ajusta el total (el día cerrado pasa a ser
--     «1 de 1», o «2 de 2», etc.).
-- Solo la puede usar quien está asignado a ese día (o un supervisor), y solo
-- si ese día ya está concluido.
--
-- Se puede correr varias veces.

-- 1) El candado del plan deja pasar la renumeración que hace esta función.
--    Es la misma función de patch_auditoria_2.sql con esa única excepción.
create or replace function public.proteger_plan_servicio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sin usuario: tareas del servidor (cron, llave de servidor). Dentro de
  -- otro trigger: cambios que hace la propia base.
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return new;
  end if;
  if public.get_my_role() = 'supervisor' then
    return new;
  end if;
  -- Renumeración del cierre anticipado (cancelar_dias_restantes): la marca
  -- solo vive dentro de esa función y solo cambia número de día y total.
  if current_setting('app.cierre_anticipado', true) = '1'
     and new.proyecto is not distinct from old.proyecto
     and new.descripcion is not distinct from old.descripcion
     and new.fecha is not distinct from old.fecha
     and new.cliente_id is not distinct from old.cliente_id
     and new.creado_por is not distinct from old.creado_por
     and new.grupo_id is not distinct from old.grupo_id
     and new.duracion_estimada_min is not distinct from old.duracion_estimada_min
     and new.hora_programada is not distinct from old.hora_programada
     and new.hora_salida_programada is not distinct from old.hora_salida_programada
     and new.ubicacion_programada is not distinct from old.ubicacion_programada
     and new.radio_geocerca_m is not distinct from old.radio_geocerca_m then
    return new;
  end if;
  if new.proyecto is distinct from old.proyecto
     or new.descripcion is distinct from old.descripcion
     or new.fecha is distinct from old.fecha
     or new.cliente_id is distinct from old.cliente_id
     or new.creado_por is distinct from old.creado_por
     or new.grupo_id is distinct from old.grupo_id
     or new.numero_dia is distinct from old.numero_dia
     or new.dias_totales is distinct from old.dias_totales
     or new.duracion_estimada_min is distinct from old.duracion_estimada_min
     or new.hora_programada is distinct from old.hora_programada
     or new.hora_salida_programada is distinct from old.hora_salida_programada
     or new.ubicacion_programada is distinct from old.ubicacion_programada
     or new.radio_geocerca_m is distinct from old.radio_geocerca_m then
    raise exception 'Solo un supervisor puede cambiar el plan del servicio (fecha, horario, ubicación o geocerca).';
  end if;
  return new;
end;
$$;

-- 2) Cancela los días que ya no se van a usar. Devuelve cuántos borró.
create or replace function public.cancelar_dias_restantes(p_servicio_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dia record;
  v_borrados integer;
begin
  select id, grupo_id, fecha, estado into v_dia
  from public.servicios_programados
  where id = p_servicio_id;
  if not found then
    raise exception 'No se encontró el servicio.';
  end if;

  -- Sin usuario = se corre desde el editor de SQL (para reparar a mano).
  if auth.uid() is not null
     and public.get_my_role() <> 'supervisor'
     and not exists (
       select 1 from public.servicio_tecnicos st
       where st.servicio_id = p_servicio_id and st.tecnico_id = auth.uid()
     ) then
    raise exception 'Este servicio no está asignado a ti.';
  end if;

  if v_dia.estado <> 'concluido' then
    raise exception 'Primero hay que concluir el día.';
  end if;

  delete from public.servicios_programados
  where grupo_id = v_dia.grupo_id
    and id <> p_servicio_id
    and estado = 'programado'
    and report_id is null
    and fecha > v_dia.fecha;
  get diagnostics v_borrados = row_count;

  -- Renumerar por fecha los días que quedan y ajustar el total.
  perform set_config('app.cierre_anticipado', '1', true);
  update public.servicios_programados s
  set numero_dia = o.posicion, dias_totales = o.total
  from (
    select id,
           row_number() over (order by fecha, numero_dia) as posicion,
           count(*) over () as total
    from public.servicios_programados
    where grupo_id = v_dia.grupo_id
  ) o
  where s.id = o.id
    and (s.numero_dia is distinct from o.posicion or s.dias_totales is distinct from o.total);
  perform set_config('app.cierre_anticipado', '', true);

  return v_borrados;
end;
$$;

revoke all on function public.cancelar_dias_restantes(uuid) from public, anon;
grant execute on function public.cancelar_dias_restantes(uuid) to authenticated;
