-- ============================================================
-- Preferencias de notificación por tipo
-- ============================================================
-- Notificar todo suena a mejor control, pero en la práctica lleva a que la
-- gente silencie la app y se pierdan justo los avisos que exigen acción. Con
-- preferencias, cada quien decide qué le llega.
--
-- Los tipos que exigen una decisión vienen encendidos; los de seguimiento del
-- día (llegada, inicio) vienen apagados, porque esa información ya está en
-- vivo en el panel del supervisor.
--
-- Ejecutar después de patch_push_notificaciones.sql. Idempotente.

create table if not exists public.push_preferencias (
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null,
  activo boolean not null default true,
  primary key (usuario_id, tipo)
);

alter table public.push_preferencias enable row level security;

drop policy if exists preferencias_propias on public.push_preferencias;
create policy preferencias_propias on public.push_preferencias for all
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- Tipos apagados de fábrica: seguimiento del día. Si no hay fila para un
-- tipo, se considera encendido, así que solo se registran las excepciones.
create or replace function public.tipo_apagado_por_defecto(p_tipo text)
returns boolean
language sql
immutable
as $$
  select p_tipo in ('llegada_servicio', 'inicio_servicio', 'bitacora_inicio', 'bitacora_fin');
$$;

-- Destinatarios que además aceptan ese tipo de aviso.
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
      else false
    end)
    and coalesce(pref.activo, not public.tipo_apagado_por_defecto(p_tipo));
$$;

grant execute on function public.destinatarios_notificacion_tipo(text, text) to authenticated;

-- Para filtrar una lista concreta de usuarios (por ejemplo los técnicos
-- asignados a un servicio) por su preferencia.
create or replace function public.filtrar_por_preferencia(p_usuarios uuid[], p_tipo text)
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select u
  from unnest(p_usuarios) as u
  left join public.push_preferencias pref
    on pref.usuario_id = u and pref.tipo = p_tipo
  where coalesce(pref.activo, not public.tipo_apagado_por_defecto(p_tipo));
$$;

grant execute on function public.filtrar_por_preferencia(uuid[], text) to authenticated;
