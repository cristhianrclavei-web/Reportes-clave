-- ============================================================
-- Solicitudes de personal: horas extra, vacaciones y permisos
-- ============================================================
-- El técnico (o cualquier usuario) llena la solicitud con su firma; quien
-- tiene el permiso «Autoriza solicitudes de personal» la autoriza con su
-- firma, la rechaza o pide una corrección (el solicitante la corrige y la
-- reenvía). Todo queda con historial y se puede bajar en PDF.
--
-- Incluye además un BLINDAJE de la tabla profiles: hasta hoy cualquier
-- usuario podía cambiarse a sí mismo el rol o los permisos llamando a la
-- base directo (la regla de «cada quien edita su perfil» no distinguía
-- columnas). Ahora solo quien administra usuarios puede cambiar rol,
-- permisos o estado de una cuenta.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

-- ---------- 0) Permiso nuevo + blindaje de profiles ----------
alter table public.profiles
  add column if not exists can_approve_personal boolean not null default false;

-- Arranca con quienes hoy firman reportes o cotizaciones.
update public.profiles set can_approve_personal = true
where (can_approve_review or can_approve_cotizacion) and not can_approve_personal;

create or replace function public.proteger_columnas_privilegio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SQL Editor / service role (sin usuario) y gestores de usuarios: libre.
  if auth.uid() is null or public.puede_gestionar_usuarios() then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.activo is distinct from old.activo
     or new.can_manage_usuarios is distinct from old.can_manage_usuarios
     or new.can_manage_almacen is distinct from old.can_manage_almacen
     or new.can_manage_billing is distinct from old.can_manage_billing
     or new.can_approve_review is distinct from old.can_approve_review
     or new.can_approve_cotizacion is distinct from old.can_approve_cotizacion
     or new.can_approve_personal is distinct from old.can_approve_personal then
    raise exception 'Solo quien administra usuarios puede cambiar rol, permisos o estado de una cuenta';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_columnas_privilegio on public.profiles;
create trigger trg_proteger_columnas_privilegio
  before update on public.profiles
  for each row execute function public.proteger_columnas_privilegio();

create or replace function public.puedo_aprobar_personal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.can_approve_personal and p.activo from public.profiles p where p.id = auth.uid()), false);
$$;
revoke all on function public.puedo_aprobar_personal() from public, anon;
grant execute on function public.puedo_aprobar_personal() to authenticated;

-- ---------- 1) Tabla ----------
create sequence if not exists public.solicitudes_he_folio_seq;
create sequence if not exists public.solicitudes_vp_folio_seq;

create table if not exists public.solicitudes_personal (
  id uuid primary key default gen_random_uuid(),
  folio text unique,
  tipo text not null check (tipo in ('horas_extra', 'vacaciones', 'permiso')),
  solicitante_id uuid not null references public.profiles(id) default auth.uid(),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'correccion', 'aprobada', 'rechazada', 'cancelada')),

  -- Horas extra
  fecha date,
  hora_inicio time,
  hora_fin time,
  horas numeric(5, 2),
  actividades text,
  cliente_id uuid,
  cliente_nombre text,
  servicio_id uuid references public.servicios_programados(id) on delete set null,
  proyecto text,
  corte_pago date,

  -- Vacaciones / permiso
  fecha_inicio date,
  fecha_fin date,
  dias numeric(5, 1),
  medio_dia boolean not null default false,
  goce_sueldo boolean,
  motivo_tipo text,
  motivo text,
  cubre_nombre text,
  fecha_regreso date,

  -- Comunes
  fotos text[] not null default '{}',
  nota text,
  firma_solicitante text not null,
  revisado_por uuid references public.profiles(id),
  revisado_nombre text,
  revisado_en timestamptz,
  firma_autoriza text,
  comentario_revision text,
  historial jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint solicitud_horas_completa check (
    tipo <> 'horas_extra' or (fecha is not null and hora_inicio is not null and hora_fin is not null and coalesce(horas, 0) > 0 and length(trim(coalesce(actividades, ''))) > 0)
  ),
  constraint solicitud_dias_completa check (
    tipo = 'horas_extra' or (fecha_inicio is not null and fecha_fin is not null and fecha_fin >= fecha_inicio and coalesce(dias, 0) > 0)
  )
);
create index if not exists idx_solicitudes_solicitante on public.solicitudes_personal (solicitante_id, created_at desc);
create index if not exists idx_solicitudes_estado on public.solicitudes_personal (estado);

