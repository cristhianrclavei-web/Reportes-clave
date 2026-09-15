-- ============================================================
-- Geocerca de servicios programados
-- ============================================================
-- Hasta ahora un servicio programado tenía fecha y, opcionalmente, hora de
-- llegada acordada — pero no dónde debía ocurrir, ni hora de salida. Esto
-- agrega:
--   1. hora_salida_programada: junto con hora_programada (llegada), permite
--      calcular cuánto debe durar el servicio.
--   2. ubicacion_programada: el punto donde el supervisor espera que ocurra
--      el servicio, capturado al programarlo.
--   3. radio_geocerca_m: qué tan cerca de ese punto cuenta como "está en
--      sitio". 120 m por defecto — suficiente para un GPS de celular en
--      exteriores, sin ser tan amplio que dé falsos positivos en zonas
--      urbanas densas.
--
-- Con esto, el cliente (navegador del técnico) puede comparar su ubicación
-- contra la programada y marcar llegada solo, sin depender de un botón.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

alter table public.servicios_programados
  add column if not exists hora_salida_programada time,
  add column if not exists ubicacion_programada jsonb,
  add column if not exists radio_geocerca_m integer not null default 120;

comment on column public.servicios_programados.hora_salida_programada is
  'Hora de salida acordada con el cliente, en hora local del sitio. Junto con hora_programada da la duración estimada.';
comment on column public.servicios_programados.ubicacion_programada is
  'Punto {lat, lng, direccion?} donde el supervisor espera que ocurra el servicio. Nulo en servicios anteriores a esta columna o cuando no se capturó.';
comment on column public.servicios_programados.radio_geocerca_m is
  'Distancia en metros dentro de la cual se considera que el técnico está en el sitio.';

-- Sitios activos de HOY, para que un técnico pueda revisar su propia
-- ubicación contra los servicios donde NO está asignado (detección de
-- "estoy en un sitio que no me toca"). Deliberadamente no expone proyecto,
-- técnicos ni ningún otro dato del servicio ajeno — solo lo indispensable
-- para calcular una distancia. Quien reciba un aviso de anomalía es
-- siempre un supervisor, que sí tiene permiso de ver el detalle completo.
create or replace function public.sitios_activos_hoy()
returns table (servicio_id uuid, lat numeric, lng numeric, radio_m integer)
language sql
security definer
set search_path = public
as $$
  select
    sp.id as servicio_id,
    (sp.ubicacion_programada->>'lat')::numeric as lat,
    (sp.ubicacion_programada->>'lng')::numeric as lng,
    sp.radio_geocerca_m as radio_m
  from public.servicios_programados sp
  where sp.fecha = current_date
    and sp.estado in ('programado', 'en_sitio', 'en_curso')
    and sp.ubicacion_programada is not null
    and not exists (
      select 1 from public.servicio_tecnicos st
      where st.servicio_id = sp.id and st.tecnico_id = auth.uid()
    );
$$;

grant execute on function public.sitios_activos_hoy() to authenticated;

-- Verificación: debe devolver 3.
--
-- select count(*) from information_schema.columns
--  where table_name='servicios_programados'
--    and column_name in ('hora_salida_programada','ubicacion_programada','radio_geocerca_m');
