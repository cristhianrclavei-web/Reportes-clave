-- Cierre del reporte con margen de 15 minutos (2026-11-22).
--
-- Reemplaza la regla de patch_firma_comida.sql para los reportes firmados en sitio:
--   · Si el técnico se va de la planta dentro de los 15 min después de la
--     firma, la salida del reporte (y del PDF) es la hora en que el GPS lo
--     vio salir. Ej.: firma 16:30, sale 16:45 → salida 16:45.
--   · Si se queda más, la salida del reporte queda en firma + 15 min y lo
--     demás se le pide justificar (comida, cargar material, siguió
--     trabajando, trámite de salida, espera, asunto personal, otro). Lo de
--     trabajo cuenta como servicio en la bitácora; la comida, como comida.
--   · Sin GPS: la salida no puede ser después de la firma (como antes).
-- Además: aviso al teléfono del técnico en cuanto se detecta el rato de más
-- (cron cada 15 min → /api/cron/paradas-tras-firma).
--
-- Requiere patch_firma_comida.sql. Se puede correr más de una vez.

-- ---------- 1) 15 minutos de cierre ----------
alter table public.ajustes_operacion alter column cierre_tras_firma_min set default 15;
update public.ajustes_operacion set cierre_tras_firma_min = 15 where cierre_tras_firma_min = 30;

-- ---------- 2) Motivos nuevos y aviso enviado ----------
alter table public.paradas_detectadas drop constraint if exists paradas_detectadas_motivo_check;
alter table public.paradas_detectadas add constraint paradas_detectadas_motivo_check
  check (motivo in ('combustible', 'compra_material', 'comida', 'desayuno_tienda', 'espera', 'cliente', 'otro',
                    'material_herramienta', 'siguio_trabajando', 'tramite_salida', 'personal'));
-- Cuándo se le avisó al técnico por push (null = todavía no).
alter table public.paradas_detectadas add column if not exists avisado_en timestamptz;

-- ---------- 3) Ajustar el horario de los reportes ----------
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
  v_firma text;
  v_tope text;
  v_gps text;
  v_cierre integer;
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
  select a.cierre_tras_firma_min into v_cierre from public.ajustes_operacion a limit 1;
  v_cierre := coalesce(v_cierre, 15);

  for r in
    select rep.id, rep.data,
           rep.data ->> 'horaLlegada' as hll, rep.data ->> 'horaSalida' as hsa,
           public.firmado_en_sitio(rep.data) as en_sitio,
           f.firma,
           vis.llegada as gps_llegada, vis.salida as gps_salida,
           vf.salida as gps_salida_firma
    from public.reports rep
    cross join lateral (select public.hora_firma_cliente(rep.data, rep.created_at, rep.fecha) as firma) f
    -- Visita del GPS (para lo que no se firmó en sitio).
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
    -- Visita del GPS en la que se firmó (para lo firmado en sitio).
    left join lateral (
      select v.salida
      from public.visitas_detectadas v
      where f.firma is not null
        and v.tecnico_id = rep.created_by and v.fecha = rep.fecha and v.cliente_id = rep.cliente_id
        and v.salida < now() - interval '20 minutes'
        and f.firma between v.llegada and v.salida
      limit 1
    ) vf on true
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

    if r.en_sitio then
      if r.firma is not null then
        v_firma := to_char(r.firma at time zone 'America/Mexico_City', 'HH24:MI');
        if r.gps_salida_firma is not null then
          -- Con GPS: la hora en que salió, pero no más de 15 min después de la firma.
          v_tope := to_char((r.firma + make_interval(mins => v_cierre)) at time zone 'America/Mexico_City', 'HH24:MI');
          v_gps := to_char(r.gps_salida_firma at time zone 'America/Mexico_City', 'HH24:MI');
          if v_gps <= v_tope then
            v_salida := v_gps;
            v_fuente := 'gps';
          else
            v_salida := v_tope;
            v_fuente := 'firma';
          end if;
          -- Cruzó la medianoche o quedaría antes de la llegada: no se toca.
          if v_salida < r.hll or v_tope < v_firma then
            v_salida := r.hsa;
            v_fuente := null;
          end if;
        elsif r.hsa > v_firma and v_firma >= r.hll then
          -- Sin GPS: la salida no puede ser después de la firma.
          v_salida := v_firma;
          v_fuente := 'firma';
        end if;
      end if;
    elsif r.gps_llegada is not null then
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

