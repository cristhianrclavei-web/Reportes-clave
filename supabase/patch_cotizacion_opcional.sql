-- Sistemas opcionales en la cotización (2026-11-24).
--
-- Una partida marcada como opcional se muestra en el PDF pero NO se suma al
-- subtotal, IVA ni total; abajo del total sale un cuadro «Opciones» con lo
-- que costaría cada una. Se marca por sistema en el formulario; se guarda en
-- cada partida, igual que titulo_sistema.
--
-- También se corrige el enlace público del cliente: no entregaba
-- titulo_sistema, así que su PDF salía sin el nombre del proyecto de cada
-- sistema.

alter table public.cotizacion_lineas
  add column if not exists opcional boolean not null default false;

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
    'moneda', 'tipo_cambio', 'presentacion_precios', 'titulo_proyecto', 'mostrar_fotos', 'iva_incluido', 'total_neto'
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
        'titulo_sistema', l.titulo_sistema,
        'opcional', l.opcional,
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
  where table_schema = 'public' and table_name = 'cotizacion_lineas' and column_name = 'opcional'
) as opcional;
