-- ============================================================
-- Bitácora: registro a mano, acompañantes y horario de jornada
-- ============================================================
-- Para saber en qué se va el tiempo de cada técnico, toda la jornada debe
-- quedar registrada. A veces se les pasa iniciar la actividad (subir
-- material en la oficina, el traslado, la compra): ahora la pueden
-- registrar después, a mano, con hora de inicio y fin.
--
-- 1) actividades: origen (en vivo / a mano), quién la registró y con quién
--    estaba. Si un técnico registra algo a mano con acompañantes, a cada
--    acompañante se le crea su propio registro (mismo grupo_registro).
-- 2) ajustes_operacion: hora de entrada y salida de la jornada, para saber
--    cuánto quedó «sin registrar» al inicio y al final del día.
-- 3) registrar_actividad_manual(): valida y guarda. No deja encimar dos
--    actividades de bitácora de la misma persona (avisa con cuál choca).
--    Encima de un servicio SÍ se permite: es salir del servicio por
--    material, a otro servicio, etc., y ese tiempo se descuenta del servicio.
-- 4) eliminar_actividad_manual(): el técnico puede borrar lo que registró
--    a mano (para corregirlo) durante 7 días.
--
-- Ejecutar completo en el SQL Editor de Supabase. Aditivo; se puede correr
-- varias veces.

-- ---------- 1) Columnas de actividades ----------
alter table public.actividades
  add column if not exists origen text not null default 'en_vivo',
  add column if not exists registrado_por uuid references public.profiles(id) on delete set null,
  add column if not exists acompanantes uuid[] not null default '{}',
  add column if not exists grupo_registro uuid;

alter table public.actividades drop constraint if exists actividades_origen_check;
alter table public.actividades
  add constraint actividades_origen_check check (origen in ('en_vivo', 'manual'));

create index if not exists idx_actividades_grupo_registro on public.actividades (grupo_registro) where grupo_registro is not null;

-- ---------- 2) Horario de la jornada ----------
alter table public.ajustes_operacion
  add column if not exists jornada_inicio time not null default '08:00',
  add column if not exists jornada_fin time not null default '18:00';

alter table public.ajustes_operacion drop constraint if exists ajustes_operacion_jornada_check;
alter table public.ajustes_operacion
  add constraint ajustes_operacion_jornada_check check (jornada_fin > jornada_inicio);

