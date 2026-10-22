-- ============================================================
-- Corregir la hora de un cierre hecho por supervisión
-- ============================================================
-- cerrar_servicio_olvidado() (patch_cierre_servicio_olvidado.sql) solo
-- aceptaba servicios abiertos o cerrados automáticamente. Ahora también
-- corrige la hora de un cierre que ya hizo un supervisor (por ejemplo, si
-- se puso la hora de llegada a la oficina y no la de salida del sitio).
-- El cierre hecho por el técnico sigue sin poder cambiarse aquí.
--
-- Requiere haber corrido patch_cierre_servicio_olvidado.sql.
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

create or replace function public.cerrar_servicio_olvidado(p_servicio uuid, p_hora_fin timestamptz, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  v_inicio timestamptz;
  v_pausa int := 0;
  v_fin_pausa timestamptz;
  v_hora text;
begin
  if public.get_my_role() is distinct from 'supervisor' then
    raise exception 'Solo supervisión puede cerrar un servicio por el técnico.';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribe cómo supiste la hora (por ejemplo: «me lo confirmó por teléfono»).';
  end if;

  select * into s from public.servicios_programados where id = p_servicio for update;
  if not found then
    raise exception 'No se encontró el servicio.';
  end if;
  if not (s.estado in ('en_sitio', 'en_curso') or (s.estado = 'concluido' and s.cierre_tipo in ('automatico', 'supervisor'))) then
    raise exception 'Solo se corrige la hora de un servicio abierto o de un cierre hecho por supervisión o automático. El cierre del técnico no se cambia aquí.';
  end if;

  v_inicio := coalesce(s.hora_inicio, s.hora_llegada);
  if p_hora_fin > now() then
    raise exception 'La hora de término no puede ser en el futuro.';
  end if;
  if v_inicio is not null and p_hora_fin < v_inicio then
    raise exception 'La hora de término es antes de que empezara el servicio (%).',
      to_char(v_inicio at time zone 'America/Mexico_City', 'DD/MM HH24:MI');
  end if;
  if v_inicio is not null and p_hora_fin > v_inicio + interval '24 hours' then
    raise exception 'La hora de término es más de 24 horas después del inicio. Revisa el día.';
  end if;

  -- Pausa abierta (nunca reanudó): cuenta hasta su tiempo permitido o hasta
  -- el término, lo que pase primero; después se supone que volvió a trabajar.
  if s.estado <> 'concluido' and s.pausado_desde is not null and p_hora_fin > s.pausado_desde then
    v_fin_pausa := least(
      p_hora_fin,
      case when s.pausa_limite_min is not null then s.pausado_desde + make_interval(mins => s.pausa_limite_min) else p_hora_fin end
    );
    v_pausa := floor(extract(epoch from (v_fin_pausa - s.pausado_desde)) / 60)::int;
  end if;

  update public.servicios_programados
     set estado = 'concluido',
         hora_fin = p_hora_fin,
         minutos_pausados = coalesce(minutos_pausados, 0) + v_pausa,
         pausado_desde = null, pausa_tipo = null, pausa_limite_min = null, pausa_avisos = 0,
         cierre_tipo = 'supervisor',
         cierre_por = auth.uid(),
         cierre_nota = trim(p_motivo)
   where id = p_servicio;

  -- Si ya tenía el cierre automático, ese registro se corrige; si no, se crea.
  if s.estado = 'concluido' then
    update public.servicio_eventos
       set created_at = p_hora_fin, created_by = auth.uid(),
           nota = 'Cerrado por supervisión: ' || trim(p_motivo)
     where id = (select id from public.servicio_eventos
                  where servicio_id = p_servicio and tipo = 'cierre'
                  order by created_at desc limit 1);
  else
    insert into public.servicio_eventos (servicio_id, tipo, nota, created_by, created_at)
    values (p_servicio, 'cierre', 'Cerrado por supervisión: ' || trim(p_motivo), auth.uid(), p_hora_fin);
  end if;

  v_hora := to_char(p_hora_fin at time zone 'America/Mexico_City', 'DD/MM HH24:MI');
  insert into public.servicio_auditoria (servicio_id, supervisor_id, cambio)
  values (
    p_servicio, auth.uid(),
    case
      when s.estado = 'concluido' and s.cierre_tipo = 'automatico' then 'Corrigió la hora del cierre automático: '
      when s.estado = 'concluido' then 'Corrigió la hora del cierre de supervisión (antes '
        || to_char(s.hora_fin at time zone 'America/Mexico_City', 'DD/MM HH24:MI') || '): '
      else 'Cerró el servicio por el técnico: '
    end
      || v_hora || ' — ' || trim(p_motivo)
      || case when v_pausa > 0 then ' (pausa abierta: ' || v_pausa || ' min)' else '' end
  );
end;
$$;

revoke all on function public.cerrar_servicio_olvidado(uuid, timestamptz, text) from public, anon;
grant execute on function public.cerrar_servicio_olvidado(uuid, timestamptz, text) to authenticated;

-- Verificación: debe decir true.
select position('supervisor''))' in pg_get_functiondef('public.cerrar_servicio_olvidado(uuid, timestamptz, text)'::regprocedure)) > 0 as acepta_correccion;
