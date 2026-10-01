-- ============================================================
-- Enlace del equipo en cada partida de la cotización (solo interno)
-- ============================================================
-- 1) Cada partida puede guardar el enlace de donde se sacó el precio o las
--    características del equipo (página del proveedor, ficha técnica). Solo
--    se ve dentro de la app; no sale en el PDF del cliente.
-- 2) La función pública del enlace de la cotización (la que usa el PDF que
--    se comparte por WhatsApp) devolvía cada partida completa, incluido el
--    COSTO y el % de GANANCIA: quien tuviera el enlace podía consultarlos
--    directo. Ahora solo devuelve lo que necesita el PDF, sin costo, margen
--    ni este enlace.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

alter table public.cotizacion_lineas
  add column if not exists enlace text;

alter table public.cotizacion_lineas
  drop constraint if exists cotizacion_lineas_enlace_largo;
alter table public.cotizacion_lineas
  add constraint cotizacion_lineas_enlace_largo check (enlace is null or length(enlace) <= 2000);

create or replace function public.obtener_cotizacion_publica(p_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  cot record;
  resultado json;
begin
  select * into cot from public.cotizaciones
    where id = p_id and estado in ('aprobada', 'enviada');

  if not found then
    return null;
  end if;

  select json_build_object(
    'cotizacion', row_to_json(cot),
    -- Solo lo que se imprime: sin costo, margen ni enlace interno.
    'lineas', (
      select coalesce(json_agg(json_build_object(
        'id', l.id,
        'cotizacion_id', l.cotizacion_id,
        'sistema', l.sistema,
        'orden', l.orden,
        'descripcion', l.descripcion,
        'unidad', l.unidad,
        'cantidad', l.cantidad,
        'precio_unitario', l.precio_unitario,
        'importe', l.importe
      ) order by l.orden), '[]'::json)
      from public.cotizacion_lineas l
      where l.cotizacion_id = p_id
    )
  ) into resultado;

  return resultado;
end;
$$;

grant execute on function public.obtener_cotizacion_publica(uuid) to anon, authenticated;

-- Verificación: debe regresar 'enlace' (la columna existe).
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'cotizacion_lineas' and column_name = 'enlace';
