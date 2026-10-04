-- ============================================================
-- Cuadrillas: agrupar al personal técnico
-- ============================================================
-- Para empresas con mucho personal: el tablero del día, la agenda y (más
-- adelante) el control de reportes se agrupan y filtran por cuadrilla, y al
-- agendar se puede elegir una cuadrilla completa de un toque.
--
--   · Una cuadrilla tiene nombre, color, líder (opcional) e integrantes.
--   · Cada persona está en UNA sola cuadrilla (la llave primaria de
--     cuadrilla_miembros es el técnico).
--   · La cuadrilla es una PLANTILLA: el servicio sigue guardando a las
--     personas asignadas (servicio_tecnicos), así que cambiar o borrar una
--     cuadrilla no altera servicios ni reportes ya hechos.
--   · Es opcional: sin cuadrillas, la app se ve igual que antes.
--
-- Las ven todos los usuarios con sesión; solo los supervisores las editan.
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

create table if not exists public.cuadrillas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 1 and 40),
  -- Índice de color (misma paleta que los avatares, 0-9).
  color smallint not null default 0 check (color between 0 and 9),
  lider_id uuid references public.profiles(id) on delete set null,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists cuadrillas_nombre_unico on public.cuadrillas (lower(trim(nombre)));

create table if not exists public.cuadrilla_miembros (
  tecnico_id uuid primary key references public.profiles(id) on delete cascade,
  cuadrilla_id uuid not null references public.cuadrillas(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists cuadrilla_miembros_cuadrilla on public.cuadrilla_miembros (cuadrilla_id);

alter table public.cuadrillas enable row level security;
alter table public.cuadrilla_miembros enable row level security;

drop policy if exists cuadrillas_leer on public.cuadrillas;
create policy cuadrillas_leer on public.cuadrillas for select
  to authenticated using (public.mi_cuenta_activa());

drop policy if exists cuadrillas_supervisor on public.cuadrillas;
create policy cuadrillas_supervisor on public.cuadrillas for all
  to authenticated
  using (public.get_my_role() = 'supervisor')
  with check (public.get_my_role() = 'supervisor');

drop policy if exists cuadrilla_miembros_leer on public.cuadrilla_miembros;
create policy cuadrilla_miembros_leer on public.cuadrilla_miembros for select
  to authenticated using (public.mi_cuenta_activa());

drop policy if exists cuadrilla_miembros_supervisor on public.cuadrilla_miembros;
create policy cuadrilla_miembros_supervisor on public.cuadrilla_miembros for all
  to authenticated
  using (public.get_my_role() = 'supervisor')
  with check (public.get_my_role() = 'supervisor');

revoke all on public.cuadrillas from anon;
revoke all on public.cuadrilla_miembros from anon;
grant select, insert, update, delete on public.cuadrillas to authenticated;
grant select, insert, update, delete on public.cuadrilla_miembros to authenticated;

-- Guarda una cuadrilla y sus integrantes de una sola vez. Mover a alguien
-- que ya estaba en otra cuadrilla lo saca de la anterior.
create or replace function public.guardar_cuadrilla(
  p_id uuid,
  p_nombre text,
  p_color smallint,
  p_lider uuid,
  p_miembros uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_miembros uuid[] := coalesce(p_miembros, '{}');
begin
  if public.get_my_role() is distinct from 'supervisor' then
    raise exception 'Solo un supervisor puede editar cuadrillas';
  end if;
  if exists (select 1 from public.profiles where id = any(v_miembros) and role <> 'tecnico') then
    raise exception 'Las cuadrillas se forman con personal técnico';
  end if;
  -- El líder debe ser integrante.
  if p_lider is not null and not (p_lider = any(v_miembros)) then
    v_miembros := v_miembros || p_lider;
  end if;

  if v_id is null then
    insert into public.cuadrillas (nombre, color, lider_id, orden)
    values (trim(p_nombre), coalesce(p_color, 0), p_lider,
            coalesce((select max(orden) + 1 from public.cuadrillas), 0))
    returning id into v_id;
  else
    update public.cuadrillas set nombre = trim(p_nombre), color = coalesce(p_color, 0), lider_id = p_lider
    where id = v_id;
    if not found then raise exception 'La cuadrilla ya no existe'; end if;
  end if;

  delete from public.cuadrilla_miembros where cuadrilla_id = v_id and not (tecnico_id = any(v_miembros));
  insert into public.cuadrilla_miembros (tecnico_id, cuadrilla_id)
  select m, v_id from unnest(v_miembros) m
  on conflict (tecnico_id) do update set cuadrilla_id = excluded.cuadrilla_id;

  -- Quien salió de otra cuadrilla ya no puede seguir de líder ahí.
  update public.cuadrillas c set lider_id = null
  where c.lider_id is not null
    and not exists (select 1 from public.cuadrilla_miembros m where m.tecnico_id = c.lider_id and m.cuadrilla_id = c.id);

  return v_id;
end;
$$;

revoke all on function public.guardar_cuadrilla(uuid, text, smallint, uuid, uuid[]) from public, anon;
grant execute on function public.guardar_cuadrilla(uuid, text, smallint, uuid, uuid[]) to authenticated;

-- Solo lectura al vencer la suscripción (ver patch_suscripcion.sql).
do $$
declare t text;
begin
  if to_regprocedure('public.bloquear_si_solo_lectura()') is not null then
    foreach t in array array['cuadrillas', 'cuadrilla_miembros'] loop
      execute format('drop trigger if exists trg_solo_lectura on public.%I', t);
      execute format(
        'create trigger trg_solo_lectura before insert or update or delete on public.%I
           for each statement execute function public.bloquear_si_solo_lectura()', t);
    end loop;
  end if;
end $$;

-- Verificación: debe devolver 0 la primera vez.
select count(*) as cuadrillas from public.cuadrillas;
