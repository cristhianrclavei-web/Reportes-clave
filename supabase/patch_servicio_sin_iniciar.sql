-- ============================================================
-- Servicios que el técnico nunca inició (olvidó usar la app)
-- ============================================================
-- Si el técnico fue y trabajó pero nunca marcó llegada ni inicio, el
-- servicio se queda «programado» para siempre. Cancelarlo no es correcto:
-- el trabajo sí se hizo (cuenta para cobertura y facturación). Este parche:
--
-- 1) cierre_tipo acepta 'sin_registro': lo cerró supervisión porque el
--    técnico no registró nada. Queda como incidencia del técnico.
-- 2) cerrar_servicio_sin_iniciar(): el supervisor pone la hora real de
--    llegada y de término, si quedó terminado o pendiente, y cómo lo supo.
--    Queda en la línea de tiempo y en el historial con su nombre.
--
-- Requiere patch_cierre_servicio_olvidado.sql.
-- Ejecutar completo en el SQL Editor de Supabase. Aditivo e idempotente.

-- ---------- 1) Nuevo tipo de cierre ----------
alter table public.servicios_programados drop constraint if exists servicios_programados_cierre_tipo_check;
alter table public.servicios_programados
  add constraint servicios_programados_cierre_tipo_check
  check (cierre_tipo is null or cierre_tipo in ('supervisor', 'automatico', 'sin_registro'));

-- ---------- 2) Cierre por supervisión de un servicio no iniciado ----------
create or replace function public.cerrar_servicio_sin_iniciar(
  p_servicio uuid,
  p_hora_llegada timestamptz,
  p_hora_fin timestamptz,
  p_resultado text,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_dia date := (p_hora_llegada at time zone 'America/Mexico_City')::date;
  v_texto text;
begin
  if public.get_my_role() is distinct from 'supervisor' then
    raise exception 'Solo supervisión puede cerrar un servicio por el técnico.';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribe cómo supiste que se hizo (por ejemplo: «me lo confirmó por teléfono»).';
  end if;
  if p_resultado not in ('terminado', 'pendiente') then
    raise exception 'Indica si el trabajo quedó terminado o pendiente.';
  end if;

  select * into s from public.servicios_programados where id = p_servicio for update;
  if not found then
    raise exception 'No se encontró el servicio.';
  end if;
  if s.estado <> 'programado' then
    raise exception 'Este servicio ya se inició o ya está cerrado o cancelado.';
  end if;
  if s.fecha > v_hoy then
    raise exception 'El servicio es de una fecha futura; todavía no se puede cerrar.';
  end if;

  if p_hora_llegada is null or p_hora_fin is null then
    raise exception 'Indica la hora de llegada y la de término.';
  end if;
  if p_hora_fin > now() then
    raise exception 'La hora de término no puede ser en el futuro.';
  end if;
  if p_hora_fin <= p_hora_llegada then
    raise exception 'La hora de término debe ser después de la llegada.';
  end if;
  if p_hora_fin > p_hora_llegada + interval '24 hours' then
    raise exception 'Entre la llegada y el término hay más de 24 horas. Revisa las horas.';
  end if;
  if v_dia <> s.fecha then
    raise exception 'La llegada debe ser el día del servicio (%).', to_char(s.fecha, 'DD/MM/YYYY');
  end if;

  update public.servicios_programados
     set estado = 'concluido',
         hora_llegada = p_hora_llegada,
         hora_inicio = p_hora_llegada,
         hora_fin = p_hora_fin,
         resultado = p_resultado,
         cierre_tipo = 'sin_registro',
         cierre_por = auth.uid(),
         cierre_nota = trim(p_motivo)
   where id = p_servicio;

  insert into public.servicio_eventos (servicio_id, tipo, nota, created_by, created_at) values
    (p_servicio, 'llegada', 'Registrada por supervisión: el técnico no la marcó', auth.uid(), p_hora_llegada),
    (p_servicio, 'cierre', 'Cerrado por supervisión sin registro del técnico: ' || trim(p_motivo), auth.uid(), p_hora_fin);

  v_texto := 'Cerró por el técnico un servicio que no se inició: '
    || to_char(p_hora_llegada at time zone 'America/Mexico_City', 'DD/MM HH24:MI') || ' a '
    || to_char(p_hora_fin at time zone 'America/Mexico_City', 'HH24:MI')
    || case when p_resultado = 'pendiente' then ' (quedó pendiente)' else '' end
    || ' — ' || trim(p_motivo);
  insert into public.servicio_auditoria (servicio_id, supervisor_id, cambio)
  values (p_servicio, auth.uid(), v_texto);
end;
$$;

revoke all on function public.cerrar_servicio_sin_iniciar(uuid, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function public.cerrar_servicio_sin_iniciar(uuid, timestamptz, timestamptz, text, text) to authenticated;

-- Verificación: la función existe y el nuevo tipo se acepta; y los servicios
-- de días anteriores que siguen sin iniciarse.
select
  (select count(*) from pg_proc where proname = 'cerrar_servicio_sin_iniciar') as funcion,
  position('sin_registro' in pg_get_constraintdef((select oid from pg_constraint where conname = 'servicios_programados_cierre_tipo_check'))) > 0 as acepta_sin_registro;
select id, proyecto, fecha from public.servicios_programados
where estado = 'programado' and fecha < (now() at time zone 'America/Mexico_City')::date
order by fecha;
