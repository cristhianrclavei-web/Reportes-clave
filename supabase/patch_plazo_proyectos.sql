-- Plazo de los proyectos: días cotizados contra días reales, y por qué se
-- alargó (lib/plazosProyecto.ts).
--
--   dias_planeados         días con los que se programó el proyecto (los
--                          cotizados). Ampliar el proyecto NO lo cambia; así
--                          se sabe cuántos días se agregaron después.
--   ampliacion_motivo      en cada día agregado al ampliar: por qué hizo falta
--                          (clave de lib/motivosServicio.ts; propio o ajeno).
--   ampliacion_comentario  detalle libre del motivo.
--
-- Los proyectos que todavía no empiezan toman sus días actuales como los
-- cotizados. Los que ya empezaron o terminaron se quedan sin dato (no se sabe
-- si ya se habían ampliado) y el panel los muestra como «sin medir».
--
-- No cambia permisos: supervisión ya inserta y actualiza los días, y el
-- bloqueo de edición (patch_bloquear_edicion_servicio.sql) no vigila estas
-- columnas.
--
-- Idempotente. Correr en Supabase → SQL Editor.

alter table public.servicios_programados
  add column if not exists dias_planeados integer check (dias_planeados > 0),
  add column if not exists ampliacion_motivo text,
  add column if not exists ampliacion_comentario text;

update public.servicios_programados s
set dias_planeados = s.dias_totales
where s.dias_planeados is null
  and s.grupo_id in (
    select grupo_id from public.servicios_programados
    group by grupo_id
    having bool_and(estado in ('programado', 'cancelado'))
  );

-- Comprobación: debe regresar 3.
select count(*) as columnas_nuevas
from information_schema.columns
where table_schema = 'public' and table_name = 'servicios_programados'
  and column_name in ('dias_planeados', 'ampliacion_motivo', 'ampliacion_comentario');
