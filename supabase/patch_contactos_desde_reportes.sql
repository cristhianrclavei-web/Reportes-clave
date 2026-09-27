-- ============================================================
-- Contactos del cliente desde los reportes
-- ============================================================
-- 1) catalogo_clientes() ahora también devuelve los contactos de cada
--    cliente (solo nombre y puesto, sin teléfono ni correo) para sugerirlos
--    en «Contacto/Usuario» del reporte.
-- 2) Al guardar un reporte con cliente vinculado y un contacto escrito, ese
--    contacto se agrega solo a los contactos del cliente (si no existía; si
--    existía sin puesto y el reporte trae puesto, se completa).
--
-- Requiere patch_clientes_vinculo_reportes.sql. Ejecutar completo en el SQL
-- Editor de Supabase. Idempotente.

-- ---------- 1) Catálogo con contactos ----------
-- Cambia el tipo de resultado, así que hay que borrarla antes de crearla.
drop function if exists public.catalogo_clientes();

create function public.catalogo_clientes()
returns table (id uuid, nombre text, alias text[], contactos jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.nombre,
         coalesce((select array_agg(a.alias order by a.alias) from public.cliente_alias a where a.cliente_id = c.id), '{}'),
         coalesce((select jsonb_agg(jsonb_build_object('nombre', k.nombre, 'puesto', k.puesto) order by k.nombre)
                   from public.cliente_contactos k where k.cliente_id = c.id), '[]'::jsonb)
  from public.clientes c
  where auth.uid() is not null
  order by c.nombre;
$$;

revoke all on function public.catalogo_clientes() from public, anon;
grant execute on function public.catalogo_clientes() to authenticated;

-- ---------- 2) Registrar el contacto del reporte ----------
create or replace function public.registrar_contacto_reporte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := trim(coalesce(new.data->>'contactoUsuario', ''));
  v_puesto text := nullif(trim(coalesce(new.data->>'puestoArea', '')), '');
  v_id uuid;
begin
  if new.cliente_id is null or v_nombre = '' then
    return new;
  end if;

  select id into v_id from public.cliente_contactos
  where cliente_id = new.cliente_id
    and public.normalizar_nombre(nombre) = public.normalizar_nombre(v_nombre)
  limit 1;

  if v_id is null then
    insert into public.cliente_contactos (cliente_id, nombre, puesto)
    values (new.cliente_id, v_nombre, v_puesto);
  elsif v_puesto is not null then
    update public.cliente_contactos
    set puesto = v_puesto
    where id = v_id and (puesto is null or trim(puesto) = '');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_registrar_contacto_reporte on public.reports;
create trigger trg_registrar_contacto_reporte
  after insert or update of data, cliente_id on public.reports
  for each row execute function public.registrar_contacto_reporte();

-- Verificación (en el SQL Editor no hay sesión, así que se consulta directo):
-- cada cliente con cuántos contactos tiene.
select c.nombre, count(k.id) as contactos
from public.clientes c
left join public.cliente_contactos k on k.cliente_id = c.id
group by c.nombre
order by c.nombre;
