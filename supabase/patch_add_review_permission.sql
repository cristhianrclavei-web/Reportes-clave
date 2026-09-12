-- Agrega el permiso especial para firmar/aprobar reportes como revisor final.
-- Solo la cuenta del Ing. Everardo Sánchez debe tener esto en TRUE.
-- No se crea un rol nuevo: sigue siendo "supervisor", pero con este permiso extra.

alter table public.profiles
  add column if not exists can_approve_review boolean not null default false;

-- Después de correr esto, activa el permiso para la cuenta de Everardo
-- reemplazando el correo de abajo por el correo real con el que él inicia sesión:
--
-- update public.profiles
-- set can_approve_review = true
-- where id = (select id from auth.users where email = 'everardo@clave-i.mx');