-- Folio por tipo (HE-0001 / VP-0001) y horas calculadas en la base: si la
-- hora de fin es menor o igual a la de inicio, cruzó la medianoche.
create or replace function public.preparar_solicitud_personal()
returns trigger
language plpgsql
as $$
declare v_min integer;
begin
  if tg_op = 'INSERT' and new.folio is null then
    new.folio := case when new.tipo = 'horas_extra'
      then 'HE-' || lpad(nextval('public.solicitudes_he_folio_seq')::text, 4, '0')
      else 'VP-' || lpad(nextval('public.solicitudes_vp_folio_seq')::text, 4, '0') end;
  end if;
  if new.tipo = 'horas_extra' and new.hora_inicio is not null and new.hora_fin is not null then
    v_min := (extract(epoch from (new.hora_fin - new.hora_inicio)) / 60)::integer;
    if v_min <= 0 then v_min := v_min + 24 * 60; end if;
    new.horas := round(v_min / 60.0, 2);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_preparar_solicitud_personal on public.solicitudes_personal;
create trigger trg_preparar_solicitud_personal
  before insert or update on public.solicitudes_personal
  for each row execute function public.preparar_solicitud_personal();

-- ---------- 2) Permisos de la tabla ----------
alter table public.solicitudes_personal enable row level security;

drop policy if exists solicitudes_lectura on public.solicitudes_personal;
create policy solicitudes_lectura on public.solicitudes_personal for select to authenticated
  using ((solicitante_id = auth.uid() and public.mi_cuenta_activa()) or public.puedo_aprobar_personal());

-- Crear: solo la propia, nueva y sin datos de autorización.
drop policy if exists solicitudes_crear on public.solicitudes_personal;
create policy solicitudes_crear on public.solicitudes_personal for insert to authenticated
  with check (
    solicitante_id = auth.uid() and public.mi_cuenta_activa()
    and estado = 'pendiente' and revisado_por is null and firma_autoriza is null
  );
-- Sin update/delete directos: todo cambio pasa por las funciones de abajo.

