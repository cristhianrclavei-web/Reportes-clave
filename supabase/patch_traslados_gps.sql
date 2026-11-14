-- Traslados detectados por el rastreo + motivo «compra de material».
--
-- 1) Justificar una visita: se agrega el motivo «Recolección o compra de
--    material» (pasar 20 minutos o más recogiendo material junto a un cliente
--    ya no obliga a escoger «Otro»).
-- 2) Traslados: los tramos en que el teléfono de la empresa va en movimiento
--    (de la oficina al servicio, entre servicios, a comprar material) se
--    guardan en `traslados_detectados`. La bitácora los pinta como «Traslado»
--    en el tiempo que nadie registró; lo que el técnico sí registró (servicio,
--    actividad, pausa) manda siempre sobre el traslado automático.
--
-- Requiere patch_visitas_exigibles.sql. Se puede correr más de una vez.

-- ---------- 1) Motivo nuevo ----------
alter table public.visitas_detectadas drop constraint if exists visitas_detectadas_justificacion_motivo_check;
alter table public.visitas_detectadas add constraint visitas_detectadas_justificacion_motivo_check
  check (justificacion_motivo in ('cliente_cercano', 'sin_trabajo', 'compra_material', 'otro'));

create or replace function public.texto_visita(p_visita public.visitas_detectadas)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'Visita a ' || coalesce((select nombre from public.clientes where id = p_visita.cliente_id), 'cliente')
    || ' el ' || to_char(p_visita.fecha, 'DD/MM/YYYY') || ' — '
    || case p_visita.justificacion_motivo
         when 'cliente_cercano' then 'Estaba con otro cliente cercano'
         when 'sin_trabajo' then 'No se hizo trabajo'
         when 'compra_material' then 'Recolección o compra de material'
         else 'Otro'
       end
    || coalesce(': ' || nullif(trim(p_visita.justificacion_detalle), ''), '');
$$;

create or replace function public.justificar_visita(p_id uuid, p_motivo text, p_detalle text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.visitas_detectadas;
  v_supervisor boolean := public.get_my_role() = 'supervisor';
  v_detalle text := nullif(trim(coalesce(p_detalle, '')), '');
  v_tecnico text;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión activa.';
  end if;
  select * into v from public.visitas_detectadas where id = p_id;
  if not found then
    raise exception 'No se encontró la visita.';
  end if;
  if not v_supervisor and v.tecnico_id <> auth.uid() then
    raise exception 'Esta visita es de otra persona.';
  end if;
  if p_motivo is null or p_motivo not in ('cliente_cercano', 'sin_trabajo', 'compra_material', 'otro') then
    raise exception 'Elige el motivo.';
  end if;
  if char_length(coalesce(v_detalle, '')) < 3 then
    raise exception 'Explica qué pasó (al menos unas palabras).';
  end if;
  if char_length(v_detalle) > 500 then
    raise exception 'La explicación es muy larga (máximo 500 letras).';
  end if;
  if v.justificacion_estado = 'aprobada' and not v_supervisor then
    raise exception 'Esta visita ya está autorizada.';
  end if;

  update public.visitas_detectadas
     set justificacion_motivo = p_motivo,
         justificacion_detalle = v_detalle,
         justificacion_estado = case when v_supervisor then 'aprobada' else 'pendiente' end,
         justificado_por = auth.uid(),
         justificado_en = now(),
         revisado_por = case when v_supervisor then auth.uid() end,
         revisado_en = case when v_supervisor then now() end
   where id = p_id
   returning * into v;

  select full_name into v_tecnico from public.profiles where id = v.tecnico_id;
  insert into public.auditoria_global (actor_id, accion, entidad, entidad_id, detalle, seccion)
  values (
    auth.uid(), 'justifico_visita', 'visita', v.id,
    case when auth.uid() <> v.tecnico_id then 'Por ' || coalesce(v_tecnico, 'técnico') || ': ' else '' end || public.texto_visita(v),
    'reportes'
  );
end;
$$;

-- ---------- 2) Traslados detectados ----------
create table if not exists public.traslados_detectados (
  id uuid primary key default gen_random_uuid(),
  tecnico_id uuid not null references public.profiles(id) on delete cascade,
  fecha date not null,
  inicio timestamptz not null,
  fin timestamptz not null,
  metros integer not null,
  calculado_en timestamptz not null default now()
);

create index if not exists traslados_detectados_fecha on public.traslados_detectados (fecha, tecnico_id);

