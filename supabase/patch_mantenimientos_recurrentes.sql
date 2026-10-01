-- ============================================================
-- Mantenimientos recurrentes (contratos de mantenimiento por cliente)
-- ============================================================
-- Para clientes con mantenimiento periódico (p. ej. pruebas trimestrales de
-- detección): se define cliente, qué se hace, cada cuánto, técnicos y la
-- próxima fecha. Cuando se acerca, la Agenda lo muestra en «Mantenimientos
-- por programar»; al programarlo se crea el servicio normal y la próxima
-- fecha avanza sola según la frecuencia. Así no depende de que alguien se
-- acuerde.
--
-- Solo supervisores ven y administran esta tabla.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

create table if not exists public.mantenimientos_recurrentes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  proyecto text not null check (length(trim(proyecto)) >= 2),
  descripcion text,
  frecuencia text not null check (frecuencia in ('mensual', 'bimestral', 'trimestral', 'semestral', 'anual')),
  proxima_fecha date not null,
  hora time,
  duracion_min integer not null default 120 check (duracion_min > 0),
  tecnico_ids uuid[] not null default '{}',
  notas text,
  activo boolean not null default true,
  ultimo_servicio_id uuid references public.servicios_programados(id) on delete set null,
  ultima_programacion date,
  creado_por uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_mtto_recurrentes_proxima
  on public.mantenimientos_recurrentes (proxima_fecha) where activo;

alter table public.mantenimientos_recurrentes enable row level security;

drop policy if exists mtto_recurrentes_supervisor on public.mantenimientos_recurrentes;
create policy mtto_recurrentes_supervisor on public.mantenimientos_recurrentes for all
  to authenticated
  using (public.get_my_role() = 'supervisor')
  with check (public.get_my_role() = 'supervisor');

-- Verificación: la tabla existe y está vacía (0).
select count(*) as mantenimientos_recurrentes from public.mantenimientos_recurrentes;
