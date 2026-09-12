-- ============================================================
-- Módulo: Servicios/proyectos programados por el supervisor
-- ============================================================
-- Reemplaza el flujo de "el técnico inicia lo que quiera" por uno
-- donde el supervisor programa el servicio, asigna técnicos y una
-- lista de tareas (checklist), y el técnico ejecuta documentando
-- cada tarea con foto + ubicación + hora. Si se pasa el tiempo
-- estimado, el sistema exige justificación antes de poder concluir.

create table if not exists public.servicios_programados (
  id uuid primary key default gen_random_uuid(),
  creado_por uuid not null references auth.users(id),
  proyecto text not null,
  descripcion text,
  fecha date not null,
  duracion_estimada_min integer not null default 120,
  hora_llegada timestamptz,
  hora_inicio timestamptz,
  hora_fin timestamptz,
  estado text not null default 'programado' check (estado in ('programado', 'en_sitio', 'en_curso', 'concluido')),
  report_id uuid references public.reports(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.servicio_tecnicos (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios_programados(id) on delete cascade,
  tecnico_id uuid not null references public.profiles(id) on delete cascade,
  unique (servicio_id, tecnico_id)
);

create table if not exists public.servicio_tareas (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios_programados(id) on delete cascade,
  descripcion text not null,
  orden integer not null default 0,
  completada boolean not null default false,
  completada_por uuid references public.profiles(id),
  completada_en timestamptz,
  foto_path text,
  ubicacion jsonb,
  nota text
);

create table if not exists public.servicio_eventos (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios_programados(id) on delete cascade,
  tipo text not null check (tipo in ('llegada', 'inicio', 'retraso', 'evidencia', 'cierre')),
  nota text,
  foto_path text,
  ubicacion jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Auditoría: registra cada modificación que un supervisor hace a un
-- servicio ya programado (quién, qué cambió, cuándo).
create table if not exists public.servicio_auditoria (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios_programados(id) on delete cascade,
  supervisor_id uuid not null references public.profiles(id),
  cambio text not null,
  created_at timestamptz not null default now()
);

alter table public.servicios_programados enable row level security;
alter table public.servicio_tecnicos enable row level security;
alter table public.servicio_tareas enable row level security;
alter table public.servicio_eventos enable row level security;
alter table public.servicio_auditoria enable row level security;

-- Supervisores: control total sobre todo el módulo.
drop policy if exists servicios_supervisor_all on public.servicios_programados;
create policy servicios_supervisor_all on public.servicios_programados for all
  using (public.get_my_role() = 'supervisor') with check (public.get_my_role() = 'supervisor');

drop policy if exists servicio_tecnicos_supervisor_all on public.servicio_tecnicos;
create policy servicio_tecnicos_supervisor_all on public.servicio_tecnicos for all
  using (public.get_my_role() = 'supervisor') with check (public.get_my_role() = 'supervisor');

drop policy if exists servicio_tareas_supervisor_all on public.servicio_tareas;
create policy servicio_tareas_supervisor_all on public.servicio_tareas for all
  using (public.get_my_role() = 'supervisor') with check (public.get_my_role() = 'supervisor');

drop policy if exists servicio_eventos_supervisor_all on public.servicio_eventos;
create policy servicio_eventos_supervisor_all on public.servicio_eventos for all
  using (public.get_my_role() = 'supervisor') with check (public.get_my_role() = 'supervisor');

drop policy if exists servicio_auditoria_supervisor_all on public.servicio_auditoria;
create policy servicio_auditoria_supervisor_all on public.servicio_auditoria for all
  using (public.get_my_role() = 'supervisor') with check (public.get_my_role() = 'supervisor');

-- Técnicos: solo ven/actualizan los servicios donde están asignados.
drop policy if exists servicios_tecnico_read on public.servicios_programados;
create policy servicios_tecnico_read on public.servicios_programados for select
  using (exists (select 1 from public.servicio_tecnicos st where st.servicio_id = servicios_programados.id and st.tecnico_id = auth.uid()));

drop policy if exists servicios_tecnico_update on public.servicios_programados;
create policy servicios_tecnico_update on public.servicios_programados for update
  using (exists (select 1 from public.servicio_tecnicos st where st.servicio_id = servicios_programados.id and st.tecnico_id = auth.uid()))
  with check (exists (select 1 from public.servicio_tecnicos st where st.servicio_id = servicios_programados.id and st.tecnico_id = auth.uid()));

drop policy if exists servicio_tecnicos_tecnico_read on public.servicio_tecnicos;
create policy servicio_tecnicos_tecnico_read on public.servicio_tecnicos for select
  using (tecnico_id = auth.uid());

drop policy if exists servicio_tareas_tecnico_all on public.servicio_tareas;
create policy servicio_tareas_tecnico_all on public.servicio_tareas for all
  using (exists (select 1 from public.servicio_tecnicos st where st.servicio_id = servicio_tareas.servicio_id and st.tecnico_id = auth.uid()))
  with check (exists (select 1 from public.servicio_tecnicos st where st.servicio_id = servicio_tareas.servicio_id and st.tecnico_id = auth.uid()));

drop policy if exists servicio_eventos_tecnico_all on public.servicio_eventos;
create policy servicio_eventos_tecnico_all on public.servicio_eventos for all
  using (exists (select 1 from public.servicio_tecnicos st where st.servicio_id = servicio_eventos.servicio_id and st.tecnico_id = auth.uid()))
  with check (exists (select 1 from public.servicio_tecnicos st where st.servicio_id = servicio_eventos.servicio_id and st.tecnico_id = auth.uid()));

create index if not exists idx_servicios_fecha on public.servicios_programados(fecha);
create index if not exists idx_servicios_estado on public.servicios_programados(estado);
create index if not exists idx_servicio_tecnicos_servicio on public.servicio_tecnicos(servicio_id);
create index if not exists idx_servicio_tecnicos_tecnico on public.servicio_tecnicos(tecnico_id);
create index if not exists idx_servicio_tareas_servicio on public.servicio_tareas(servicio_id);
create index if not exists idx_servicio_eventos_servicio on public.servicio_eventos(servicio_id);