-- ---------- 3) Registrar a mano ----------
create or replace function public.registrar_actividad_manual(
  p_tipo text,
  p_titulo text,
  p_proyecto text,
  p_inicio timestamptz,
  p_fin timestamptz,
  p_nota text,
  p_acompanantes uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_grupo uuid := gen_random_uuid();
  v_titulo text := nullif(btrim(coalesce(p_titulo, '')), '');
  v_proyecto text := coalesce(nullif(btrim(coalesce(p_proyecto, '')), ''), '');
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_personas uuid[];
  v_persona uuid;
  v_choque record;
  v_id uuid;
  v_creadas integer := 0;
  v_omitidos jsonb := '[]'::jsonb;
begin
  if v_yo is null then
    raise exception 'No hay sesión activa';
  end if;
  if not public.mi_cuenta_activa() then
    raise exception 'Tu cuenta está desactivada';
  end if;
  if p_tipo is null or p_tipo not in ('traslado', 'compra', 'oficina', 'capacitacion', 'apoyo_cliente', 'otro') then
    raise exception 'Elige qué tipo de actividad fue';
  end if;
  if p_inicio is null or p_fin is null or p_fin <= p_inicio then
    raise exception 'La hora de fin debe ser después de la de inicio';
  end if;
  if p_fin > now() + interval '5 minutes' then
    raise exception 'No se puede registrar a mano algo que todavía no termina; para eso inicia la actividad en vivo';
  end if;
  if p_inicio < now() - interval '7 days' then
    raise exception 'Solo se puede registrar a mano lo de los últimos 7 días';
  end if;
  if p_fin - p_inicio > interval '14 hours' then
    raise exception 'Una actividad no puede durar más de 14 horas';
  end if;
  if v_titulo is null then
    v_titulo := case p_tipo
      when 'traslado' then 'Traslado'
      when 'compra' then 'Compra de material'
      when 'oficina' then 'Oficina o taller'
      when 'capacitacion' then 'Capacitación'
      when 'apoyo_cliente' then 'Apoyo a cliente'
      else 'Otro'
    end;
  end if;

  -- Quien registra primero; después los acompañantes activos, sin repetir.
  select array_agg(id order by orden) into v_personas
  from (
    select v_yo as id, 0 as orden
    union
    select p.id, 1 from public.profiles p
    where p.id = any (coalesce(p_acompanantes, '{}'::uuid[]))
      and p.id <> v_yo
      and p.activo = true
  ) q;

  foreach v_persona in array v_personas loop
    select a.titulo, a.hora_inicio, a.hora_fin into v_choque
    from public.actividades a
    where a.created_by = v_persona
      and tstzrange(a.hora_inicio, coalesce(a.hora_fin, now())) && tstzrange(p_inicio, p_fin)
    order by a.hora_inicio
    limit 1;

    if found then
      if v_persona = v_yo then
        raise exception 'Ese horario choca con «%» (% a %). Ajusta las horas o corrige esa actividad.',
          v_choque.titulo,
          to_char(v_choque.hora_inicio at time zone 'America/Mexico_City', 'HH24:MI'),
          coalesce(to_char(v_choque.hora_fin at time zone 'America/Mexico_City', 'HH24:MI'), 'ahora');
      end if;
      -- Al acompañante no se le encima: se avisa y se sigue con los demás.
      v_omitidos := v_omitidos || jsonb_build_object(
        'id', v_persona,
        'nombre', (select full_name from public.profiles where id = v_persona),
        'choca_con', v_choque.titulo
      );
      continue;
    end if;

    insert into public.actividades (
      created_by, proyecto, titulo, estado, hora_inicio, hora_fin, tipo,
      origen, registrado_por, acompanantes, grupo_registro
    ) values (
      v_persona, v_proyecto, v_titulo, 'concluida', p_inicio, p_fin, p_tipo,
      'manual', v_yo, array_remove(v_personas, v_persona), v_grupo
    )
    returning id into v_id;

    insert into public.actividad_eventos (actividad_id, tipo, nota, created_at)
    values (v_id, 'cierre', coalesce(v_nota, 'Registrada a mano'), p_fin);

    v_creadas := v_creadas + 1;
  end loop;

  return jsonb_build_object('creadas', v_creadas, 'omitidos', v_omitidos, 'grupo', v_grupo);
end;
$$;

revoke all on function public.registrar_actividad_manual(text, text, text, timestamptz, timestamptz, text, uuid[]) from public, anon;
grant execute on function public.registrar_actividad_manual(text, text, text, timestamptz, timestamptz, text, uuid[]) to authenticated;

-- ---------- 4) Borrar lo registrado a mano ----------
create or replace function public.eliminar_actividad_manual(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borradas integer;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión activa';
  end if;
  delete from public.actividades
  where id = p_id
    and origen = 'manual'
    and created_by = auth.uid()
    and hora_inicio > now() - interval '7 days';
  get diagnostics v_borradas = row_count;
  if v_borradas = 0 then
    raise exception 'Solo puedes borrar actividades tuyas registradas a mano en los últimos 7 días';
  end if;
end;
$$;

revoke all on function public.eliminar_actividad_manual(uuid) from public, anon;
grant execute on function public.eliminar_actividad_manual(uuid) to authenticated;

-- Verificación: debe devolver 4 (columnas), 2 (jornada) y 2 (funciones).
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'actividades'
      and column_name in ('origen', 'registrado_por', 'acompanantes', 'grupo_registro')) as columnas,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'ajustes_operacion'
      and column_name in ('jornada_inicio', 'jornada_fin')) as jornada,
  (select count(*) from pg_proc
    where proname in ('registrar_actividad_manual', 'eliminar_actividad_manual')) as funciones;