-- ---------- 4) Justificar: los motivos del rato después de la firma ----------
-- Se autorizan solos (supervisión los ve en la bitácora); «Otro» espera autorización.
create or replace function public.justificar_parada(p_id uuid, p_motivo text, p_detalle text default null, p_gasto jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.paradas_detectadas;
  v_supervisor boolean := public.get_my_role() = 'supervisor';
  v_detalle text := nullif(trim(coalesce(p_detalle, '')), '');
  v_estado text;
  v_tecnico text;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión activa.';
  end if;
  select * into v from public.paradas_detectadas where id = p_id;
  if not found then
    raise exception 'No se encontró la parada.';
  end if;
  if not v_supervisor and v.tecnico_id <> auth.uid() then
    raise exception 'Esta parada es de otra persona.';
  end if;
  if p_motivo is null or p_motivo not in ('combustible', 'compra_material', 'comida', 'desayuno_tienda', 'espera', 'cliente', 'otro', 'material_herramienta', 'siguio_trabajando', 'tramite_salida', 'personal') then
    raise exception 'Elige qué fue la parada.';
  end if;
  -- Estos solo tienen sentido con el cliente, después de la firma.
  if p_motivo in ('material_herramienta', 'siguio_trabajando', 'tramite_salida', 'personal') and v.reporte_id is null then
    raise exception 'Ese motivo es solo para el rato con el cliente después de la firma.';
  end if;
  if p_motivo in ('compra_material', 'cliente', 'otro') and char_length(coalesce(v_detalle, '')) < 3 then
    raise exception '%', case p_motivo
      when 'compra_material' then 'Escribe qué material compraste o recogiste.'
      when 'cliente' then 'Escribe con qué cliente estabas.'
      else 'Explica qué pasó (al menos unas palabras).'
    end;
  end if;
  if char_length(coalesce(v_detalle, '')) > 500 then
    raise exception 'La explicación es muy larga (máximo 500 letras).';
  end if;
  if v.estado = 'aprobada' and v.revisado_por is not null and not v_supervisor then
    raise exception 'Esta parada ya está autorizada.';
  end if;

  v_estado := case when v_supervisor or p_motivo in ('comida', 'desayuno_tienda', 'espera', 'material_herramienta', 'siguio_trabajando', 'tramite_salida', 'personal') then 'aprobada' else 'pendiente' end;
  update public.paradas_detectadas
     set motivo = p_motivo,
         detalle = v_detalle,
         estado = v_estado,
         justificado_por = auth.uid(),
         justificado_en = now(),
         revisado_por = case when v_supervisor then auth.uid() end,
         revisado_en = case when v_supervisor then now() end
   where id = p_id
   returning * into v;

  perform public.guardar_gasto_campo(
    v.tecnico_id, v.fecha,
    case p_motivo when 'combustible' then 'combustible' when 'compra_material' then 'material' end,
    p_gasto, v.id, null
  );
  perform public.sincronizar_actividad_de_parada(v.id);

  select full_name into v_tecnico from public.profiles where id = v.tecnico_id;
  insert into public.auditoria_global (actor_id, accion, entidad, entidad_id, detalle, seccion)
  values (
    auth.uid(), 'justifico_parada', 'parada', v.id,
    case when auth.uid() <> v.tecnico_id then 'Por ' || coalesce(v_tecnico, 'técnico') || ': ' else '' end || public.texto_parada(v),
    'reportes'
  );
end;
$$;

-- ---------- 5) Texto de la parada ----------
create or replace function public.texto_parada(p public.paradas_detectadas)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when p.reporte_id is not null
           then 'En ' || coalesce((select nombre from public.clientes where id = p.cliente_id), 'el cliente') || ' después de la firma, el '
           else 'Parada del '
         end
    || to_char(p.fecha, 'DD/MM/YYYY') || ' de '
    || to_char(p.inicio at time zone 'America/Mexico_City', 'HH24:MI') || ' a '
    || to_char(p.fin at time zone 'America/Mexico_City', 'HH24:MI') || ' — '
    || case p.motivo
         when 'combustible' then 'Carga de combustible'
         when 'compra_material' then 'Compra de material'
         when 'comida' then 'Comida'
         when 'desayuno_tienda' then 'Desayuno o tienda'
         when 'material_herramienta' then 'Cargar o guardar material y herramienta'
         when 'siguio_trabajando' then 'Siguió trabajando'
         when 'tramite_salida' then 'Trámite de salida de la planta'
         when 'personal' then 'Asunto personal'
         when 'espera' then 'Tráfico o espera'
         when 'cliente' then 'Con un cliente'
         else 'Otro'
       end
    || coalesce(': ' || nullif(trim(p.detalle), ''), '')
    || coalesce(' · $' || to_char((select g.monto from public.gastos_campo g where g.parada_id = p.id), 'FM999,999,990.00'), '');
