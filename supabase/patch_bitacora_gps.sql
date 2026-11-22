-- Bitácora más exacta con el GPS (2026-11-22).
--
-- 1) La hora del reporte se ajusta sola con el rastreo:
--    · Si el GPS vio al técnico con ESE cliente ese día (visitas_detectadas),
--      la llegada y la salida del reporte toman las horas del GPS.
--    · Si no hay GPS, la salida no puede ser después de la firma del
--      cliente: si la firma fue a las 16:07 y la salida dice 16:30, queda 16:07.
--    · Si nadie firmó y no hay GPS, se respeta lo capturado.
--    Lo capturado se guarda en data.horarioCapturado y el ajuste en
--    data.horarioAjuste; si después alguien corrige la hora a mano, ya no se
--    vuelve a tocar. Corre cada 15 min (cron) para ayer y hoy.
-- 2) gps_en_lugares_propios: los ratos en la oficina (o cualquier lugar de la
--    empresa) según el GPS, para pintarlos en la bitácora.

-- ---------- 1) Ajustar el horario de los reportes ----------
create or replace function public.ajustar_horario_reportes(p_desde date, p_hasta date, p_aplicar boolean default true)
returns table (report_id uuid, fuente text, llegada_antes text, salida_antes text, llegada text, salida text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_llegada text;
  v_salida text;
  v_fuente text;
  v_firma timestamptz;
  v_ajuste jsonb;
  v_cap_llegada text;
  v_cap_salida text;
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 62 then
    raise exception 'Rango de fechas no válido (máximo 62 días).';
  end if;
  -- Desde la app, solo supervisión; el cron corre sin sesión.
  if auth.uid() is not null and public.get_my_role() is distinct from 'supervisor' then
    raise exception 'Solo supervisión puede ajustar horarios de reportes.';
  end if;

  for r in
    select rep.id, rep.data, rep.created_at, rep.fecha,
           rep.data ->> 'horaLlegada' as hll, rep.data ->> 'horaSalida' as hsa,
           vis.llegada as gps_llegada, vis.salida as gps_salida
    from public.reports rep
    left join lateral (
      select v.llegada, v.salida
      from public.visitas_detectadas v
      where v.tecnico_id = rep.created_by and v.fecha = rep.fecha and v.cliente_id = rep.cliente_id
        -- Ya se fue: si sigue ahí, la «salida» del GPS es solo el último punto.
        and v.salida < now() - interval '20 minutes'
        -- Con dos reportes del mismo cliente ese día no se sabe cuál es cuál.
        and (select count(*) from public.reports o
              where o.created_by = rep.created_by and o.fecha = rep.fecha and o.cliente_id = rep.cliente_id) = 1
      limit 1
    ) vis on true
    where rep.fecha between p_desde and p_hasta
      and coalesce(rep.data ->> 'horaLlegada', '') ~ '^\d{2}:\d{2}$'
      and coalesce(rep.data ->> 'horaSalida', '') ~ '^\d{2}:\d{2}$'
  loop
    v_ajuste := r.data -> 'horarioAjuste';
    -- Alguien lo corrigió a mano después del último ajuste: se respeta.
    if v_ajuste is not null
       and (r.hll is distinct from v_ajuste ->> 'llegada' or r.hsa is distinct from v_ajuste ->> 'salida') then
      continue;
    end if;

    v_llegada := r.hll;
    v_salida := r.hsa;
    v_fuente := null;

    if r.gps_llegada is not null then
      v_llegada := to_char(r.gps_llegada at time zone 'America/Mexico_City', 'HH24:MI');
      v_salida := to_char(r.gps_salida at time zone 'America/Mexico_City', 'HH24:MI');
      -- Sanidad: el GPS y el reporte deben hablar del mismo rato (se enciman
      -- o están a menos de 3 h); si no, no se usa el GPS.
      v_cap_llegada := coalesce(r.data -> 'horarioCapturado' ->> 'llegada', r.hll);
      v_cap_salida := coalesce(r.data -> 'horarioCapturado' ->> 'salida', r.hsa);
      if (v_llegada <= v_cap_salida and v_salida >= v_cap_llegada)
         or abs(extract(epoch from (v_salida::time - v_cap_salida::time))) <= 3 * 3600 then
        v_fuente := 'gps';
      else
        v_llegada := r.hll;
        v_salida := r.hsa;
      end if;
    end if;

    if v_fuente is null then
      -- Hora de la firma del cliente: la que guarda la app desde hoy o, en
      -- los anteriores, la hora en que se guardó (se firma al guardar) si no
      -- fue firma a distancia y se guardó ese mismo día.
      v_firma := null;
      if coalesce(r.data ->> 'firmaClienteData', '') <> '' then
        begin
          v_firma := nullif(r.data ->> 'firmaClienteEn', '')::timestamptz;
        exception when others then
          v_firma := null;
        end;
        if v_firma is null and coalesce(r.data ->> 'firmaRemota', '') = ''
           and (r.created_at at time zone 'America/Mexico_City')::date = r.fecha then
          v_firma := r.created_at;
        end if;
      end if;
      if v_firma is not null and (v_firma at time zone 'America/Mexico_City')::date = r.fecha
         and r.hsa > to_char(v_firma at time zone 'America/Mexico_City', 'HH24:MI')
         and to_char(v_firma at time zone 'America/Mexico_City', 'HH24:MI') >= r.hll then
        v_salida := to_char(v_firma at time zone 'America/Mexico_City', 'HH24:MI');
        v_fuente := 'firma';
      end if;
    end if;

    if v_fuente is null or (v_llegada = r.hll and v_salida = r.hsa) then
      continue;
    end if;

    report_id := r.id;
    fuente := v_fuente;
    llegada_antes := r.hll;
    salida_antes := r.hsa;
    llegada := v_llegada;
    salida := v_salida;
    return next;

    if p_aplicar then
      update public.reports set data = data
        || jsonb_build_object(
             'horaLlegada', v_llegada,
             'horaSalida', v_salida,
             'horarioAjuste', jsonb_build_object('fuente', v_fuente, 'llegada', v_llegada, 'salida', v_salida, 'en', now()),
             -- Lo que capturó el técnico, solo la primera vez.
             'horarioCapturado', coalesce(r.data -> 'horarioCapturado', jsonb_build_object('llegada', r.hll, 'salida', r.hsa))
           )
      where id = r.id;
    end if;
  end loop;
end;
$$;

-- ---------- 2) Ratos en la oficina según el GPS ----------
-- Puntos seguidos dentro de un lugar de la empresa forman una estancia; se
-- devuelven las de 5 min o más. El técnico solo ve lo suyo.
create or replace function public.gps_en_lugares_propios(p_desde date, p_hasta date, p_tecnico uuid default null)
returns table (tecnico_id uuid, fecha date, lugar text, inicio timestamptz, fin timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with puntos as (
    select u.tecnico_id, u.registrado_en,
           (u.registrado_en at time zone 'America/Mexico_City')::date as fecha,
           (select lp.id from public.lugares_propios lp
             where 111320 * sqrt(power(u.lat - lp.lat, 2) + power((u.lng - lp.lng) * cos(radians(lp.lat)), 2)) <= lp.radio_m
             order by 111320 * sqrt(power(u.lat - lp.lat, 2) + power((u.lng - lp.lng) * cos(radians(lp.lat)), 2))
             limit 1) as lugar_id
    from public.ubicaciones_tecnicos u
    where auth.uid() is not null
      and public.mi_cuenta_activa()
      and (public.get_my_role() = 'supervisor' or u.tecnico_id = auth.uid())
      and (p_tecnico is null or u.tecnico_id = p_tecnico)
      and p_hasta - p_desde <= 62
      and u.registrado_en >= (p_desde::timestamp at time zone 'America/Mexico_City')
      and u.registrado_en < ((p_hasta + 1)::timestamp at time zone 'America/Mexico_City')
  ),
  marcados as (
    select p.*,
           case when p.lugar_id is distinct from lag(p.lugar_id) over w then 1 else 0 end as cambia
    from puntos p
    window w as (partition by p.tecnico_id, p.fecha order by p.registrado_en)
  ),
  islas as (
    select m.*, sum(m.cambia) over (partition by m.tecnico_id, m.fecha order by m.registrado_en) as grupo
    from marcados m
  )
  select i.tecnico_id, i.fecha, lp.nombre, min(i.registrado_en), max(i.registrado_en)
  from islas i
  join public.lugares_propios lp on lp.id = i.lugar_id
  group by i.tecnico_id, i.fecha, i.grupo, lp.nombre
  having max(i.registrado_en) - min(i.registrado_en) >= interval '5 minutes';
$$;

revoke all on function public.ajustar_horario_reportes(date, date, boolean) from public, anon;
grant execute on function public.ajustar_horario_reportes(date, date, boolean) to authenticated, service_role;
revoke all on function public.gps_en_lugares_propios(date, date, uuid) from public, anon;
grant execute on function public.gps_en_lugares_propios(date, date, uuid) to authenticated;

-- ---------- 3) Cada 15 minutos, para ayer y hoy ----------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'ajustar-horario-reportes';
    perform cron.schedule('ajustar-horario-reportes', '5,20,35,50 * * * *',
      $cron$select count(*) from public.ajustar_horario_reportes((now() at time zone 'America/Mexico_City')::date - 1, (now() at time zone 'America/Mexico_City')::date)$cron$);
  end if;
end $$;

notify pgrst, 'reload schema';
