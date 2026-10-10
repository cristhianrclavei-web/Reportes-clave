-- Reportes capturados sin conexión: que sus fotos puedan ligarse aunque
-- tarden más de 30 minutos en subir.
--
-- La sincronización (lib/syncOfflineReports.ts) crea el reporte, sube las
-- fotos y al final las liga al reporte. Si la señal falla a medias, el
-- reporte se queda en la cola del teléfono y se reintenta. Pero la regla
-- de edición solo deja al técnico tocar su reporte durante los primeros 30
-- minutos: un reintento posterior no podía ligar las fotos. Aquí se permite
-- ese único cambio mientras el reporte lleve la marca «fotosPendientes».
--
-- Es la misma función de patch_auditoria_seguridad.sql con ese permiso
-- añadido. Se puede correr varias veces.

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

  -- Con corrección autorizada (o recién creado, para adjuntar fotos), el
  -- técnico puede editar su reporte. La app limita la corrección completa a
  -- reportes sin firma del cliente.
  if old.correccion_habilitada or old.created_at > now() - interval '30 minutes' then
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
