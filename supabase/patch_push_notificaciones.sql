-- ============================================================
-- Notificaciones push
-- ============================================================
-- Hasta ahora los avisos —una solicitud de herramienta, un día vencido, un
-- servicio recién asignado— solo se veían al entrar a la aplicación. Con push,
-- llegan al celular aunque esté cerrada.
--
-- Cada dispositivo genera su propia suscripción, así que una persona puede
-- tener varias (celular y computadora). El endpoint es único por dispositivo
-- y sirve de identificador.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

create table if not exists public.push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  -- Para saber desde dónde se suscribió al depurar.
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_usuario on public.push_suscripciones(usuario_id);

alter table public.push_suscripciones enable row level security;

-- Cada quien administra sus propias suscripciones.
drop policy if exists push_propias on public.push_suscripciones;
create policy push_propias on public.push_suscripciones for all
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- El servidor necesita leer las de todos para poder enviar. Se hace con una
-- función SECURITY DEFINER en lugar de abrir la tabla: así nadie puede
-- listar los dispositivos de sus compañeros desde el navegador.
create or replace function public.suscripciones_para_envio(p_usuarios uuid[])
returns table (usuario_id uuid, endpoint text, p256dh text, auth text)
language sql
security definer
set search_path = public
as $$
  select s.usuario_id, s.endpoint, s.p256dh, s.auth
  from public.push_suscripciones s
  where s.usuario_id = any(p_usuarios);
$$;

grant execute on function public.suscripciones_para_envio(uuid[]) to authenticated;

-- Quiénes deben recibir cada tipo de aviso.
create or replace function public.destinatarios_notificacion(p_tipo text)
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select p.id from public.profiles p
  where
    case p_tipo
      when 'supervisores' then p.role = 'supervisor'
      when 'almacen' then p.can_manage_almacen
      else false
    end;
$$;

grant execute on function public.destinatarios_notificacion(text) to authenticated;
