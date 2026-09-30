-- ============================================================
-- Firma del cliente a distancia (enlace por WhatsApp)
-- ============================================================
-- Caso: el cliente no estaba cuando se terminó el servicio y no pudo
-- firmar. El técnico (o un supervisor) genera un enlace desde el detalle del
-- reporte y se lo manda por WhatsApp; el cliente lo abre SIN cuenta, ve el
-- resumen del servicio, escribe su nombre y firma. La firma queda en el
-- reporte como si hubiera firmado en sitio, marcada «a distancia».
--
-- El enlace lleva un UUID aleatorio guardado en
-- reports.data->'firmaRemota'->>'token'. Sirve una sola vez y vence a los 7
-- días. Igual que verificar_mantenimiento(), el acceso público pasa SOLO por
-- funciones security definer que reciben el token: no se abre ninguna
-- política de RLS sobre la tabla reports.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

create index if not exists idx_reports_firma_remota_token
  on public.reports ((data -> 'firmaRemota' ->> 'token'))
  where data ? 'firmaRemota';

-- ---------- 1) Crear (o reutilizar) el enlace ----------
-- Solo quien hizo el reporte o un supervisor, con la cuenta activa, y solo
-- si el cliente todavía no firmó. Si ya hay un enlace vigente se devuelve el
-- mismo: reenviarlo no invalida el que el cliente ya tenga en su WhatsApp.
create or replace function public.crear_enlace_firma(p_report_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r record;
  v_token text;
  v_vence timestamptz;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and activo = true) then
    raise exception 'Sin sesión activa';
  end if;

  select id, created_by, data into r from public.reports where id = p_report_id for update;
  if r.id is null then
    raise exception 'Reporte no encontrado';
  end if;
  if r.created_by is distinct from auth.uid() and public.get_my_role() is distinct from 'supervisor' then
    raise exception 'Solo quien hizo el reporte o un supervisor puede pedir la firma';
  end if;
  if coalesce(r.data ->> 'firmaClienteData', '') <> '' then
    raise exception 'El cliente ya firmó este reporte';
  end if;

  v_token := r.data -> 'firmaRemota' ->> 'token';
  v_vence := (r.data -> 'firmaRemota' ->> 'venceEn')::timestamptz;
  if v_token is null or v_vence is null or v_vence < now() + interval '1 day' then
    v_token := gen_random_uuid()::text;
    v_vence := now() + interval '7 days';
    update public.reports
    set data = jsonb_set(
      coalesce(data, '{}'::jsonb),
      '{firmaRemota}',
      jsonb_build_object(
        'token', v_token,
        'creadoEn', now(),
        'venceEn', v_vence,
        'creadoPor', auth.uid()
      )
    )
    where id = p_report_id;
  end if;

  return jsonb_build_object('token', v_token, 'venceEn', v_vence);
end;
$$;

revoke all on function public.crear_enlace_firma(uuid) from public;
grant execute on function public.crear_enlace_firma(uuid) to authenticated;

