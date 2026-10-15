-- ============================================================
-- Cotizaciones: una foto por concepto en el PDF
-- ============================================================
-- 1) Cada partida puede llevar una foto: subida a mano (se guarda en el
--    bucket «cotizaciones») o la imagen del producto de SYSCOM (enlace https).
-- 2) Casilla por cotización «Mostrar fotos en el PDF» (apagada por omisión:
--    las cotizaciones de siempre no cambian).
-- 3) Bucket público «cotizaciones»: el PDF que se comparte con el cliente se
--    arma sin sesión y necesita leer las fotos. Los nombres de archivo son
--    aleatorios; solo supervisión puede subir, cambiar o borrar.
-- 4) El PDF del enlace público (WhatsApp) ahora recibe también el título
--    del proyecto, la casilla de fotos y la foto de cada partida.
--
-- Ejecutar completo en el SQL Editor de Supabase. Se puede correr varias veces.

alter table public.cotizacion_lineas
  add column if not exists foto text;

alter table public.cotizacion_lineas
  drop constraint if exists cotizacion_lineas_foto_valida;
alter table public.cotizacion_lineas
  add constraint cotizacion_lineas_foto_valida check (
    foto is null
    or (length(foto) <= 2000 and (foto ~ '^conceptos/[A-Za-z0-9._-]+$' or foto ~ '^https://'))
  );

alter table public.cotizaciones
  add column if not exists mostrar_fotos boolean not null default false;

-- ---------- Bucket de fotos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cotizaciones', 'cotizaciones', true, 5 * 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5 * 1048576,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists cotizaciones_fotos_subir on storage.objects;
create policy cotizaciones_fotos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'cotizaciones' and public.get_my_role() = 'supervisor' and public.mi_cuenta_activa());
drop policy if exists cotizaciones_fotos_cambiar on storage.objects;
create policy cotizaciones_fotos_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'cotizaciones' and public.get_my_role() = 'supervisor' and public.mi_cuenta_activa());
drop policy if exists cotizaciones_fotos_borrar on storage.objects;
create policy cotizaciones_fotos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'cotizaciones' and public.get_my_role() = 'supervisor' and public.mi_cuenta_activa());

-- ---------- Enlace público de la cotización ----------
-- Igual que en patch_auditoria_2.sql, más titulo_proyecto, mostrar_fotos y
-- la foto de cada partida. Sigue sin entregar costo, margen ni enlace interno.
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
    'moneda', 'tipo_cambio', 'presentacion_precios', 'titulo_proyecto', 'mostrar_fotos'
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

-- Verificación: las tres columnas deben decir «true».
select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cotizacion_lineas' and column_name = 'foto') as columna_foto,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cotizaciones' and column_name = 'mostrar_fotos') as casilla_fotos,
  exists (select 1 from storage.buckets where id = 'cotizaciones' and public) as bucket;
