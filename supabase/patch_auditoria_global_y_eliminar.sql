-- ============================================================
-- Auditoría global de supervisores + permiso de eliminación
-- ============================================================
-- 1) Nueva tabla auditoria_global: registro permanente de las acciones
--    de los supervisores (programó/editó/eliminó servicio, eliminó
--    reporte, aprobó revisión, facturó, etc.). Es INDEPENDIENTE de
--    servicio_auditoria (que se borra en cascada junto con su servicio):
--    aquí el registro de "se eliminó X" sobrevive a la eliminación.
-- 2) Política de DELETE en reports para supervisores (no existía).
--    servicios_programados ya permite delete al supervisor por su
--    política "for all".
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

create table if not exists public.auditoria_global (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  accion text not null,
  entidad text not null check (entidad in ('servicio', 'reporte')),
  entidad_id uuid, -- sin FK a propósito: debe sobrevivir al borrado de la entidad
  detalle text,
  created_at timestamptz not null default now()
);

alter table public.auditoria_global enable row level security;

drop policy if exists auditoria_global_supervisor_select on public.auditoria_global;
create policy auditoria_global_supervisor_select on public.auditoria_global for select
  using (public.get_my_role() = 'supervisor');

drop policy if exists auditoria_global_supervisor_insert on public.auditoria_global;
create policy auditoria_global_supervisor_insert on public.auditoria_global for insert
  with check (public.get_my_role() = 'supervisor' and actor_id = auth.uid());

create index if not exists idx_auditoria_global_created on public.auditoria_global(created_at desc);

-- Los supervisores pueden eliminar reportes de servicio.
drop policy if exists reports_delete_supervisor on public.reports;
create policy reports_delete_supervisor on public.reports for delete
  using (public.get_my_role() = 'supervisor');
