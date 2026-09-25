-- ============================================================
-- Clientes: tipo de persona (física / moral) y dirección separada
-- ============================================================
-- 1. tipo_persona: 'fisica' (Juan González) o 'moral' (Print Pack). Decide
--    qué imagen predeterminada se muestra cuando el cliente no tiene logo.
--    Los clientes que ya existen quedan como 'moral' (empresa), que es lo
--    que eran hasta ahora.
-- 2. Dirección en campos separados: calle, número exterior/interior,
--    colonia, C.P., ciudad/municipio y estado.
--
-- La columna `direccion` (texto libre) NO se quita: la app la sigue
-- llenando sola, armada con los campos de arriba, para que la lista, el
-- buscador y lo demás que ya la usan sigan funcionando sin cambios. En los
-- clientes viejos conserva lo que se capturó a mano.
--
-- Todo es aditivo y nullable (salvo tipo_persona, que tiene default):
-- no afecta filas ni consultas existentes.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

alter table public.clientes
  add column if not exists tipo_persona text not null default 'moral',
  add column if not exists calle text,
  add column if not exists num_exterior text,
  add column if not exists num_interior text,
  add column if not exists colonia text,
  add column if not exists codigo_postal text,
  add column if not exists ciudad text,
  add column if not exists estado text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clientes_tipo_persona_check'
  ) then
    alter table public.clientes
      add constraint clientes_tipo_persona_check check (tipo_persona in ('fisica', 'moral'));
  end if;
end $$;
