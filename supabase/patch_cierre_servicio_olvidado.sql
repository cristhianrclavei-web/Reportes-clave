-- ============================================================
-- Servicios que el técnico olvidó cerrar: sin tiempos falsos
-- ============================================================
-- Si el técnico no cierra el servicio, el reloj sigue corriendo y, cuando
-- por fin lo cierra (al día siguiente), la duración sale inflada y ensucia
-- las estadísticas. Este parche:
--
-- 1) cerrar_servicios_olvidados(): cada noche (00:10 de México) cierra los
--    servicios de días anteriores que siguen en sitio o en curso, con la hora
--    del ÚLTIMO REGISTRO del servicio (evidencia, avance, pausa…), no con la
--    hora en que se cierra. Quedan marcados «automático» para que un
--    supervisor confirme o corrija la hora.
-- 2) cerrar_servicio_olvidado(): el supervisor cierra un servicio abierto
--    (o corrige uno cerrado automáticamente) con la hora en que de verdad
--    terminaron. Si estaba en pausa, la pausa cuenta hasta su tiempo
--    permitido. Queda en la línea de tiempo y en el historial con su nombre.
-- 3) Columnas cierre_tipo ('supervisor' | 'automatico'; null = lo cerró el
--    técnico), cierre_por y cierre_nota.
--
-- Ejecutar completo en el SQL Editor de Supabase. Aditivo e idempotente.

-- ---------- 1) Columnas ----------
alter table public.servicios_programados
  add column if not exists cierre_tipo text,
  add column if not exists cierre_por uuid references public.profiles(id),
  add column if not exists cierre_nota text;

alter table public.servicios_programados drop constraint if exists servicios_programados_cierre_tipo_check;
alter table public.servicios_programados
  add constraint servicios_programados_cierre_tipo_check
  check (cierre_tipo is null or cierre_tipo in ('supervisor', 'automatico'));

-- Solo la base (cron) y supervisión escriben estas columnas: un técnico no
-- puede hacer pasar su cierre por uno de supervisión.
create or replace function public.proteger_cierre_servicio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.get_my_role() = 'supervisor' then
    return new;
  end if;
  new.cierre_tipo := old.cierre_tipo;
  new.cierre_por := old.cierre_por;
  new.cierre_nota := old.cierre_nota;
  return new;
end;
$$;

drop trigger if exists trg_proteger_cierre_servicio on public.servicios_programados;
create trigger trg_proteger_cierre_servicio
  before update on public.servicios_programados
  for each row execute function public.proteger_cierre_servicio();

-- ---------- 2) Cierre automático (noche) ----------
create or replace function public.cerrar_servicios_olvidados()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_n integer := 0;
  s record;
  v_fin timestamptz;
begin
  for s in
    select id, hora_llegada, hora_inicio, pausado_desde, minutos_pausados
    from public.servicios_programados
    where estado in ('en_sitio', 'en_curso')
      and fecha < v_hoy
    for update
  loop
    -- Lo último que se supo del servicio; sin registros, su inicio o llegada.
    select greatest(max(e.created_at), coalesce(s.hora_inicio, s.hora_llegada))
      into v_fin
    from public.servicio_eventos e
    where e.servicio_id = s.id;
    v_fin := coalesce(v_fin, s.hora_inicio, s.hora_llegada, now());

    update public.servicios_programados
       set estado = 'concluido',
           hora_fin = v_fin,
           -- Una pausa abierta termina donde terminó todo (su propio registro).
           minutos_pausados = coalesce(s.minutos_pausados, 0)
             + case when s.pausado_desde is not null and v_fin > s.pausado_desde
                    then floor(extract(epoch from (v_fin - s.pausado_desde)) / 60)::int else 0 end,
           pausado_desde = null, pausa_tipo = null, pausa_limite_min = null, pausa_avisos = 0,
           cierre_tipo = 'automatico',
           cierre_por = null,
           cierre_nota = 'Nadie lo cerró; se tomó la hora del último registro'
     where id = s.id;

    insert into public.servicio_eventos (servicio_id, tipo, nota, created_at)
    values (s.id, 'cierre', 'Se cerró solo: nadie lo cerró. Hora del último registro; supervisión debe confirmarla.', v_fin);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.cerrar_servicios_olvidados() from public, anon, authenticated;
grant execute on function public.cerrar_servicios_olvidados() to service_role;

-- Cada noche a las 00:10 de México (06:10 UTC). Si no hay pg_cron, lo corre
-- el aviso de las 9:00 (/api/cron/recordatorio-reporte).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'cerrar-servicios-olvidados';
    perform cron.schedule('cerrar-servicios-olvidados', '10 6 * * *', 'select public.cerrar_servicios_olvidados()');
  end if;
end $$;

-- ---------- 3) Cierre por el supervisor con la hora real ----------
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
  if not (s.estado in ('en_sitio', 'en_curso') or (s.estado = 'concluido' and s.cierre_tipo = 'automatico')) then
    raise exception 'Este servicio no está abierto ni cerrado automáticamente.';
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
    case when s.estado = 'concluido' then 'Corrigió la hora del cierre automático: ' else 'Cerró el servicio por el técnico: ' end
      || v_hora || ' — ' || trim(p_motivo)
      || case when v_pausa > 0 then ' (pausa abierta: ' || v_pausa || ' min)' else '' end
  );
end;
$$;

revoke all on function public.cerrar_servicio_olvidado(uuid, timestamptz, text) from public, anon;
grant execute on function public.cerrar_servicio_olvidado(uuid, timestamptz, text) to authenticated;

-- Verificación: 3 columnas y las dos funciones; y los servicios abiertos de
-- días anteriores que se cerrarán esta noche (o al correr la función).
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'servicios_programados'
      and column_name in ('cierre_tipo', 'cierre_por', 'cierre_nota')) as columnas,
  (select count(*) from pg_proc where proname in ('cerrar_servicios_olvidados', 'cerrar_servicio_olvidado')) as funciones;
select id, proyecto, fecha, estado, hora_inicio from public.servicios_programados
where estado in ('en_sitio', 'en_curso') and fecha < (now() at time zone 'America/Mexico_City')::date
order by fecha;
