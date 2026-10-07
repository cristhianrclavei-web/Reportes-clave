-- ============================================================
-- Asistente de IA (Fase 1: solo consultas)
-- ============================================================
-- Bitácora de uso del asistente. Sirve para tres cosas:
--   1. Tope diario de preguntas por persona (el asistente cuesta por uso).
--   2. Historial: qué se preguntó y qué se contestó.
--   3. Medir el consumo de tokens por instalación.
--
-- Sin esta tabla la ruta /api/asistente responde 503: no se atiende ninguna
-- pregunta si no se puede contar el uso.
--
-- Se puede correr más de una vez.

create table if not exists public.asistente_uso (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  pregunta text not null,
  respuesta text,
  modelo text,
  tokens_entrada integer not null default 0,
  tokens_salida integer not null default 0,
  herramientas text[] not null default '{}'
);

create index if not exists idx_asistente_uso_persona_dia on public.asistente_uso (user_id, created_at desc);

alter table public.asistente_uso enable row level security;

-- Cada quien registra y ve lo suyo; el supervisor ve todo para revisar el
-- consumo. No hay política de update ni de delete: nadie puede borrar sus
-- renglones para saltarse el tope diario.
drop policy if exists asistente_uso_insert_propio on public.asistente_uso;
create policy asistente_uso_insert_propio on public.asistente_uso for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists asistente_uso_lectura on public.asistente_uso;
create policy asistente_uso_lectura on public.asistente_uso for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'supervisor')
  );

revoke all on public.asistente_uso from anon;
grant select, insert on public.asistente_uso to authenticated;
