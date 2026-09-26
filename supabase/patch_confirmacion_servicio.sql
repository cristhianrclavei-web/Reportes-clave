-- ============================================================
-- Confirmación de servicio asignado: "Visto" y "Enterado"
-- ============================================================
-- El supervisor necesita saber si cada técnico ya vio y confirmó un
-- servicio que se le asignó. Por técnico y por día (servicio_tecnicos):
--
--   asignado_en   cuándo quedó asignado (o cuándo cambió el plan).
--   visto_en      primera vez que abrió su lista/servicio después de eso.
--   enterado_en   tocó "Enterado".
--   recordatorio_enterado_en / escalado_enterado_en
--                 control del cron para avisar una sola vez al técnico y,
--                 si sigue sin confirmar, una sola vez a los supervisores.
--
-- Si el supervisor cambia fecha, hora, horario de salida o ubicación del
-- día, todo se reinicia (trigger): el técnico debe confirmar la versión
-- nueva.
--
-- El técnico no puede actualizar servicio_tecnicos directamente (su RLS es
-- solo lectura); lo hace por dos funciones que solo tocan sus propias filas.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

alter table public.servicio_tecnicos
  add column if not exists asignado_en timestamptz not null default now(),
  add column if not exists visto_en timestamptz,
  add column if not exists enterado_en timestamptz,
  add column if not exists recordatorio_enterado_en timestamptz,
  add column if not exists escalado_enterado_en timestamptz;

-- Las asignaciones que ya existían no deben disparar recordatorios de golpe:
-- las de días pasados o ya trabajados se dan por confirmadas.
update public.servicio_tecnicos st
set enterado_en = coalesce(st.enterado_en, now()),
    visto_en = coalesce(st.visto_en, now())
from public.servicios_programados sp
where sp.id = st.servicio_id
  and (sp.fecha < (now() at time zone 'America/Mexico_City')::date or sp.estado <> 'programado')
  and st.enterado_en is null;

-- ---------- Reinicio cuando cambia el plan del día ----------
create or replace function public.reiniciar_confirmacion_servicio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.fecha is distinct from old.fecha
     or new.hora_programada is distinct from old.hora_programada
     or new.hora_salida_programada is distinct from old.hora_salida_programada
     or new.ubicacion_programada is distinct from old.ubicacion_programada then
    update public.servicio_tecnicos
    set asignado_en = now(),
        visto_en = null,
        enterado_en = null,
        recordatorio_enterado_en = null,
        escalado_enterado_en = null
    where servicio_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reiniciar_confirmacion_servicio on public.servicios_programados;
create trigger trg_reiniciar_confirmacion_servicio
  after update on public.servicios_programados
  for each row execute function public.reiniciar_confirmacion_servicio();

-- ---------- Acciones del técnico ----------
-- Marca como vistos los servicios indicados (solo las filas propias que aún
-- no tenían "visto").
create or replace function public.marcar_servicios_vistos(p_servicios uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.servicio_tecnicos
  set visto_en = now()
  where tecnico_id = auth.uid()
    and servicio_id = any (p_servicios)
    and visto_en is null;
$$;

-- "Enterado": confirma el día indicado y los demás días del mismo proyecto
-- que tenga pendientes (un proyecto de 5 días se confirma una vez). Devuelve
-- cuántos días quedaron confirmados.
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

revoke all on function public.marcar_servicios_vistos(uuid[]) from public, anon;
revoke all on function public.confirmar_servicio(uuid) from public, anon;
grant execute on function public.marcar_servicios_vistos(uuid[]) to authenticated;
grant execute on function public.confirmar_servicio(uuid) to authenticated;

-- Verificación: debe devolver las 5 columnas nuevas.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'servicio_tecnicos'
  and column_name in ('asignado_en', 'visto_en', 'enterado_en', 'recordatorio_enterado_en', 'escalado_enterado_en');
