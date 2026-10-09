-- ============================================================
-- Color de acento por persona
-- ============================================================
-- Cada quien elige en «Mi perfil» el color de acento de la app (el de la
-- marca, verde, azul, morado o terracota). Se guarda en su perfil para que
-- lo siga al celular y a la computadora. Sin este parche la app funciona
-- igual, pero el color se queda solo en el dispositivo donde se eligió.
--
-- La fila ya la puede actualizar su dueño (política profiles_update_own);
-- solo hace falta la columna. Aditivo e idempotente.

alter table public.profiles
  add column if not exists color_acento text;

alter table public.profiles drop constraint if exists profiles_color_acento_check;
alter table public.profiles
  add constraint profiles_color_acento_check
  check (color_acento is null or color_acento in ('marca', 'bosque', 'oceano', 'ciruela', 'brasa'));

-- Verificación: debe devolver 1.
select count(*) as columna from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'color_acento';
