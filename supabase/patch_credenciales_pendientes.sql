-- ============================================================
-- Aviso obligatorio: actualizar credenciales
-- ============================================================
-- Varias cuentas (técnicos y supervisores) siguen con la contraseña
-- genérica con la que se dieron de alta — es distinto del aviso de "cuenta
-- de prueba" (es_cuenta_prueba), que solo pide nombre y teléfono y deja el
-- correo/contraseña como opcional. Este es un segundo aviso, independiente,
-- que sí exige cambiar la contraseña y no se puede posponer.
--
-- default false: aplica retroactivamente a TODAS las cuentas que ya
-- existen, sin importar si ya pasaron por el aviso de cuenta de prueba.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

alter table public.profiles
  add column if not exists credenciales_actualizadas boolean not null default false;
