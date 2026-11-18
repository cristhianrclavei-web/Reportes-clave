-- Aprobar una cotización a distancia, por enlace de WhatsApp.
--
-- Quien arma la cotización (Braulio) pide la aprobación a una persona con
-- permiso «Aprobar cotizaciones» (Everardo, Clara). La app genera un enlace
-- /aprobar/<token> SOLO para esa persona; al abrirlo ve el PDF con el formato
-- de siempre y firma para aprobar, o pide cambios con un comentario. No pide
-- iniciar sesión (como la firma del cliente a distancia):
--   · el enlace es de un aprobador: la firma queda a su nombre;
--   · vence en 7 días y sirve una sola vez;
--   · si la cotización se edita después de pedirla, el enlace ya no sirve
--     (se aprobaría algo distinto a lo que vio): hay que pedirla de nuevo.
--
-- Idempotente.

create table if not exists public.cotizacion_aprobaciones (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references public.cotizaciones(id) on delete cascade,
  aprobador_id uuid not null references public.profiles(id),
  token uuid not null unique default gen_random_uuid(),
  pedido_por uuid not null references public.profiles(id),
  pedido_en timestamptz not null default now(),
  vence_en timestamptz not null default now() + interval '7 days',
  -- Versión de la cotización que se mandó a revisar (su updated_at).
  version timestamptz,
  respondido_en timestamptz,
  resultado text check (resultado in ('aprobada', 'cambios')),
  comentario text check (char_length(comentario) <= 600)
);

create index if not exists idx_cotizacion_aprobaciones_cot on public.cotizacion_aprobaciones(cotizacion_id);

alter table public.cotizacion_aprobaciones enable row level security;

drop policy if exists cotizacion_aprobaciones_select on public.cotizacion_aprobaciones;
create policy cotizacion_aprobaciones_select on public.cotizacion_aprobaciones for select
  using (public.get_my_role() = 'supervisor' and public.mi_cuenta_activa());
-- Nadie escribe directo: solo las funciones de abajo.

-- ---------- Pedir la aprobación (supervisión, con sesión) ----------
create or replace function public.pedir_aprobacion_cotizacion(p_cotizacion uuid, p_aprobador uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v_nombre text;
  s record;
begin
  if public.get_my_role() is distinct from 'supervisor' or not public.mi_cuenta_activa() then
    raise exception 'Solo supervisión puede pedir la aprobación de una cotización.';
  end if;
  select full_name into v_nombre from public.profiles
   where id = p_aprobador and activo and can_approve_cotizacion;
  if v_nombre is null then
    raise exception 'Esa persona no tiene permiso para aprobar cotizaciones.';
  end if;
  select id, estado, aprobada_firma, updated_at into c from public.cotizaciones where id = p_cotizacion;
  if c.id is null then
    raise exception 'No existe esa cotización.';
  end if;
  if coalesce(c.aprobada_firma, '') <> '' then
    raise exception 'Esta cotización ya está aprobada.';
  end if;

  -- Si ya hay un enlace vigente para la misma persona y la misma versión, se reusa.
  select * into s from public.cotizacion_aprobaciones
   where cotizacion_id = p_cotizacion and aprobador_id = p_aprobador
     and respondido_en is null and vence_en > now() + interval '1 day'
     and version is not distinct from c.updated_at
   order by pedido_en desc limit 1;
  if s.id is null then
    insert into public.cotizacion_aprobaciones (cotizacion_id, aprobador_id, pedido_por, version)
    values (p_cotizacion, p_aprobador, auth.uid(), c.updated_at)
    returning * into s;
  end if;

  return jsonb_build_object('token', s.token, 'venceEn', s.vence_en, 'aprobador', v_nombre);
end;
$$;

revoke all on function public.pedir_aprobacion_cotizacion(uuid, uuid) from public, anon;
grant execute on function public.pedir_aprobacion_cotizacion(uuid, uuid) to authenticated;

-- ---------- Lo que ve quien abre el enlace (sin sesión) ----------
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

revoke all on function public.aprobacion_remota_info(text) from public;
grant execute on function public.aprobacion_remota_info(text) to anon, authenticated;

-- ---------- Responder: aprobar con firma o pedir cambios (sin sesión) ----------
-- Los «raise exception» (código P0001) están escritos para quien aprueba.
create or replace function public.aprobacion_remota_responder(p_token text, p_aprobar boolean, p_firma text, p_comentario text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  c record;
  v_nombre text;
  v_comentario text := nullif(trim(coalesce(p_comentario, '')), '');
begin
  if p_token is null or p_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'El enlace no es válido.';
  end if;
  select * into s from public.cotizacion_aprobaciones where token = lower(p_token)::uuid for update;
  if s.id is null then
    raise exception 'El enlace no es válido.';
  end if;
  if s.respondido_en is not null then
    raise exception 'Este enlace ya se usó.';
  end if;
  if s.vence_en < now() then
    raise exception 'El enlace venció. Pide uno nuevo.';
  end if;
  select id, folio, empresa, aprobada_firma, updated_at into c from public.cotizaciones where id = s.cotizacion_id for update;
  if coalesce(c.aprobada_firma, '') <> '' then
    raise exception 'La cotización ya fue aprobada por alguien más.';
  end if;
  if c.updated_at is distinct from s.version then
    raise exception 'La cotización cambió después de que te la mandaron. Pide que te envíen el enlace otra vez.';
  end if;
  if v_comentario is not null and char_length(v_comentario) > 600 then
    raise exception 'El comentario es muy largo (máximo 600 letras).';
  end if;

  select full_name into v_nombre from public.profiles where id = s.aprobador_id and activo and can_approve_cotizacion;
  if v_nombre is null then
    raise exception 'Ya no tienes permiso para aprobar cotizaciones.';
  end if;

  if p_aprobar then
    if p_firma is null or p_firma !~ '^data:image/png;base64,' or char_length(p_firma) > 400000 then
      raise exception 'Falta la firma.';
    end if;
    update public.cotizaciones
       set estado = 'aprobada', aprobada_por = v_nombre, aprobada_firma = p_firma, aprobada_en = now(), updated_at = now()
     where id = c.id;
  else
    if v_comentario is null or char_length(v_comentario) < 3 then
      raise exception 'Escribe qué hay que cambiar.';
    end if;
  end if;

  update public.cotizacion_aprobaciones
     set respondido_en = now(), resultado = case when p_aprobar then 'aprobada' else 'cambios' end, comentario = v_comentario
   where id = s.id;

  return jsonb_build_object('cotizacionId', c.id, 'folio', c.folio, 'empresa', c.empresa, 'aprobador', v_nombre,
                            'pedidoPor', s.pedido_por, 'aprobada', p_aprobar, 'comentario', v_comentario);
end;
$$;

revoke all on function public.aprobacion_remota_responder(text, boolean, text, text) from public;
grant execute on function public.aprobacion_remota_responder(text, boolean, text, text) to anon, authenticated;

-- Comprobar: select * from public.cotizacion_aprobaciones order by pedido_en desc limit 5;
