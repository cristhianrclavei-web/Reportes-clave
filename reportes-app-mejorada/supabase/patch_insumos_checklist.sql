-- ============================================================
-- Checklist de herramienta, material y equipo por proyecto
-- ============================================================
-- Es un checklist DISTINTO al de actividades (servicio_tareas): aquel se
-- completa en sitio con foto y ubicación; éste se revisa antes de salir, en
-- el almacén, y otra vez al regresar.
--
-- Tres tablas porque hay tres cosas distintas:
--   servicio_insumos        — QUÉ se lleva. Pertenece al proyecto (grupo_id),
--                             igual que el checklist de tareas.
--   servicio_insumo_estado  — CÓMO va cada día. La verificación es diaria, así
--                             que el estado no puede vivir en la fila del
--                             insumo: se guarda por (insumo, día) y registra
--                             tanto la salida como el retorno.
--   plantillas_insumos      — listas guardadas para reutilizar por tipo de
--                             trabajo, para no capturar lo mismo cada vez.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

-- 1) Qué se lleva
create table if not exists public.servicio_insumos (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null,
  servicio_id uuid not null references public.servicios_programados(id) on delete cascade,
  categoria text not null check (categoria in ('herramienta', 'material', 'equipo')),
  descripcion text not null,
  cantidad numeric not null default 1,
  unidad text not null default 'pza',
  orden integer not null default 0,
  -- Cuando lo agrega el técnico en campo se marca, para que el supervisor
  -- distinga lo que él programó de lo que hizo falta.
  agregado_por uuid references public.profiles(id),
  es_del_tecnico boolean not null default false,
  nota text,
  created_at timestamptz not null default now()
);

create index if not exists idx_servicio_insumos_grupo on public.servicio_insumos(grupo_id);

-- 2) Cómo va cada día (salida y retorno)
create table if not exists public.servicio_insumo_estado (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references public.servicio_insumos(id) on delete cascade,
  servicio_id uuid not null references public.servicios_programados(id) on delete cascade,
  salida boolean not null default false,
  salida_por uuid references public.profiles(id),
  salida_en timestamptz,
  retorno boolean not null default false,
  retorno_por uuid references public.profiles(id),
  retorno_en timestamptz,
  unique (insumo_id, servicio_id)
);

create index if not exists idx_insumo_estado_servicio on public.servicio_insumo_estado(servicio_id);

-- 3) Plantillas reutilizables
create table if not exists public.plantillas_insumos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  creado_por uuid not null references public.profiles(id),
  -- Los renglones van en jsonb: una plantilla se guarda y se aplica completa,
  -- nunca se consulta renglón por renglón, así que no gana nada con su tabla.
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 4) RLS
alter table public.servicio_insumos enable row level security;
alter table public.servicio_insumo_estado enable row level security;
alter table public.plantillas_insumos enable row level security;

-- Supervisor: control total
drop policy if exists servicio_insumos_supervisor on public.servicio_insumos;
create policy servicio_insumos_supervisor on public.servicio_insumos for all
  using (public.get_my_role() = 'supervisor')
  with check (public.get_my_role() = 'supervisor');

drop policy if exists insumo_estado_supervisor on public.servicio_insumo_estado;
create policy insumo_estado_supervisor on public.servicio_insumo_estado for all
  using (public.get_my_role() = 'supervisor')
  with check (public.get_my_role() = 'supervisor');

-- Técnico: si está asignado a cualquier día del proyecto. La subconsulta va
-- contra servicio_tecnicos y servicios_programados, nunca contra la propia
-- tabla, para no disparar la recursión infinita de RLS.
-- Ver e insertar: cualquier técnico asignado al proyecto.
drop policy if exists servicio_insumos_tecnico on public.servicio_insumos;
drop policy if exists servicio_insumos_tecnico_select on public.servicio_insumos;
create policy servicio_insumos_tecnico_select on public.servicio_insumos for select
  using (exists (
    select 1 from public.servicio_tecnicos st
    join public.servicios_programados sp on sp.id = st.servicio_id
    where sp.grupo_id = servicio_insumos.grupo_id and st.tecnico_id = auth.uid()
  ));

drop policy if exists servicio_insumos_tecnico_insert on public.servicio_insumos;
create policy servicio_insumos_tecnico_insert on public.servicio_insumos for insert
  with check (exists (
    select 1 from public.servicio_tecnicos st
    join public.servicios_programados sp on sp.id = st.servicio_id
    where sp.grupo_id = servicio_insumos.grupo_id and st.tecnico_id = auth.uid()
  ));

-- Editar y borrar: SOLO lo que el propio técnico agregó. La lista que armó el
-- supervisor no se toca desde campo; si sobra algo se le avisa, no se borra.
drop policy if exists servicio_insumos_tecnico_update on public.servicio_insumos;
create policy servicio_insumos_tecnico_update on public.servicio_insumos for update
  using (es_del_tecnico and agregado_por = auth.uid())
  with check (es_del_tecnico and agregado_por = auth.uid());

drop policy if exists servicio_insumos_tecnico_delete on public.servicio_insumos;
create policy servicio_insumos_tecnico_delete on public.servicio_insumos for delete
  using (es_del_tecnico and agregado_por = auth.uid());

drop policy if exists insumo_estado_tecnico on public.servicio_insumo_estado;
create policy insumo_estado_tecnico on public.servicio_insumo_estado for all
  using (exists (
    select 1 from public.servicio_tecnicos st
    where st.servicio_id = servicio_insumo_estado.servicio_id and st.tecnico_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.servicio_tecnicos st
    where st.servicio_id = servicio_insumo_estado.servicio_id and st.tecnico_id = auth.uid()
  ));

-- Plantillas: las usa el supervisor al programar
drop policy if exists plantillas_supervisor on public.plantillas_insumos;
create policy plantillas_supervisor on public.plantillas_insumos for all
  using (public.get_my_role() = 'supervisor')
  with check (public.get_my_role() = 'supervisor');
