-- ============================================================
-- Elimina la vista que exponía correos de auth.users por la API
-- ============================================================
-- public.auditoria_descargas_resumen (creada en
-- SUPABASE_PATCHES_SECURITY.sql) unía auditoria_descargas con
-- auth.users para traer el email de cada usuario. Al ser una vista en
-- el esquema public, Supabase la expone por la API (PostgREST) y las
-- vistas corren con los permisos de quien las creó, no de quien
-- consulta — así que el RLS de auditoria_descargas (solo supervisores)
-- no aplicaba a la vista. Cualquiera con acceso a la API podía leer el
-- correo de todos los usuarios.
--
-- No se usa en ningún lado del código de la app (confirmado por
-- búsqueda en app/ y lib/), así que se elimina en vez de asegurarla.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

drop view if exists public.auditoria_descargas_resumen;

-- Verificación: debe devolver 0 filas.
-- select * from information_schema.views
-- where table_schema = 'public' and table_name = 'auditoria_descargas_resumen';
