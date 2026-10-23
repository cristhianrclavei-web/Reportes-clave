-- ============================================================
-- Rastreo: solo técnicos
-- ============================================================
-- Las cuentas de supervisión no comparten su ubicación aunque entren en un
-- teléfono con la app de Android: rastreo_permitido dice que no (el teléfono
-- deja el GPS apagado y la base rechaza sus puntos), y el mapa ya no muestra
-- los puntos de supervisores que se hayan guardado antes.
--
-- Requiere patch_ubicacion_tecnicos.sql. Aditivo e idempotente.

create or replace function public.rastreo_permitido(p_tecnico uuid, p_momento timestamptz)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_local timestamp := p_momento at time zone 'America/Mexico_City';
  v_fecha date := v_local::date;
  v_inicio time := '08:00';
  v_fin time := '18:00';
begin
  -- Supervisión nunca se rastrea.
  if exists (select 1 from public.profiles p where p.id = p_tecnico and p.role = 'supervisor') then
    return false;
  end if;

  -- Horas extra: con un servicio abierto ese día siempre cuenta.
  if exists (
    select 1
    from public.servicios_programados sp
    join public.servicio_tecnicos st on st.servicio_id = sp.id
    where st.tecnico_id = p_tecnico
      and sp.fecha = v_fecha
      and sp.estado in ('en_sitio', 'en_curso')
  ) then
    return true;
  end if;

  -- Sábado (6) y domingo (7) no.
  if extract(isodow from v_local) > 5 then
    return false;
  end if;

  if exists (
    select 1 from public.dias_festivos f
    where f.fecha = v_fecha and f.tipo in ('oficial', 'empresa')
  ) then
    return false;
  end if;

  select a.jornada_inicio, a.jornada_fin into v_inicio, v_fin
  from public.ajustes_operacion a
  limit 1;

  return v_local::time >= coalesce(v_inicio, '08:00') and v_local::time < coalesce(v_fin, '18:00');
end;
$$;

create or replace function public.ultimas_ubicaciones_hoy()
returns table (
  tecnico_id uuid, nombre text, registrado_en timestamptz,
  lat double precision, lng double precision, precision_m real, bateria smallint
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (u.tecnico_id)
    u.tecnico_id, p.full_name, u.registrado_en, u.lat, u.lng, u.precision_m, u.bateria
  from public.ubicaciones_tecnicos u
  join public.profiles p on p.id = u.tecnico_id
  where public.get_my_role() = 'supervisor'
    and p.role <> 'supervisor'
    and u.registrado_en >= (date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City')
  order by u.tecnico_id, u.registrado_en desc;
$$;

-- Verificación: debe decir supervisores_en_mapa = 0.
select count(*) as supervisores_en_mapa
from public.ubicaciones_tecnicos u
join public.profiles p on p.id = u.tecnico_id
where p.role = 'supervisor'
  and public.rastreo_permitido(u.tecnico_id, u.registrado_en);
