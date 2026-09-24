-- ============================================================
-- Proyectos por cliente (administración de cuentas)
-- ============================================================
-- Un cliente (empresa) puede tener varios proyectos a lo largo del tiempo —
-- cada proyecto es un sistema concreto que se le trabajó o se le está
-- proponiendo (CCTV, paneles solares, detección de incendios...). Cada
-- proyecto lleva su propio estado (propuesta / en curso / concluido),
-- documentación (planos, formatos...) y, opcionalmente, una o más
-- cotizaciones ya existentes vinculadas — sin duplicar esos datos, solo
-- referenciando la cotización real.
--
-- Todo el módulo es de supervisores, igual que cotizaciones.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.proyectos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  sistema text not null,
  descripcion text,
  estado text not null default 'propuesta' check (estado in ('propuesta', 'en_curso', 'concluido')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proyecto_documentos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  -- "De qué es": Planos, Formato de mantenimiento, Formato de
  -- interconexión... texto libre con sugerencias en el formulario, no un
  -- catálogo cerrado — la variedad real de documentos no cabe en un enum.
  nombre text not null,
  descripcion text,
  archivo_path text not null,
  archivo_nombre_original text,
  subido_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Vínculo a cotizaciones ya existentes (tabla `cotizaciones`, de
-- patch_cotizaciones.sql). No copia datos: si la cotización cambia de
-- estado o de total, el proyecto siempre ve lo más reciente.
create table if not exists public.proyecto_cotizaciones (
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  cotizacion_id uuid not null references public.cotizaciones(id) on delete cascade,
  vinculado_por uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (proyecto_id, cotizacion_id)
);

alter table public.clientes enable row level security;
alter table public.proyectos enable row level security;
alter table public.proyecto_documentos enable row level security;
alter table public.proyecto_cotizaciones enable row level security;

drop policy if exists clientes_supervisor_all on public.clientes;
create policy clientes_supervisor_all on public.clientes for all
  using (public.get_my_role() = 'supervisor') with check (public.get_my_role() = 'supervisor');

drop policy if exists proyectos_supervisor_all on public.proyectos;
create policy proyectos_supervisor_all on public.proyectos for all
  using (public.get_my_role() = 'supervisor') with check (public.get_my_role() = 'supervisor');

drop policy if exists proyecto_documentos_supervisor_all on public.proyecto_documentos;
create policy proyecto_documentos_supervisor_all on public.proyecto_documentos for all
  using (public.get_my_role() = 'supervisor') with check (public.get_my_role() = 'supervisor');

drop policy if exists proyecto_cotizaciones_supervisor_all on public.proyecto_cotizaciones;
create policy proyecto_cotizaciones_supervisor_all on public.proyecto_cotizaciones for all
  using (public.get_my_role() = 'supervisor') with check (public.get_my_role() = 'supervisor');

-- auditoria_global.entidad tenía un CHECK cerrado a ('servicio','reporte');
-- se amplía para permitir 'proyecto' sin perder las filas existentes.
alter table public.auditoria_global drop constraint if exists auditoria_global_entidad_check;
alter table public.auditoria_global add constraint auditoria_global_entidad_check
  check (entidad in ('servicio', 'reporte', 'proyecto'));

create index if not exists idx_proyectos_cliente on public.proyectos(cliente_id);
create index if not exists idx_proyectos_estado on public.proyectos(estado);
create index if not exists idx_proyecto_documentos_proyecto on public.proyecto_documentos(proyecto_id);
create index if not exists idx_proyecto_cotizaciones_proyecto on public.proyecto_cotizaciones(proyecto_id);
create index if not exists idx_proyecto_cotizaciones_cotizacion on public.proyecto_cotizaciones(cotizacion_id);

-- Bucket privado para los archivos de proyecto (planos, formatos, etc).
-- Mismo patrón que 'facturas': todo el bucket es de supervisores.
insert into storage.buckets (id, name, public)
values ('proyectos-documentos', 'proyectos-documentos', false)
on conflict (id) do nothing;

drop policy if exists "proyectos_documentos_supervisor_all" on storage.objects;
create policy "proyectos_documentos_supervisor_all"
  on storage.objects for all
  using (bucket_id = 'proyectos-documentos' and public.get_my_role() = 'supervisor')
  with check (bucket_id = 'proyectos-documentos' and public.get_my_role() = 'supervisor');

-- Verificación: debe devolver 4.
--
-- select count(*) from information_schema.tables
--  where table_schema = 'public'
--    and table_name in ('clientes','proyectos','proyecto_documentos','proyecto_cotizaciones');
