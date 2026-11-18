-- Equipos cotizados para el cliente, como sugerencia en el reporte.
--
-- · cotizacion_lineas guarda ahora el MODELO y la MARCA del producto cuando el
--   concepto se liga a SYSCOM (antes solo la descripción y el enlace).
-- · equipos_cotizados_del_cliente(): lo que se cotizó a un cliente (sin
--   precios), para que el técnico, al escribir «inversor» en «Montaje de
--   equipo», elija el equipo y se llenen modelo, marca, descripción y foto.
--   Los técnicos no ven las cotizaciones; esta función solo entrega el equipo.
--
-- Idempotente.

alter table public.cotizacion_lineas
  add column if not exists modelo text check (char_length(modelo) <= 80),
  add column if not exists marca text check (char_length(marca) <= 80);

create or replace function public.equipos_cotizados_del_cliente(p_cliente uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(fila order by fila ->> 'prioridad', fila ->> 'fecha' desc, (fila ->> 'orden')::int), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'descripcion', l.descripcion,
      'cantidad', l.cantidad,
      'unidad', l.unidad,
      'modelo', l.modelo,
      'marca', l.marca,
      'enlace', l.enlace,
      -- Solo la foto de SYSCOM (https); las subidas a mano viven en un bucket privado.
      'foto', case when l.foto ~ '^https://' then l.foto end,
      'folio', c.folio,
      'estado', c.estado,
      'fecha', c.fecha,
      'orden', l.orden,
      -- Primero lo aprobado o enviado al cliente; luego los borradores.
      'prioridad', case when c.estado in ('aprobada', 'enviada') then 0 else 1 end
    ) as fila
    from public.cotizaciones c
    join public.cotizacion_lineas l on l.cotizacion_id = c.id
    where c.cliente_id = p_cliente
      and c.estado <> 'rechazada'
      and c.fecha >= current_date - 365
      and public.get_my_role() in ('tecnico', 'supervisor')
      and public.mi_cuenta_activa()
  ) t;
$$;

revoke all on function public.equipos_cotizados_del_cliente(uuid) from public, anon;
grant execute on function public.equipos_cotizados_del_cliente(uuid) to authenticated;

-- Comprobar: select jsonb_array_length(public.equipos_cotizados_del_cliente('<cliente>'));
