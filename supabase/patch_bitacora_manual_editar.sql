-- ============================================================
-- Bitácora: editar lo registrado a mano
-- ============================================================
-- Desde la línea de tiempo, el técnico puede tocar algo que registró a mano
-- y corregir el tipo, el nombre, el lugar o el horario. Mismas reglas que al
-- registrarlo (patch_bitacora_manual.sql): no puede encimarse con otra
-- actividad suya, no puede terminar en el futuro, solo los últimos 7 días y
-- máximo 14 horas. Solo cambia SU registro; el de sus acompañantes queda
-- igual (cada quien corrige el suyo).
--
-- Requiere patch_bitacora_manual.sql. Se puede correr varias veces.

create or replace function public.editar_actividad_manual(
  p_id uuid,
  p_tipo text,
  p_titulo text,
  p_proyecto text,
  p_inicio timestamptz,
  p_fin timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_actual record;
  v_choque record;
  v_titulo text := nullif(btrim(coalesce(p_titulo, '')), '');
begin
  if v_yo is null then
    raise exception 'No hay sesión activa';
  end if;
  if not public.mi_cuenta_activa() then
    raise exception 'Tu cuenta está desactivada';
  end if;

  select id, hora_inicio into v_actual
  from public.actividades
  where id = p_id and created_by = v_yo and origen = 'manual'
  for update;
  if not found then
    raise exception 'Solo puedes editar actividades tuyas registradas a mano';
  end if;
  if v_actual.hora_inicio < now() - interval '7 days' then
    raise exception 'Solo se puede editar lo registrado en los últimos 7 días';
  end if;

  if p_tipo is null or p_tipo not in ('traslado', 'compra', 'oficina', 'capacitacion', 'apoyo_cliente', 'otro') then
    raise exception 'Elige qué tipo de actividad fue';
  end if;
  if p_inicio is null or p_fin is null or p_fin <= p_inicio then
    raise exception 'La hora de fin debe ser después de la de inicio';
  end if;
  if p_fin > now() + interval '5 minutes' then
    raise exception 'No puede terminar en el futuro';
  end if;
  if p_inicio < now() - interval '7 days' then
    raise exception 'Solo se puede registrar a mano lo de los últimos 7 días';
  end if;
  if p_fin - p_inicio > interval '14 hours' then
    raise exception 'Una actividad no puede durar más de 14 horas';
  end if;

  select a.titulo, a.hora_inicio, a.hora_fin into v_choque
  from public.actividades a
  where a.created_by = v_yo
    and a.id <> p_id
    and tstzrange(a.hora_inicio, coalesce(a.hora_fin, now())) && tstzrange(p_inicio, p_fin)
  order by a.hora_inicio
  limit 1;
  if found then
    raise exception 'Ese horario choca con «%» (% a %). Ajusta las horas o corrige esa actividad.',
      v_choque.titulo,
      to_char(v_choque.hora_inicio at time zone 'America/Mexico_City', 'HH24:MI'),
      coalesce(to_char(v_choque.hora_fin at time zone 'America/Mexico_City', 'HH24:MI'), 'ahora');
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

  update public.actividades
  set tipo = p_tipo,
      titulo = v_titulo,
      proyecto = coalesce(nullif(btrim(coalesce(p_proyecto, '')), ''), ''),
      hora_inicio = p_inicio,
      hora_fin = p_fin
  where id = p_id;

  -- El cierre de una actividad a mano va a la hora de fin.
  update public.actividad_eventos
  set created_at = p_fin
  where actividad_id = p_id and tipo = 'cierre';
end;
$$;

revoke all on function public.editar_actividad_manual(uuid, text, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.editar_actividad_manual(uuid, text, text, text, timestamptz, timestamptz) to authenticated;

-- Verificación: debe devolver 1.
select count(*) as funcion from pg_proc where proname = 'editar_actividad_manual';