-- ---------- 2) Lo que ve el cliente al abrir el enlace ----------
-- Solo lo necesario para saber qué firma: cliente, fecha, folio, técnico,
-- tipo de servicio, actividades, observaciones, equipos y el resultado de
-- los formatos. Sin fotos, firmas internas, contactos ni horas.
create or replace function public.firma_remota_info(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  if p_token is null
     or p_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;

  select id, fecha, empresa_cliente, tipo_servicio, sub_tipo_servicio, data
    into r
  from public.reports
  where data -> 'firmaRemota' ->> 'token' = lower(p_token)
  limit 1;

  if r.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'estado', case
      when coalesce(r.data ->> 'firmaClienteData', '') <> '' then 'firmado'
      when (r.data -> 'firmaRemota' ->> 'venceEn')::timestamptz < now() then 'vencido'
      else 'pendiente'
    end,
    'folio', upper(left(r.id::text, 8)),
    'fecha', r.fecha,
    'cliente', r.empresa_cliente,
    'tipoServicio', concat_ws(' · ', r.tipo_servicio, r.sub_tipo_servicio),
    'tecnico', coalesce(nullif(r.data ->> 'ingACargo', ''), r.data ->> 'firmaIngNombre'),
    'actividades', coalesce((
      select jsonb_agg(a) from jsonb_array_elements_text(
        case when jsonb_typeof(r.data -> 'actividades') = 'array' then r.data -> 'actividades' else '[]'::jsonb end
      ) a where trim(a) <> ''), '[]'::jsonb),
    'observaciones', r.data ->> 'observaciones',
    'equipos', coalesce((
      select jsonb_agg(jsonb_build_object('cant', e ->> 'cant', 'desc', e ->> 'desc', 'marca', e ->> 'marca', 'modelo', e ->> 'modelo'))
      from jsonb_array_elements(
        case when jsonb_typeof(r.data -> 'equipos') = 'array' then r.data -> 'equipos' else '[]'::jsonb end
      ) e where coalesce(trim(e ->> 'desc'), '') <> ''), '[]'::jsonb),
    'formatos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'titulo', f ->> 'titulo',
        'total', jsonb_array_length(coalesce(f -> 'puntos', '[]'::jsonb)),
        'noCumple', (select count(*) from jsonb_array_elements(coalesce(f -> 'puntos', '[]'::jsonb)) p where p ->> 'resultado' = 'no_cumple')
      ))
      from jsonb_array_elements(coalesce(r.data -> 'formatosMtto', '[]'::jsonb)) f
    ), '[]'::jsonb),
    'recibio', r.data -> 'clienteAusente' ->> 'recibioNombre',
    'venceEn', r.data -> 'firmaRemota' ->> 'venceEn',
    'firmadoPor', case when coalesce(r.data ->> 'firmaClienteData', '') <> '' then r.data ->> 'firmaClienteNombre' end
  );
end;
$$;

revoke all on function public.firma_remota_info(text) from public;
grant execute on function public.firma_remota_info(text) to anon, authenticated;

-- ---------- 3) Guardar la firma ----------
-- Una sola vez: ya firmado, el mismo enlace solo muestra que se firmó. Valida que la firma sea un PNG
-- en dataURL de tamaño razonable y que haya nombre. Devuelve quién hizo el
-- reporte para que el servidor le avise.
create or replace function public.firma_remota_guardar(p_token text, p_nombre text, p_firma text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r record;
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_ahora timestamptz := now();
begin
  if p_token is null
     or p_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Enlace inválido';
  end if;
  if length(v_nombre) < 3 or length(v_nombre) > 120 then
    raise exception 'Escribe tu nombre completo';
  end if;
  if p_firma is null or p_firma not like 'data:image/png;base64,%' or length(p_firma) > 400000 then
    raise exception 'Firma inválida';
  end if;

  select id, created_by, empresa_cliente, data into r
  from public.reports
  where data -> 'firmaRemota' ->> 'token' = lower(p_token)
  limit 1
  for update;

  if r.id is null then
    raise exception 'Este enlace ya no es válido';
  end if;
  if coalesce(r.data ->> 'firmaClienteData', '') <> '' then
    raise exception 'Este reporte ya fue firmado';
  end if;
  if (r.data -> 'firmaRemota' ->> 'venceEn')::timestamptz < v_ahora then
    raise exception 'Este enlace ya venció; pide uno nuevo';
  end if;

  update public.reports
  set data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
    'firmaClienteData', p_firma,
    'firmaClienteNombre', v_nombre,
    'firmaClienteFecha', to_char(v_ahora at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI'),
    'firmaPendiente', false,
    -- El token se conserva para que el enlace, si se vuelve a abrir, muestre
    -- «ya firmado» en vez de «no encontrado»; ya no acepta otra firma.
    'firmaRemota', coalesce(data -> 'firmaRemota', '{}'::jsonb) || jsonb_build_object('firmadoEn', v_ahora)
  )
  where id = r.id;

  return jsonb_build_object(
    'reportId', r.id,
    'createdBy', r.created_by,
    'cliente', r.empresa_cliente,
    'folio', upper(left(r.id::text, 8))
  );
end;
$$;

revoke all on function public.firma_remota_guardar(text, text, text) from public;
grant execute on function public.firma_remota_guardar(text, text, text) to anon, authenticated;

-- Verificación: con un token inexistente la primera debe regresar NULL.
select public.firma_remota_info('00000000-0000-4000-8000-000000000000') as debe_ser_null;
