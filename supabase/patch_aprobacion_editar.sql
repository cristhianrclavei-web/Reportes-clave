-- Quien aprueba por el enlace (/aprobar/<token>) también puede EDITAR la
-- cotización en vez de pedir cambios: la página ofrece «Editar en la app»,
-- que abre el editor con su cuenta (Clara y Everardo son supervisión).
-- Para eso la información del enlace ahora incluye el id de la cotización.
-- El id no da acceso a nada sin sesión: la cotización la protege RLS.
--
-- Idempotente.

create or replace function public.aprobacion_remota_info(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s record;
  c record;
  v_estado text;
begin
  if p_token is null or p_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  select * into s from public.cotizacion_aprobaciones where token = lower(p_token)::uuid;
  if s.id is null then
    return null;
  end if;
  select id, folio, empresa, titulo_proyecto, total, moneda, estado, aprobada_por, aprobada_firma, updated_at
    into c from public.cotizaciones where id = s.cotizacion_id;
  if c.id is null then
    return null;
  end if;

  v_estado := case
    when s.resultado is not null then s.resultado
    when coalesce(c.aprobada_firma, '') <> '' then 'ya_aprobada'
    when s.vence_en < now() then 'vencido'
    when c.updated_at is distinct from s.version then 'cambiada'
    else 'pendiente'
  end;

  return jsonb_build_object(
    'estado', v_estado,
    'cotizacionId', c.id,
    'folio', c.folio,
    'empresa', c.empresa,
    'proyecto', c.titulo_proyecto,
    'total', c.total,
    'moneda', c.moneda,
    'conceptos', (select count(*) from public.cotizacion_lineas where cotizacion_id = c.id),
    'aprobador', (select full_name from public.profiles where id = s.aprobador_id),
    'pedidoPor', (select full_name from public.profiles where id = s.pedido_por),
    'pedidoEn', s.pedido_en,
    'aprobadaPor', c.aprobada_por
  );
end;
$$;

-- Comprobar: select public.aprobacion_remota_info((select token::text from public.cotizacion_aprobaciones order by pedido_en desc limit 1)) -> 'cotizacionId';