-- ---------- 3) Funciones ----------
-- El solicitante corrige (estando pendiente o con corrección pedida) y reenvía.
create or replace function public.actualizar_solicitud_personal(p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s record;
begin
  select * into s from public.solicitudes_personal where id = p_id for update;
  if s.id is null or s.solicitante_id <> auth.uid() or not public.mi_cuenta_activa() then
    raise exception 'Esta solicitud no es tuya';
  end if;
  if s.estado not in ('pendiente', 'correccion') then raise exception 'Ya no se puede modificar'; end if;

  update public.solicitudes_personal set
    fecha = coalesce((p->>'fecha')::date, fecha),
    hora_inicio = coalesce((p->>'hora_inicio')::time, hora_inicio),
    hora_fin = coalesce((p->>'hora_fin')::time, hora_fin),
    actividades = coalesce(p->>'actividades', actividades),
    cliente_id = case when p ? 'cliente_id' then nullif(p->>'cliente_id', '')::uuid else cliente_id end,
    cliente_nombre = case when p ? 'cliente_nombre' then nullif(trim(p->>'cliente_nombre'), '') else cliente_nombre end,
    servicio_id = case when p ? 'servicio_id' then nullif(p->>'servicio_id', '')::uuid else servicio_id end,
    proyecto = case when p ? 'proyecto' then nullif(trim(p->>'proyecto'), '') else proyecto end,
    corte_pago = coalesce((p->>'corte_pago')::date, corte_pago),
    fecha_inicio = coalesce((p->>'fecha_inicio')::date, fecha_inicio),
    fecha_fin = coalesce((p->>'fecha_fin')::date, fecha_fin),
    dias = coalesce((p->>'dias')::numeric, dias),
    medio_dia = coalesce((p->>'medio_dia')::boolean, medio_dia),
    goce_sueldo = case when p ? 'goce_sueldo' then (p->>'goce_sueldo')::boolean else goce_sueldo end,
    motivo_tipo = case when p ? 'motivo_tipo' then nullif(p->>'motivo_tipo', '') else motivo_tipo end,
    motivo = case when p ? 'motivo' then nullif(trim(p->>'motivo'), '') else motivo end,
    cubre_nombre = case when p ? 'cubre_nombre' then nullif(trim(p->>'cubre_nombre'), '') else cubre_nombre end,
    fecha_regreso = case when p ? 'fecha_regreso' then nullif(p->>'fecha_regreso', '')::date else fecha_regreso end,
    fotos = case when p ? 'fotos' then array(select jsonb_array_elements_text(p->'fotos')) else fotos end,
    nota = case when p ? 'nota' then nullif(trim(p->>'nota'), '') else nota end,
    firma_solicitante = coalesce(nullif(p->>'firma_solicitante', ''), firma_solicitante),
    estado = 'pendiente',
    historial = historial || jsonb_build_object('en', now(), 'por', auth.uid(), 'accion', case when s.estado = 'correccion' then 'corregida' else 'editada' end)
  where id = p_id;
end;
$$;

create or replace function public.cancelar_solicitud_personal(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s record;
begin
  select * into s from public.solicitudes_personal where id = p_id for update;
  if s.id is null or s.solicitante_id <> auth.uid() then raise exception 'Esta solicitud no es tuya'; end if;
  if s.estado not in ('pendiente', 'correccion') then raise exception 'Ya no se puede cancelar'; end if;
  update public.solicitudes_personal
  set estado = 'cancelada', historial = historial || jsonb_build_object('en', now(), 'por', auth.uid(), 'accion', 'cancelada')
  where id = p_id;
end;
$$;

-- Autorizar (con firma), rechazar o pedir corrección (con comentario).
create or replace function public.resolver_solicitud_personal(p_id uuid, p_accion text, p_comentario text, p_firma text, p_nombre text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  v_com text := nullif(trim(coalesce(p_comentario, '')), '');
begin
  if not public.puedo_aprobar_personal() or not public.mi_cuenta_activa() then
    raise exception 'No tienes permiso para autorizar solicitudes';
  end if;
  select * into s from public.solicitudes_personal where id = p_id for update;
  if s.id is null then raise exception 'No existe'; end if;
  if s.solicitante_id = auth.uid() then raise exception 'No puedes autorizar tu propia solicitud'; end if;
  if s.estado <> 'pendiente' then raise exception 'Esta solicitud no está pendiente'; end if;

  if p_accion = 'aprobar' then
    if coalesce(length(p_firma), 0) < 50 then raise exception 'Firma para autorizar'; end if;
    update public.solicitudes_personal set
      estado = 'aprobada', revisado_por = auth.uid(), revisado_en = now(),
      revisado_nombre = coalesce(nullif(trim(p_nombre), ''), (select full_name from public.profiles where id = auth.uid())),
      firma_autoriza = p_firma, comentario_revision = v_com,
      historial = historial || jsonb_build_object('en', now(), 'por', auth.uid(), 'accion', 'aprobada', 'comentario', v_com)
    where id = p_id;
  elsif p_accion in ('rechazar', 'correccion') then
    if v_com is null then raise exception 'Escribe el motivo'; end if;
    update public.solicitudes_personal set
      estado = case when p_accion = 'rechazar' then 'rechazada' else 'correccion' end,
      revisado_por = auth.uid(), revisado_en = now(),
      revisado_nombre = (select full_name from public.profiles where id = auth.uid()),
      comentario_revision = v_com,
      historial = historial || jsonb_build_object('en', now(), 'por', auth.uid(), 'accion', case when p_accion = 'rechazar' then 'rechazada' else 'correccion' end, 'comentario', v_com)
    where id = p_id;
  else
    raise exception 'Acción no válida';
  end if;
end;
$$;

revoke all on function public.actualizar_solicitud_personal(uuid, jsonb) from public, anon;
grant execute on function public.actualizar_solicitud_personal(uuid, jsonb) to authenticated;
revoke all on function public.cancelar_solicitud_personal(uuid) from public, anon;
grant execute on function public.cancelar_solicitud_personal(uuid) to authenticated;
revoke all on function public.resolver_solicitud_personal(uuid, text, text, text, text) from public, anon;
grant execute on function public.resolver_solicitud_personal(uuid, text, text, text, text) to authenticated;

-- ---------- 4) Evidencias (bucket privado) ----------
insert into storage.buckets (id, name, public)
values ('solicitudes', 'solicitudes', false)
on conflict (id) do nothing;

drop policy if exists solicitudes_subir on storage.objects;
create policy solicitudes_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'solicitudes' and (storage.foldername(name))[1] = auth.uid()::text and public.mi_cuenta_activa());
drop policy if exists solicitudes_ver on storage.objects;
create policy solicitudes_ver on storage.objects for select to authenticated
  using (bucket_id = 'solicitudes' and ((storage.foldername(name))[1] = auth.uid()::text or public.puedo_aprobar_personal()));
drop policy if exists solicitudes_borrar on storage.objects;
create policy solicitudes_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'solicitudes' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 5) Avisos: destino «personal» (quien autoriza) ----------
create or replace function public.destinatarios_notificacion_tipo(p_destino text, p_tipo text)
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  left join public.push_preferencias pref
    on pref.usuario_id = p.id and pref.tipo = p_tipo
  where
    (case p_destino
      when 'supervisores' then p.role = 'supervisor'
      when 'almacen' then p.can_manage_almacen
      when 'personal' then p.can_approve_personal
      else false
    end)
    and coalesce(p.activo, true)
    and coalesce(pref.activo, not public.tipo_apagado_por_defecto(p_tipo));
$$;
grant execute on function public.destinatarios_notificacion_tipo(text, text) to authenticated;

-- Verificación: deben salir 4 en true.
select
  to_regclass('public.solicitudes_personal') is not null as tabla,
  exists (select 1 from pg_trigger where tgname = 'trg_proteger_columnas_privilegio') as blindaje_perfiles,
  exists (select 1 from storage.buckets where id = 'solicitudes') as bucket,
  (select count(*) from public.profiles where can_approve_personal) > 0 as hay_quien_autorice;
