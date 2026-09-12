-- ============================================================
-- Módulo: Bitácora de actividades en tiempo real
-- ============================================================
-- Una "actividad" es un bloque de trabajo (ej. "Instalación de
-- tubería — Etapa 4"). Cada actividad tiene una línea de tiempo
-- de "eventos": avances con foto y nota, pausas, reanudaciones,
-- y el cierre final. La hora y la ubicación de cada evento se
-- capturan automáticamente del dispositivo — nunca son editables
-- a mano.

create table if not exists public.actividades (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  proyecto text not null,
  titulo text not null,
  estado text not null default 'en_curso' check (estado in ('en_curso', 'pausada', 'concluida')),
  hora_inicio timestamptz not null default now(),
  hora_fin timestamptz,
  ubicacion_inicio jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.actividad_eventos (
  id uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references public.actividades(id) on delete cascade,
  tipo text not null check (tipo in ('avance', 'pausa', 'reanudacion', 'cierre')),
  nota text,
  foto_path text,
  ubicacion jsonb,
  created_at timestamptz not null default now()
);

alter table public.actividades enable row level security;
alter table public.actividad_eventos enable row level security;

-- Técnicos: solo pueden ver/crear/actualizar SUS PROPIAS actividades.
drop policy if exists actividades_tecnico_own on public.actividades;
create policy actividades_tecnico_own
on public.actividades for all
using (created_by = auth.uid())
with check (created_by = auth.uid());

-- Supervisores: pueden ver todas las actividades (solo lectura, para dar seguimiento).
drop policy if exists actividades_supervisor_read on public.actividades;
create policy actividades_supervisor_read
on public.actividades for select
using (public.get_my_role() = 'supervisor');

-- Eventos: mismo criterio, a través de la actividad a la que pertenecen.
drop policy if exists actividad_eventos_tecnico_own on public.actividad_eventos;
create policy actividad_eventos_tecnico_own
on public.actividad_eventos for all
using (
  exists (select 1 from public.actividades a where a.id = actividad_id and a.created_by = auth.uid())
)
with check (
  exists (select 1 from public.actividades a where a.id = actividad_id and a.created_by = auth.uid())
);

drop policy if exists actividad_eventos_supervisor_read on public.actividad_eventos;
create policy actividad_eventos_supervisor_read
on public.actividad_eventos for select
using (public.get_my_role() = 'supervisor');

create index if not exists idx_actividades_created_by on public.actividades(created_by);
create index if not exists idx_actividades_estado on public.actividades(estado);
create index if not exists idx_actividad_eventos_actividad on public.actividad_eventos(actividad_id);
