-- ============================================================
-- Cotizaciones: precios con IVA incluido
-- ============================================================
-- A veces el IVA ya va dentro del precio de los equipos. Con la casilla
-- «Precios con IVA incluido» el total es la suma de los conceptos (no se le
-- agrega IVA) y el PDF lo dice claramente: «IVA incluido» en lugar de
-- «más IVA», con el monto de IVA que ya viene dentro del total.
-- Apagada por omisión: las cotizaciones de siempre no cambian.
--
-- El enlace público (WhatsApp) también necesita saberlo para armar el PDF.
--
-- Ejecutar completo en el SQL Editor de Supabase. Se puede correr varias veces.

alter table public.cotizaciones
  add column if not exists iva_incluido boolean not null default false;

-- ---------- Enlace público de la cotización ----------
-- Igual que en patch_cotizacion_fotos.sql, más iva_incluido.
create or replace function public.obtener_cotizacion_publica(p_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  cot record;
  v_publicas constant text[] := array[
    'id', 'folio', 'fecha', 'estado', 'atencion', 'empresa', 'telefono', 'correo', 'direccion',
    'forma_pago', 'tiempo_entrega', 'garantia', 'vigencia_dias', 'notas',
    'firmante_nombre', 'firmante_correo', 'iva_pct', 'subtotal', 'iva', 'total',
    'moneda', 'tipo_cambio', 'presentacion_precios', 'titulo_proyecto', 'mostrar_fotos', 'iva_incluido'
  ];
  v_cotizacion jsonb;
  resultado json;
begin
  select * into cot from public.cotizaciones
    where id = p_id and estado in ('aprobada', 'enviada');

  if not found then
    return null;
  end if;

  select jsonb_object_agg(c.key, c.value) into v_cotizacion
  from jsonb_each(to_jsonb(cot)) c
  where c.key = any(v_publicas);

  select json_build_object(
    'cotizacion', v_cotizacion,
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
        'importe', l.importe,
        'foto', l.foto
      ) order by l.orden), '[]'::json)
      from public.cotizacion_lineas l
      where l.cotizacion_id = p_id
    )
  ) into resultado;

  return resultado;
end;
$$;

grant execute on function public.obtener_cotizacion_publica(uuid) to anon, authenticated;

-- Verificación: debe decir «true».
select exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'cotizaciones' and column_name = 'iva_incluido'
) as iva_incluido;
