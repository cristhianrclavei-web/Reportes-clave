-- ============================================================
-- Administración de usuarios: que quede en Actividad
-- ============================================================
-- La pantalla Personal → Usuarios (alta, edición de rol y permisos, baja y
-- eliminación) funciona sin este patch. Lo único que agrega es permitir la
-- entidad «usuario» en la bitácora global, para que en Actividad quede
-- registrado quién dio de alta, editó o eliminó cada cuenta.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

alter table public.auditoria_global drop constraint if exists auditoria_global_entidad_check;
alter table public.auditoria_global add constraint auditoria_global_entidad_check
  check (entidad in ('servicio', 'reporte', 'proyecto', 'dia', 'usuario'));

-- Verificación: debe devolver true.
select pg_get_constraintdef(oid) like '%usuario%' as acepta_usuario
from pg_constraint where conname = 'auditoria_global_entidad_check';
