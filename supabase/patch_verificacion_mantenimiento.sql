-- ============================================================
-- Verificación pública de mantenimientos (QR de la etiqueta)
-- ============================================================
-- La etiqueta que se pega en el equipo lleva un QR a
-- /verificar/<token>. Quien lo escanea (p. ej. un auditor) no tiene cuenta,
-- así que esta función es lo ÚNICO que puede consultar sin sesión, y solo
-- devuelve lo necesario para comprobar el servicio: cliente, fecha, folio,
-- ingeniero responsable y, por formato, el resumen y cada punto revisado
-- (con el hallazgo de los que no cumplen). Sin fotos, firmas ni contactos.
--
-- El token es un UUID aleatorio que el formulario guarda en
-- reports.data->>'tokenVerificacion' (así funciona también sin conexión);
-- no se puede adivinar ni deducir del folio.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

create index if not exists idx_reports_token_verificacion
  on public.reports ((data ->> 'tokenVerificacion'))
  where data ? 'tokenVerificacion';

create or replace function public.verificar_mantenimiento(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  -- Solo UUIDs: cualquier otra cosa no se busca.
  if p_token is null
     or p_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;

  select id, fecha, empresa_cliente, data
    into r
  from public.reports
  where data ->> 'tokenVerificacion' = lower(p_token)
  limit 1;

  if r.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'folio', upper(left(r.id::text, 8)),
    'fecha', r.fecha,
    'cliente', r.empresa_cliente,
    'tecnico', coalesce(nullif(r.data ->> 'ingACargo', ''), r.data ->> 'firmaIngNombre'),
    'formatos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'titulo', f ->> 'titulo',
        'visita', f ->> 'visita',
        'normas', (select coalesce(jsonb_agg(n ->> 'clave'), '[]'::jsonb) from jsonb_array_elements(coalesce(f -> 'normas', '[]'::jsonb)) n),
        'frecuencias', (select coalesce(jsonb_agg(distinct p ->> 'frecuencia'), '[]'::jsonb) from jsonb_array_elements(coalesce(f -> 'puntos', '[]'::jsonb)) p),
        'total', jsonb_array_length(coalesce(f -> 'puntos', '[]'::jsonb)),
        'cumple', (select count(*) from jsonb_array_elements(coalesce(f -> 'puntos', '[]'::jsonb)) p where p ->> 'resultado' = 'cumple'),
        'noCumple', (select count(*) from jsonb_array_elements(coalesce(f -> 'puntos', '[]'::jsonb)) p where p ->> 'resultado' = 'no_cumple'),
        'na', (select count(*) from jsonb_array_elements(coalesce(f -> 'puntos', '[]'::jsonb)) p where p ->> 'resultado' = 'na'),
        'areas', f ->> 'areas',
        -- Detalle de cada punto para «Ver detalles» (sin fotos ni firmas).
        'puntos', (select coalesce(jsonb_agg(jsonb_build_object(
            'componente', p ->> 'componente',
            'actividad', p ->> 'actividad',
            'criterio', p ->> 'criterio',
            'ref', p ->> 'ref',
            'frecuencia', p ->> 'frecuencia',
            'resultado', p ->> 'resultado',
            'valor', p ->> 'valor',
            'nota', case when p ->> 'resultado' = 'no_cumple' then p ->> 'nota' end
          ) order by o), '[]'::jsonb)
          from jsonb_array_elements(coalesce(f -> 'puntos', '[]'::jsonb)) with ordinality as x(p, o))
      ))
      from jsonb_array_elements(coalesce(r.data -> 'formatosMtto', '[]'::jsonb)) f
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.verificar_mantenimiento(text) from public;
grant execute on function public.verificar_mantenimiento(text) to anon, authenticated;

-- Verificación: con un token inexistente debe regresar NULL.
select public.verificar_mantenimiento('00000000-0000-4000-8000-000000000000') as debe_ser_null;
