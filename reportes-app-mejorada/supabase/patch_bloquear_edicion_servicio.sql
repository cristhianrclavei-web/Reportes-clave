-- ============================================================
-- No se edita un servicio en curso ni uno concluido
-- ============================================================
-- Dos problemas distintos que se arreglan juntos.
--
-- (1) El supervisor podia cambiar proyecto, fecha o duracion de un servicio
--     que el tecnico ya estaba trabajando o que ya habia cerrado. Mover la
--     fecha de un dia concluido deja el trabajo hecho colgando de un dia que
--     nunca existio, y cambiar la duracion estimada despues del cierre
--     falsea el indicador de desviacion: se estaria ajustando el plan al
--     resultado.
--
-- (2) Las tareas cuelgan del dia 1 por `servicio_id` con `on delete cascade`,
--     aunque la lista es del proyecto entero (`grupo_id`). Borrar el dia 1
--     se llevaba el checklist COMPLETO: las tareas de todos los dias, con
--     quien las hizo, cuando, su foto y su GPS. El dia 1 se puede borrar
--     mientras no este concluido, asi que bastaba con eliminar un dia que
--     "no se hizo" para perder el avance de los dias que si se hicieron.
--
-- La regla vive aqui y no en la pantalla: esconder el boton no detiene a
-- quien tenga la app abierta en otra pestaña con el estado viejo en memoria.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

-- 1. El ancla de las tareas deja de arrastrarlas -----------------
-- servicio_id pasa a ser opcional y a soltarse en vez de borrar. El vinculo
-- real es grupo_id, que es por donde ya se leen.

alter table public.servicio_tareas
  alter column servicio_id drop not null;

-- Se busca la llave por las columnas que relaciona, no leyendo su texto:
-- el nombre puede variar segun como se haya creado la tabla.
do $$
declare
  nombre_fk text;
begin
  for nombre_fk in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.servicio_tareas'::regclass
       and con.confrelid = 'public.servicios_programados'::regclass
       and con.contype = 'f'
       and con.conkey = array[
             (select attnum from pg_attribute
               where attrelid = 'public.servicio_tareas'::regclass
                 and attname = 'servicio_id')
           ]::smallint[]
  loop
    execute format('alter table public.servicio_tareas drop constraint %I', nombre_fk);
  end loop;
end $$;

alter table public.servicio_tareas
  add constraint servicio_tareas_servicio_id_fkey
  foreign key (servicio_id) references public.servicios_programados(id)
  on delete set null;

-- Por si el grupo quedo sin ancla en algun proyecto viejo, grupo_id es lo
-- que importa y no se toca.

-- 2. Bloqueo de edicion ------------------------------------------
-- Solo se bloquean los campos que edita el supervisor. El tecnico sigue
-- pudiendo mover estado, hora_llegada, hora_inicio y hora_fin: si se
-- bloqueara la fila entera, concluir un servicio seria imposible.

create or replace function public.bloquear_edicion_servicio()
returns trigger
language plpgsql
as $$
begin
  if old.estado in ('en_curso', 'concluido') then
    if new.proyecto is distinct from old.proyecto
       or new.descripcion is distinct from old.descripcion
       or new.fecha is distinct from old.fecha
       or new.duracion_estimada_min is distinct from old.duracion_estimada_min
       or new.hora_programada is distinct from old.hora_programada
    then
      raise exception
        'No se puede editar un servicio %. El trabajo ya empezo y los datos del plan son el respaldo de lo que se hizo.',
        case old.estado when 'en_curso' then 'en curso' else 'concluido' end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_edicion_servicio on public.servicios_programados;
create trigger trg_bloquear_edicion_servicio
  before update on public.servicios_programados
  for each row execute function public.bloquear_edicion_servicio();

-- 3. No se reasignan tecnicos con el trabajo encima --------------
-- Quitar a quien ya completo tareas deja esas tareas firmadas por alguien
-- que "no estuvo" en el servicio.

create or replace function public.bloquear_reasignacion_tecnicos()
returns trigger
language plpgsql
as $$
declare
  estado_actual text;
  id_servicio uuid;
begin
  id_servicio := coalesce(new.servicio_id, old.servicio_id);
  select estado into estado_actual
    from public.servicios_programados where id = id_servicio;

  if estado_actual in ('en_curso', 'concluido') then
    raise exception
      'No se pueden cambiar los tecnicos de un servicio %. Quien hizo el trabajo debe seguir apareciendo en el.',
      case estado_actual when 'en_curso' then 'en curso' else 'concluido' end;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_bloquear_reasignacion_tecnicos on public.servicio_tecnicos;
create trigger trg_bloquear_reasignacion_tecnicos
  before insert or delete on public.servicio_tecnicos
  for each row execute function public.bloquear_reasignacion_tecnicos();

-- 4. Verificacion -------------------------------------------------
-- Los dos primeros deben dar 1, y el tercero debe decir SET NULL.
--
-- select
--   (select count(*) from pg_trigger
--      where tgname='trg_bloquear_edicion_servicio') as bloqueo_edicion,
--   (select count(*) from pg_trigger
--      where tgname='trg_bloquear_reasignacion_tecnicos') as bloqueo_tecnicos,
--   (select confdeltype from pg_constraint
--      where conname='servicio_tareas_servicio_id_fkey') as borrado_tareas;
