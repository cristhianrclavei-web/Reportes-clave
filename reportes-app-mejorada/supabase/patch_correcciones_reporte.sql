-- ============================================================
-- Correcciones de reportes autorizadas por un supervisor
-- ============================================================
-- Caso: el técnico vinculó su reporte al servicio equivocado, o le faltaron
-- fotos. El reporte ya está cerrado, así que no debe poder editarlo por su
-- cuenta. Flujo nuevo:
--   1. El técnico solicita la corrección explicando el motivo.
--   2. Un supervisor la habilita (queda registrado con su nombre en Eventos).
--   3. El técnico corrige SOLO dos cosas: agregar fotos y cambiar el
--      servicio programado vinculado.
--   4. Al guardar, el permiso se consume y el reporte vuelve a quedar fijo.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

-- 1) Estado de la corrección sobre el reporte.
-- OJO: correccion_por va SIN foreign key a profiles a propósito. Con dos
-- relaciones hacia profiles (created_by y correccion_por), PostgREST no sabe
-- cuál usar al pedir profiles(full_name) y falla por ambigüedad, devolviendo
-- cero reportes. El nombre de quien autoriza ya queda en auditoria_global.
alter table public.reports
  add column if not exists correccion_habilitada boolean not null default false,
  add column if not exists correccion_por uuid,
  add column if not exists correccion_en timestamptz,
  -- Solicitud pendiente del técnico: es lo que hace visible el aviso en el
  -- panel del supervisor (no basta con el evento en la bitácora, porque ahí
  -- se pierde entre el resto de la actividad del equipo).
  add column if not exists correccion_solicitada boolean not null default false,
  add column if not exists correccion_motivo text;

-- Si una versión anterior de este patch ya creó esa relación, se elimina.
alter table public.reports drop constraint if exists reports_correccion_por_fkey;

-- 2) Solo un supervisor puede OTORGAR el permiso. Se resuelve con un trigger
--    y no ampliando la política de UPDATE: una política que compare contra
--    el valor anterior necesitaría una subconsulta a public.reports dentro
--    de la regla de la propia tabla reports, que es justo lo que dispara el
--    "infinite recursion" de RLS. El trigger ve OLD y NEW directamente y no
--    pasa por RLS, así que no hay recursión posible.
create or replace function public.proteger_correccion_reporte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_my_role() is distinct from 'supervisor' then
    -- Un técnico nunca puede habilitarse la corrección a sí mismo...
    if new.correccion_habilitada and not old.correccion_habilitada then
      raise exception 'Solo un supervisor puede habilitar correcciones en un reporte';
    end if;
    -- ...ni alterar quién la autorizó ni cuándo.
    new.correccion_por := old.correccion_por;
    new.correccion_en := old.correccion_en;
  end if;
  return new;
end;
$$;

drop trigger if exists reports_proteger_correccion on public.reports;
create trigger reports_proteger_correccion
  before update on public.reports
  for each row execute function public.proteger_correccion_reporte();

-- 3) La bitácora de eventos solo aceptaba inserciones de supervisores. El
--    técnico ahora necesita registrar dos acciones propias: solicitar la
--    corrección y avisar que la aplicó. Ninguna otra.
drop policy if exists auditoria_global_supervisor_insert on public.auditoria_global;
drop policy if exists auditoria_global_insert on public.auditoria_global;
create policy auditoria_global_insert on public.auditoria_global for insert
  with check (
    actor_id = auth.uid()
    and (
      public.get_my_role() = 'supervisor'
      or accion in ('solicito_correccion', 'aplico_correccion')
    )
  );