-- Cada quien ve los suyos; supervisión, todos. Nadie escribe directo.
alter table public.traslados_detectados enable row level security;
drop policy if exists traslados_detectados_leer on public.traslados_detectados;
create policy traslados_detectados_leer on public.traslados_detectados
  for select to authenticated
  using (tecnico_id = auth.uid() or public.get_my_role() = 'supervisor');

-- Vuelve a calcular los traslados de esos días (hora de México).
--
-- Regla: entre dos puntos seguidos hubo movimiento si el teléfono avanzó
-- 100 m o más a 2 m/s o más (7 km/h: deja fuera caminar dentro de un sitio y
-- el brinco normal del GPS). Los tramos en movimiento separados por 5 minutos
-- o menos (semáforos, tráfico) son el mismo traslado. Solo cuenta un traslado
-- de 5 minutos y 500 m o más. Si el teléfono se quedó sin señal hasta una hora
-- y reapareció lejos, ese rato también es traslado.
create or replace function public.detectar_traslados(p_desde date, p_hasta date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 92 then
    raise exception 'Rango de fechas no válido (máximo 92 días).';
  end if;

  -- Solo se borran los días que todavía tienen rastreo para recalcular: el
  -- rastreo se guarda 90 días, pero los traslados ya calculados se conservan.
  delete from public.traslados_detectados t
   where t.fecha between p_desde and p_hasta
     and exists (
       select 1 from public.ubicaciones_tecnicos u
        where u.tecnico_id = t.tecnico_id
          and u.registrado_en >= (t.fecha::timestamp at time zone 'America/Mexico_City')
          and u.registrado_en < ((t.fecha + 1)::timestamp at time zone 'America/Mexico_City')
     );

  with puntos as (
    select u.tecnico_id, u.registrado_en, u.lat, u.lng,
           (u.registrado_en at time zone 'America/Mexico_City')::date as fecha,
           lag(u.registrado_en) over w as antes_en,
           lag(u.lat) over w as antes_lat,
           lag(u.lng) over w as antes_lng
    from public.ubicaciones_tecnicos u
    where u.registrado_en >= (p_desde::timestamp at time zone 'America/Mexico_City')
      and u.registrado_en < ((p_hasta + 1)::timestamp at time zone 'America/Mexico_City')
    window w as (partition by u.tecnico_id, (u.registrado_en at time zone 'America/Mexico_City')::date order by u.registrado_en)
  ),
  pasos as (
    select p.tecnico_id, p.fecha, p.antes_en as inicio, p.registrado_en as fin,
           extract(epoch from p.registrado_en - p.antes_en) as segundos,
           -- Distancia aproximada en metros (suficiente a esta escala).
           111320 * sqrt(power(p.lat - p.antes_lat, 2) + power((p.lng - p.antes_lng) * cos(radians(p.lat)), 2)) as metros
    from puntos p
    where p.antes_en is not null and p.registrado_en > p.antes_en
  ),
  en_movimiento as (
    select s.*,
           case when s.inicio - lag(s.fin) over (partition by s.tecnico_id, s.fecha order by s.inicio) <= interval '5 minutes' then 0 else 1 end as empieza_otro
    from pasos s
    where s.metros >= 100 and s.metros / s.segundos >= 2 and s.segundos <= 3600
  ),
  agrupados as (
    select m.*, sum(m.empieza_otro) over (partition by m.tecnico_id, m.fecha order by m.inicio) as grupo
    from en_movimiento m
  )
  insert into public.traslados_detectados (tecnico_id, fecha, inicio, fin, metros)
  select a.tecnico_id, a.fecha, min(a.inicio), max(a.fin), round(sum(a.metros))::integer
  from agrupados a
  group by a.tecnico_id, a.fecha, a.grupo
  having max(a.fin) - min(a.inicio) >= interval '5 minutes' and sum(a.metros) >= 500;

  select count(*) into v_total from public.traslados_detectados t where t.fecha between p_desde and p_hasta;
  return v_total;
end;
$$;

revoke all on function public.detectar_traslados(date, date) from public, anon, authenticated;
grant execute on function public.detectar_traslados(date, date) to service_role;

-- ---------- 3) Cálculo automático cada 15 minutos (ayer y hoy) ----------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'detectar-traslados';
    perform cron.schedule('detectar-traslados', '*/15 * * * *',
      $cron$select public.detectar_traslados((now() at time zone 'America/Mexico_City')::date - 1, (now() at time zone 'America/Mexico_City')::date)$cron$);
  end if;
end $$;

-- Los días que todavía tienen rastreo guardado.
select public.detectar_traslados((now() at time zone 'America/Mexico_City')::date - 92, (now() at time zone 'America/Mexico_City')::date) as traslados_calculados;
