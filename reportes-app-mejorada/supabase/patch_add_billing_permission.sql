-- Permiso para poder marcar un servicio como "finalizado" desde el dashboard
-- (no solo el técnico desde el formulario) y para poder usar los botones de
-- facturación (subir factura en PDF / marcar "no se puede facturar").
--
-- Solo debe estar en TRUE para: Ing. Everardo Sánchez Díaz,
-- Lic. María Clara Zepeda, y Lic. Julio Gómez.

alter table public.profiles
  add column if not exists can_manage_billing boolean not null default false;

-- Reemplaza los correos de abajo por los correos reales con los que cada
-- quien inicia sesión, y corre el UPDATE correspondiente:

-- update public.profiles
-- set can_manage_billing = true
-- where id = (select id from auth.users where email = 'everardo.sanchez@clave-i.com');

-- update public.profiles
-- set can_manage_billing = true
-- where id = (select id from auth.users where email = 'CORREO_DE_MARIA_CLARA_AQUI');

-- update public.profiles
-- set can_manage_billing = true
-- where id = (select id from auth.users where email = 'CORREO_DE_JULIO_AQUI');
