-- Visita autorizada como «Recolección o compra de material» → bitácora.
--
-- Cuando supervisión autoriza la justificación de una visita con el motivo
-- «compra_material» (o la justifica ella misma con ese motivo), en la
-- bitácora del técnico se crea una actividad «Compra de material» de la
-- llegada a la salida que vio el rastreo. Si después se rechaza o se cambia
-- el motivo, esa actividad se quita.
--
-- Si el técnico ya tenía algo registrado a esa hora (una compra que sí
-- registró, otra actividad), no se crea nada: lo que él registró manda.
--
-- Requiere patch_visitas_exigibles.sql y patch_traslados_gps.sql. Se puede
-- correr más de una vez.

alter table public.visitas_detectadas
  add column if not exists actividad_id uuid references public.actividades(id) on delete set null;
comment on column public.visitas_detectadas.actividad_id is 'Actividad «Compra de material» que se creó en la bitácora al autorizar la visita.';

create or replace function public.sincronizar_compra_de_visita(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.visitas_detectadas;
  v_debe_existir boolean;
  v_cliente text;
  v_actividad uuid;
begin
  select * into v from public.visitas_detectadas where id = p_id;
  if not found then
    return;
  end if;
  v_debe_existir := v.justificacion_motivo = 'compra_material' and v.justificacion_estado = 'aprobada';

  -- Ya no corresponde (rechazada, otro motivo, vuelta a pendiente): se quita.
  if not v_debe_existir then
    if v.actividad_id is not null then
      delete from public.actividades where id = v.actividad_id;
      update public.visitas_detectadas set actividad_id = null where id = p_id;
    end if;
    return;
  end if;

  if v.actividad_id is not null then
    return;
  end if;

  -- Lo que el técnico ya registró a esa hora manda.
  if exists (
    select 1 from public.actividades a
     where a.created_by = v.tecnico_id
       and tstzrange(a.hora_inicio, coalesce(a.hora_fin, now())) && tstzrange(v.llegada, v.salida)
  ) then
    return;
  end if;

  select nombre into v_cliente from public.clientes where id = v.cliente_id;
  insert into public.actividades (
    created_by, proyecto, titulo, estado, hora_inicio, hora_fin, tipo, cliente_id,
    origen, registrado_por
  ) values (
    v.tecnico_id, coalesce(v_cliente, ''), 'Compra de material', 'concluida', v.llegada, v.salida, 'compra', v.cliente_id,
    'manual', coalesce(v.revisado_por, auth.uid())
  )
  returning id into v_actividad;

  insert into public.actividad_eventos (actividad_id, tipo, nota, created_at)
  values (v_actividad, 'cierre', 'Visita autorizada: ' || coalesce(v.justificacion_detalle, 'recolección o compra de material'), v.salida);

  update public.visitas_detectadas set actividad_id = v_actividad where id = p_id;
end;
$$;

revoke all on function public.sincronizar_compra_de_visita(uuid) from public, anon, authenticated;

create or replace function public.justificar_visita(p_id uuid, p_motivo text, p_detalle text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.visitas_detectadas;
  v_supervisor boolean := public.get_my_role() = 'supervisor';
  v_detalle text := nullif(trim(coalesce(p_detalle, '')), '');
  v_tecnico text;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión activa.';
  end if;
  select * into v from public.visitas_detectadas where id = p_id;
  if not found then
    raise exception 'No se encontró la visita.';
  end if;
  if not v_supervisor and v.tecnico_id <> auth.uid() then
    raise exception 'Esta visita es de otra persona.';
  end if;
  if p_motivo is null or p_motivo not in ('cliente_cercano', 'sin_trabajo', 'compra_material', 'otro') then
    raise exception 'Elige el motivo.';
  end if;
  if char_length(coalesce(v_detalle, '')) < 3 then
    raise exception 'Explica qué pasó (al menos unas palabras).';
  end if;
  if char_length(v_detalle) > 500 then
    raise exception 'La explicación es muy larga (máximo 500 letras).';
  end if;
  if v.justificacion_estado = 'aprobada' and not v_supervisor then
    raise exception 'Esta visita ya está autorizada.';
  end if;

  update public.visitas_detectadas
     set justificacion_motivo = p_motivo,
         justificacion_detalle = v_detalle,
         justificacion_estado = case when v_supervisor then 'aprobada' else 'pendiente' end,
         justificado_por = auth.uid(),
         justificado_en = now(),
         revisado_por = case when v_supervisor then auth.uid() end,
         revisado_en = case when v_supervisor then now() end
   where id = p_id
   returning * into v;

  -- Si quedó autorizada como compra de material, la bitácora la registra.
  perform public.sincronizar_compra_de_visita(v.id);

  select full_name into v_tecnico from public.profiles where id = v.tecnico_id;
  insert into public.auditoria_global (actor_id, accion, entidad, entidad_id, detalle, seccion)
  values (
    auth.uid(), 'justifico_visita', 'visita', v.id,
    case when auth.uid() <> v.tecnico_id then 'Por ' || coalesce(v_tecnico, 'técnico') || ': ' else '' end || public.texto_visita(v),
    'reportes'
  );
end;
$$;

create or replace function public.revisar_visita(p_id uuid, p_aprobar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.visitas_detectadas;
  v_tecnico text;
begin
  if auth.uid() is null or public.get_my_role() <> 'supervisor' then
    raise exception 'Solo supervisión puede autorizar o rechazar.';
  end if;
  select * into v from public.visitas_detectadas where id = p_id;
  if not found then
    raise exception 'No se encontró la visita.';
  end if;
  if v.justificacion_estado is null then
    raise exception 'Esta visita todavía no tiene justificación.';
  end if;

  update public.visitas_detectadas
     set justificacion_estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         revisado_por = auth.uid(),
         revisado_en = now()
   where id = p_id
   returning * into v;

  -- Si quedó autorizada como compra de material, la bitácora la registra.
  perform public.sincronizar_compra_de_visita(v.id);

  select full_name into v_tecnico from public.profiles where id = v.tecnico_id;
  insert into public.auditoria_global (actor_id, accion, entidad, entidad_id, detalle, seccion)
  values (
    auth.uid(), case when p_aprobar then 'autorizo_visita' else 'rechazo_visita' end, 'visita', v.id,
    'De ' || coalesce(v_tecnico, 'técnico') || ': ' || public.texto_visita(v),
    'reportes'
  );
end;
$$;

-- Las que ya estaban autorizadas con ese motivo.
select public.sincronizar_compra_de_visita(id)
  from public.visitas_detectadas
 where justificacion_motivo = 'compra_material' and justificacion_estado = 'aprobada' and actividad_id is null;

-- Verificación: columna = 1, funcion = 1.
select
  (select count(*) from information_schema.columns where table_name = 'visitas_detectadas' and column_name = 'actividad_id') as columna,
  (select count(*) from pg_proc where proname = 'sincronizar_compra_de_visita') as funcion;