$$;
revoke all on function public.texto_parada(public.paradas_detectadas) from public, anon, authenticated;
revoke all on function public.justificar_parada(uuid, text, text, jsonb) from public, anon;
grant execute on function public.justificar_parada(uuid, text, text, jsonb) to authenticated;
revoke all on function public.ajustar_horario_reportes(date, date, boolean) from public, anon;
grant execute on function public.ajustar_horario_reportes(date, date, boolean) to authenticated, service_role;

-- ---------- 6) Aviso inmediato al técnico (cada 15 min) ----------
-- Usa la misma dirección de la app y el mismo secreto que el aviso de pausas
-- (ya guardados en su cron), para no escribir el secreto en este archivo.
do $$
declare
  v_comando text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  select command into v_comando from cron.job where jobname = 'recordatorios-pausa';
  if v_comando is null or v_comando !~ '/api/cron/pausas' then
    raise notice 'No está el cron recordatorios-pausa: el aviso después de la firma no se programó.';
    return;
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'aviso-tras-firma';
  perform cron.schedule('aviso-tras-firma', '8,23,38,53 * * * *',
    regexp_replace(regexp_replace(v_comando, '/api/cron/pausas', '/api/cron/paradas-tras-firma'), 'body := [^)]*', 'body := ''{}''::jsonb'));
end $$;

-- ---------- 7) Volver a ajustar con la regla nueva ----------
-- Lo firmado en sitio que se ajustó a la hora de la firma se regresa a lo
-- capturado (si nadie lo corrigió a mano) y se vuelve a calcular.
update public.reports
   set data = (data - 'horarioAjuste')
     || jsonb_build_object('horaLlegada', data -> 'horarioCapturado' ->> 'llegada', 'horaSalida', data -> 'horarioCapturado' ->> 'salida')
 where public.firmado_en_sitio(data)
   and data -> 'horarioAjuste' is not null
   and data -> 'horarioCapturado' is not null
   and fecha >= (now() at time zone 'America/Mexico_City')::date - 30
   and data ->> 'horaLlegada' = data -> 'horarioAjuste' ->> 'llegada'
   and data ->> 'horaSalida' = data -> 'horarioAjuste' ->> 'salida';

select * from public.ajustar_horario_reportes((now() at time zone 'America/Mexico_City')::date - 30, (now() at time zone 'America/Mexico_City')::date);
select public.detectar_paradas((now() at time zone 'America/Mexico_City')::date - 1, (now() at time zone 'America/Mexico_City')::date) as paradas;

notify pgrst, 'reload schema';
