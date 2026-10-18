-- El técnico puede editar su reporte durante la primera hora después de
-- guardarlo (antes eran 30 minutos), siempre que nadie lo haya firmado: ni
-- el cliente ni la persona que recibió cuando el cliente no estaba. Pasada
-- la hora, o con cualquiera de esas firmas, necesita una corrección
-- autorizada por el supervisor, como siempre.
--
-- Los primeros 30 minutos siguen abiertos aunque el cliente ya haya firmado:
-- la app guarda el reporte y enseguida le liga las fotos, y eso no debe fallar.
--
-- Es la misma función de patch_tecnico_oculta_fotos.sql; solo cambia la
-- condición de la ventana de tiempo. Se puede correr varias veces.

create or replace function public.proteger_edicion_reporte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permitidas text[] := array['firmaRemota', 'servicioConcluido', 'fechaConcluido', 'facturaEstado'];
  v_cambiadas text[];
begin
  -- Procesos internos: firma del cliente por enlace (sin sesión), triggers
  -- de facturación, cron. Y supervisores / facturación, que ya tienen sus
  -- propias reglas.
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return new;
  end if;
  if public.get_my_role() = 'supervisor' or public.puedo_gestionar_facturacion() then
    return new;
  end if;

  if not public.mi_cuenta_activa() then
    raise exception 'Tu cuenta está desactivada';
  end if;

  -- Con corrección autorizada, recién creado (para ligar sus fotos) o dentro
  -- de la primera hora sin ninguna firma en sitio, el técnico puede editarlo.
  if old.correccion_habilitada
     or old.created_at > now() - interval '30 minutes'
     or (old.created_at > now() - interval '60 minutes'
         and coalesce(old.data ->> 'firmaClienteData', '') = ''
         and coalesce(old.data -> 'clienteAusente' ->> 'recibioFirma', '') = '') then
    return new;
  end if;

  if new.fecha is distinct from old.fecha
     or new.empresa_cliente is distinct from old.empresa_cliente
     or new.cliente_id is distinct from old.cliente_id
     or new.tipo_servicio is distinct from old.tipo_servicio
     or new.sub_tipo_servicio is distinct from old.sub_tipo_servicio
     or new.created_by is distinct from old.created_by then
    raise exception 'Para cambiar el reporte pide una corrección al supervisor';
  end if;

  -- Reporte capturado sin conexión que todavía espera sus fotos: la app lo
  -- crea con «fotosPendientes» y las fotos pueden tardar más de 30 minutos
  -- en subir (mala señal). Mientras esa marca siga puesta, su autor puede
  -- ligar las fotos y quitar la marca; nada más.
  if coalesce(old.data ->> 'fotosPendientes', 'false') = 'true' then
    v_permitidas := v_permitidas || array['fotos', 'fotosPendientes', 'fotosNoSubidas'];
  end if;

  -- Ojo, etapa y área de las fotos: se acepta el cambio de «fotos» si,
  -- quitando esas tres marcas de cada foto, la lista nueva es igual a la anterior.
  if jsonb_typeof(old.data -> 'fotos') = 'array' and jsonb_typeof(new.data -> 'fotos') = 'array'
     and (
       select jsonb_agg(case when jsonb_typeof(f) = 'object' then f - 'interna' - 'etapa' - 'area' else f end)
       from jsonb_array_elements(new.data -> 'fotos') f
     ) is not distinct from (
       select jsonb_agg(case when jsonb_typeof(f) = 'object' then f - 'interna' - 'etapa' - 'area' else f end)
       from jsonb_array_elements(old.data -> 'fotos') f
     ) then
    v_permitidas := v_permitidas || array['fotos'];
  end if;

  select coalesce(array_agg(k), '{}') into v_cambiadas
  from (
    select key as k from jsonb_each(coalesce(new.data, '{}'::jsonb))
    union
    select key from jsonb_each(coalesce(old.data, '{}'::jsonb))
  ) llaves
  where (new.data -> k) is distinct from (old.data -> k);

  if not (v_cambiadas <@ v_permitidas) then
    raise exception 'Para cambiar el reporte pide una corrección al supervisor (campos: %)',
      array_to_string(array(select unnest(v_cambiadas) except select unnest(v_permitidas)), ', ');
  end if;
  -- El técnico puede marcar su servicio como concluido, pero no el estado
  -- de la factura (eso es de facturación).
  if (new.data -> 'facturaEstado') is distinct from (old.data -> 'facturaEstado')
     and coalesce(new.data ->> 'facturaEstado', 'pendiente') <> 'pendiente' then
    raise exception 'El estado de la factura lo cambia facturación';
  end if;
  return new;
end;
$$;
