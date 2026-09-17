-- Agrega el permiso de firma de cotización (separado de can_approve_review,
-- que ya existía y ahora se usa exclusivamente para la firma de reporte).
-- Ambos permisos ahora se administran desde Perfil → Usuarios, junto con
-- Almacén y Facturación (antes can_approve_review solo se activaba a mano).

alter table public.profiles
  add column if not exists can_approve_cotizacion boolean not null default false;

-- Everardo Sánchez se queda como firmante de reportes (can_approve_review,
-- ya activado en patch_add_review_permission.sql). Clara Zepeda queda como
-- firmante de cotizaciones:
update public.profiles
set can_approve_cotizacion = true
where id = (select id from auth.users where email = 'clara.zepeda@clave-i.com');

-- Por si el patch original de can_approve_review nunca se corrió para
-- Everardo, esto lo deja en true sin afectar a nadie más:
update public.profiles
set can_approve_review = true
where id = (select id from auth.users where email = 'everardo.sanchez@clave-i.com');
