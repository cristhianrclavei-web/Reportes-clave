-- ============================================================
-- Clientes vinculados a los reportes (fase 1)
-- ============================================================
-- Hasta ahora el reporte guardaba el cliente solo como texto libre
-- (reports.empresa_cliente), así que el mismo cliente aparecía escrito de
-- varias formas y la sección Clientes no se enteraba.
--
-- 1) clientes.nombre_norm: nombre sin acentos ni mayúsculas (para comparar).
--    clientes.pendiente_revision: creado solo desde un reporte, falta que un
--    supervisor lo revise.
-- 2) cliente_alias: otras formas de escribir al mismo cliente («Plaza del
--    Ángel» → «Centro de Negocios del Ángel»). Se van sumando solas cuando
--    alguien escribe distinto y elige al cliente correcto.
-- 3) reports.cliente_id: vínculo real con el cliente.
-- 4) Disparador en reports: al guardar, busca al cliente por nombre o alias
--    (sin acentos ni mayúsculas) y lo vincula; si no existe, lo crea como
--    «Por revisar». Funciona igual con o sin conexión porque corre en la base.
-- 5) catalogo_clientes(): lista de nombres + alias para el autocompletado
--    (técnicos y supervisores; solo nombres, sin contacto ni proyectos).
-- 6) agregar_alias_cliente(): guarda una forma alterna de escribir al cliente.
-- 7) Vincula los reportes que ya existen cuyo nombre coincide exacto con un
--    cliente (sin crear clientes nuevos: los parecidos se limpian en fase 2).
--
-- Usa public.normalizar_nombre(), creada en patch_cobertura_reportes.sql.
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

-- ---------- 1) Columnas en clientes ----------
alter table public.clientes
  add column if not exists pendiente_revision boolean not null default false;

alter table public.clientes
  add column if not exists nombre_norm text generated always as (public.normalizar_nombre(nombre)) stored;

create index if not exists idx_clientes_nombre_norm on public.clientes(nombre_norm);

-- ---------- 2) Alias ----------
create table if not exists public.cliente_alias (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  alias text not null check (length(trim(alias)) > 0),
  alias_norm text generated always as (public.normalizar_nombre(alias)) stored,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create unique index if not exists uq_cliente_alias_norm on public.cliente_alias(alias_norm);
create index if not exists idx_cliente_alias_cliente on public.cliente_alias(cliente_id);

alter table public.cliente_alias enable row level security;

drop policy if exists cliente_alias_supervisor_all on public.cliente_alias;
create policy cliente_alias_supervisor_all on public.cliente_alias for all
  using (public.get_my_role() = 'supervisor') with check (public.get_my_role() = 'supervisor');

-- ---------- 3) Vínculo en reports ----------
alter table public.reports
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null;

create index if not exists idx_reports_cliente on public.reports(cliente_id);

-- ---------- 4) Disparador: vincular o crear cliente al guardar ----------
create or replace function public.vincular_cliente_reporte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text;
  v_id uuid;
begin
  if tg_op = 'UPDATE' then
    -- Solo si cambió el nombre del cliente; si además no cambió el vínculo,
    -- se vuelve a resolver con el nombre nuevo.
    if new.empresa_cliente is not distinct from old.empresa_cliente then
      return new;
    end if;
    if new.cliente_id is not distinct from old.cliente_id then
      new.cliente_id := null;
    end if;
  end if;

  if new.cliente_id is not null then
    return new;
  end if;

  v_norm := public.normalizar_nombre(new.empresa_cliente);
  if v_norm = '' then
    return new;
  end if;

  select id into v_id from public.clientes where nombre_norm = v_norm order by created_at limit 1;
  if v_id is null then
    select cliente_id into v_id from public.cliente_alias where alias_norm = v_norm limit 1;
  end if;
  if v_id is null then
    insert into public.clientes (nombre, created_by, pendiente_revision)
    values (trim(new.empresa_cliente), new.created_by, true)
    returning id into v_id;
  end if;

  new.cliente_id := v_id;
  return new;
end;
$$;

drop trigger if exists trg_vincular_cliente_reporte on public.reports;
create trigger trg_vincular_cliente_reporte
  before insert or update of empresa_cliente on public.reports
  for each row execute function public.vincular_cliente_reporte();

-- ---------- 5) Catálogo para el autocompletado ----------
create or replace function public.catalogo_clientes()
returns table (id uuid, nombre text, alias text[])
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.nombre,
         coalesce(array_agg(a.alias order by a.alias) filter (where a.alias is not null), '{}')
  from public.clientes c
  left join public.cliente_alias a on a.cliente_id = c.id
  where auth.uid() is not null
  group by c.id, c.nombre
  order by c.nombre;
$$;

revoke all on function public.catalogo_clientes() from public, anon;
grant execute on function public.catalogo_clientes() to authenticated;

-- ---------- 6) Guardar una forma alterna ----------
create or replace function public.agregar_alias_cliente(p_cliente uuid, p_alias text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text := public.normalizar_nombre(p_alias);
begin
  if auth.uid() is null or v_norm = '' then
    return;
  end if;
  -- Si ya es el nombre de algún cliente, no hace falta alias.
  if exists (select 1 from public.clientes where nombre_norm = v_norm) then
    return;
  end if;
  insert into public.cliente_alias (cliente_id, alias, created_by)
  values (p_cliente, trim(p_alias), auth.uid())
  on conflict (alias_norm) do nothing;
end;
$$;

revoke all on function public.agregar_alias_cliente(uuid, text) from public, anon;
grant execute on function public.agregar_alias_cliente(uuid, text) to authenticated;

-- ---------- 7) Vincular los reportes existentes que coinciden exacto ----------
update public.reports r
set cliente_id = c.id
from public.clientes c
where r.cliente_id is null
  and c.nombre_norm = public.normalizar_nombre(r.empresa_cliente);

-- Verificación: clientes, reportes vinculados y sin vincular.
select
  (select count(*) from public.clientes) as clientes,
  (select count(*) from public.reports where cliente_id is not null) as reportes_vinculados,
  (select count(*) from public.reports where cliente_id is null) as reportes_sin_vincular;
