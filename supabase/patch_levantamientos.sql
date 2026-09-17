-- ============================================================
-- Levantamientos técnicos (técnicos y supervisores)
-- ============================================================
-- Formulario de campo para cuando un cliente pide un levantamiento antes de
-- cotizar: datos del sitio, uno o más sistemas revisados (con su estado
-- actual, observaciones y fotos) y notas/fotos generales del sitio.
--
-- A diferencia de reports (solo técnico crea, solo el suyo) y de
-- cotizaciones (solo supervisor), un levantamiento lo puede hacer
-- cualquiera de los dos roles — por eso created_by decide "es mío", no el
-- rol. El técnico ve y edita los suyos; el supervisor ve y edita todos.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

create table if not exists public.levantamientos (
  id uuid primary key default gen_random_uuid(),
  folio text not null,
  created_by uuid not null constraint levantamientos_created_by_profiles_fkey references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fecha date not null default current_date,

  -- Datos del sitio / cliente
  empresa text not null,
  atencion text,
  telefono text,
  correo text,
  direccion text,

  -- Notas y fotos generales del sitio, no atadas a un sistema en particular.
  notas text,
  fotos jsonb not null default '[]'::jsonb -- [{ path, caption }]
);

create table if not exists public.levantamiento_sistemas (
  id uuid primary key default gen_random_uuid(),
  levantamiento_id uuid not null references public.levantamientos(id) on delete cascade,
  orden integer not null default 0,
  sistema text not null, -- "CCTV", "Control de Acceso", etc. (texto libre con sugeridos)
  estado_actual text,    -- qué hay hoy en el sitio para este sistema
  observaciones text,    -- hallazgos, recomendación, lo que haga falta
  fotos jsonb not null default '[]'::jsonb -- [{ path, caption }]
);

create index if not exists idx_levantamientos_created_by on public.levantamientos(created_by);
create index if not exists idx_levantamientos_fecha on public.levantamientos(fecha desc);
create index if not exists idx_levantamiento_sistemas_levantamiento on public.levantamiento_sistemas(levantamiento_id);

alter table public.levantamientos enable row level security;
alter table public.levantamiento_sistemas enable row level security;

drop policy if exists levantamientos_propio_o_supervisor on public.levantamientos;
create policy levantamientos_propio_o_supervisor on public.levantamientos for all
  using (created_by = auth.uid() or public.get_my_role() = 'supervisor')
  with check (created_by = auth.uid() or public.get_my_role() = 'supervisor');

drop policy if exists levantamiento_sistemas_via_levantamiento on public.levantamiento_sistemas;
create policy levantamiento_sistemas_via_levantamiento on public.levantamiento_sistemas for all
  using (
    exists (
      select 1 from public.levantamientos l
      where l.id = levantamiento_id
        and (l.created_by = auth.uid() or public.get_my_role() = 'supervisor')
    )
  )
  with check (
    exists (
      select 1 from public.levantamientos l
      where l.id = levantamiento_id
        and (l.created_by = auth.uid() or public.get_my_role() = 'supervisor')
    )
  );

-- ============================================================
-- Storage: permitir fotos bajo 'levantamientos/...' en el bucket evidencias
-- ============================================================
-- El bucket 'evidencias' es privado y sus políticas de INSERT/SELECT solo
-- contemplan los prefijos ya usados (reports.id propio, 'servicios',
-- 'resguardos', 'actividades') — cualquier otro prefijo se rechaza en
-- silencio (mismo bug ya visto una vez con 'actividades', ver
-- PATCH_FOTOS_BITACORA.sql). Se agregan políticas nuevas y acotadas al
-- prefijo 'levantamientos', sin tocar las que ya existen (las políticas
-- permisivas de Postgres se combinan con OR).
--
-- Ruta esperada: levantamientos/{levantamiento_id}/{archivo}

drop policy if exists "evidencias_insert_levantamientos" on storage.objects;
create policy "evidencias_insert_levantamientos"
  on storage.objects for insert
  with check (
    bucket_id = 'evidencias'
    and (storage.foldername(name))[1] = 'levantamientos'
    and exists (
      select 1 from public.levantamientos l
      where l.id::text = (storage.foldername(name))[2]
        and (l.created_by = auth.uid() or public.get_my_role() = 'supervisor')
    )
  );

drop policy if exists "evidencias_select_levantamientos" on storage.objects;
create policy "evidencias_select_levantamientos"
  on storage.objects for select
  using (
    bucket_id = 'evidencias'
    and (storage.foldername(name))[1] = 'levantamientos'
    and exists (
      select 1 from public.levantamientos l
      where l.id::text = (storage.foldername(name))[2]
        and (l.created_by = auth.uid() or public.get_my_role() = 'supervisor')
    )
  );

drop policy if exists "evidencias_delete_levantamientos" on storage.objects;
create policy "evidencias_delete_levantamientos"
  on storage.objects for delete
  using (
    bucket_id = 'evidencias'
    and (storage.foldername(name))[1] = 'levantamientos'
    and exists (
      select 1 from public.levantamientos l
      where l.id::text = (storage.foldername(name))[2]
        and (l.created_by = auth.uid() or public.get_my_role() = 'supervisor')
    )
  );
