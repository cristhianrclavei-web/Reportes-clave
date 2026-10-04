-- ============================================================
-- Plan de la empresa: paquete, extras y límite de usuarios
-- ============================================================
-- Base para vender la app por paquetes (ver «Plan comercial»):
--
--   campo        reportes, servicios/agenda, ubicación, clientes
--   profesional  campo + cotizaciones + almacén + formatos de mantenimiento + cuadrillas
--   empresa      todo: + facturación + asistente IA
--
-- Una sola fila (esta instalación = una empresa). «extras» agrega módulos
-- sueltos a cualquier paquete; limite_usuarios NULL = sin límite.
--
-- La app oculta las secciones que el plan no incluye y la base impide
-- activar más usuarios que el límite (los nuevos quedan inactivos).
--
-- Clave Inteligente queda en «empresa» sin límite: no cambia nada hoy.
-- El plan solo se cambia desde el SQL Editor (no desde la app).
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

create table if not exists public.empresa_plan (
  id boolean primary key default true check (id),
  plan text not null default 'empresa' check (plan in ('campo', 'profesional', 'empresa')),
  extras text[] not null default '{}',
  limite_usuarios integer check (limite_usuarios is null or limite_usuarios > 0),
  updated_at timestamptz not null default now()
);

insert into public.empresa_plan (id) values (true) on conflict (id) do nothing;

alter table public.empresa_plan enable row level security;
drop policy if exists empresa_plan_leer on public.empresa_plan;
create policy empresa_plan_leer on public.empresa_plan for select
  to authenticated using (true);
-- Sin políticas de escritura: solo el SQL Editor / service role lo cambia.

-- Módulos del plan + extras. Mantener igual que lib/planes.ts.
create or replace function public.modulos_activos()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array(
    select distinct m from (
      select unnest(
        case p.plan
          when 'campo' then array['reportes', 'servicios', 'ubicacion', 'clientes']
          when 'profesional' then array['reportes', 'servicios', 'ubicacion', 'clientes', 'cotizaciones', 'almacen', 'formatos', 'cuadrillas']
          else array['reportes', 'servicios', 'ubicacion', 'clientes', 'cotizaciones', 'almacen', 'formatos', 'cuadrillas', 'facturacion', 'ia']
        end || p.extras
      ) as m
      from public.empresa_plan p
    ) x
  );
$$;

create or replace function public.modulo_activo(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_modulo = any(public.modulos_activos());
$$;

-- Lo que la app necesita saber del plan, en una sola consulta.
create or replace function public.mi_plan()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'plan', p.plan,
    'modulos', to_jsonb(public.modulos_activos()),
    'limite_usuarios', p.limite_usuarios,
    'usuarios_activos', (select count(*) from public.profiles where coalesce(activo, true))
  )
  from public.empresa_plan p;
$$;

revoke all on function public.modulos_activos() from public, anon;
revoke all on function public.modulo_activo(text) from public, anon;
revoke all on function public.mi_plan() from public, anon;
grant execute on function public.modulos_activos() to authenticated;
grant execute on function public.modulo_activo(text) to authenticated;
grant execute on function public.mi_plan() to authenticated;

-- Límite de usuarios activos.
create or replace function public.respetar_limite_usuarios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite integer;
  v_activos integer;
begin
  select limite_usuarios into v_limite from public.empresa_plan limit 1;
  if v_limite is null or not coalesce(new.activo, true) then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.activo, true) then
    return new; -- ya contaba como activo
  end if;

  select count(*) into v_activos from public.profiles
  where coalesce(activo, true) and id <> new.id;

  if v_activos >= v_limite then
    if tg_op = 'INSERT' then
      -- La cuenta se crea, pero inactiva hasta que haya lugar en el plan.
      new.activo := false;
    else
      raise exception 'Tu plan permite % usuarios activos. Desactiva a alguien o amplía el plan.', v_limite;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_limite_usuarios on public.profiles;
create trigger trg_limite_usuarios
  before insert or update of activo on public.profiles
  for each row execute function public.respetar_limite_usuarios();

-- Verificación: debe mostrar plan «empresa», los 9 módulos, sin límite.
select public.mi_plan() as plan_actual;
