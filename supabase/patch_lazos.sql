-- ============================================================
-- Lazos y circuitos: registro del cableado y búsqueda de fallas a tierra
-- ============================================================
-- Los técnicos cablean y nadie anota por dónde va el cable; cuando hay una
-- falla a tierra se secciona el lazo a ciegas. Aquí se guarda:
--
--   1. lazos: cada lazo de detección o circuito de voceo / estrobos de un
--      cliente (panel, clase, número de lazo).
--   2. lazo_elementos: los dispositivos EN EL ORDEN en que corre el cable.
--      `padre_id` vacío = línea principal; con padre = cuelga de ese
--      dispositivo (la corneta de un módulo, una derivación en estrella).
--      El id lo genera el teléfono, para poder capturar sin señal y subir
--      después sin duplicar.
--   3. lazo_fallas y lazo_cortes: una búsqueda de falla a tierra y cada corte
--      que se hizo («abrí a la salida de X, la falla quedó del lado campo»).
--
-- Técnicos y supervisión leen y capturan todos los lazos (cualquiera puede
-- ir a atender una falla). Borrar un lazo es solo de supervisión.
--
-- Las fotos van al bucket 'evidencias' bajo la carpeta lazos/<lazo_id>/.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

create table if not exists public.lazos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  tipo text not null default 'deteccion' check (tipo in ('deteccion', 'voceo', 'estrobos')),
  -- Código corto que encabeza los nombres de los dispositivos: LZ1, VC1, ES1.
  codigo text not null check (char_length(codigo) between 1 and 12),
  nombre text not null check (char_length(nombre) between 1 and 120),
  -- Número de lazo en el panel (el «1» de 1D008). Solo en detección.
  numero integer check (numero between 1 and 99),
  clase text check (clase in ('A', 'B')),
  panel text check (char_length(panel) <= 160),
  notas text check (char_length(notas) <= 1000),
  creado_por uuid not null default auth.uid() references public.profiles(id),
  creado_en timestamptz not null default now()
);

create index if not exists idx_lazos_cliente on public.lazos(cliente_id);

create table if not exists public.lazo_elementos (
  id uuid primary key,
  lazo_id uuid not null references public.lazos(id) on delete cascade,
  padre_id uuid references public.lazo_elementos(id) on delete cascade,
  -- Posición: se ordena por este número dentro de la línea principal o de
  -- lo que cuelga de un mismo padre. Insertar entre dos = el promedio.
  orden double precision not null,
  tipo text not null check (char_length(tipo) between 1 and 6),
  nombre text not null check (char_length(nombre) between 1 and 40),
  -- D o M y hasta 3 dígitos (D008, M021). Vacío en bocinas, estrobos, cajas.
  direccion text check (direccion ~ '^[DM][0-9]{1,3}$'),
  ubicacion text check (char_length(ubicacion) <= 160),
  foto_path text,
  creado_por uuid not null default auth.uid() references public.profiles(id),
  creado_en timestamptz not null default now()
);

create index if not exists idx_lazo_elementos_lazo on public.lazo_elementos(lazo_id, orden);

create table if not exists public.lazo_fallas (
  id uuid primary key default gen_random_uuid(),
  lazo_id uuid not null references public.lazos(id) on delete cascade,
  estado text not null default 'abierta' check (estado in ('abierta', 'resuelta')),
  -- Dónde estaba la falla y por qué (se llena al resolverla).
  elemento_id uuid references public.lazo_elementos(id) on delete set null,
  causa text check (char_length(causa) <= 500),
  abierta_por uuid not null default auth.uid() references public.profiles(id),
  abierta_en timestamptz not null default now(),
  resuelta_en timestamptz
);

-- Una sola búsqueda abierta por lazo.
create unique index if not exists idx_lazo_fallas_una_abierta on public.lazo_fallas(lazo_id) where estado = 'abierta';

create table if not exists public.lazo_cortes (
  id uuid primary key,
  falla_id uuid not null references public.lazo_fallas(id) on delete cascade,
  -- Se abrió el lazo a la salida de este dispositivo.
  elemento_id uuid references public.lazo_elementos(id) on delete set null,
  -- De qué lado quedó la falla al abrir.
  lado text not null check (lado in ('panel', 'campo')),
  medicion text check (char_length(medicion) <= 40),
  notas text check (char_length(notas) <= 300),
  creado_por uuid not null default auth.uid() references public.profiles(id),
  creado_en timestamptz not null default now()
);

create index if not exists idx_lazo_cortes_falla on public.lazo_cortes(falla_id, creado_en);

-- ---------- Seguridad ----------
alter table public.lazos enable row level security;
alter table public.lazo_elementos enable row level security;
alter table public.lazo_fallas enable row level security;
alter table public.lazo_cortes enable row level security;

-- Lazos: todos leen, crean y editan; solo supervisión borra.
drop policy if exists lazos_select on public.lazos;
create policy lazos_select on public.lazos for select
  using (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa());
drop policy if exists lazos_insert on public.lazos;
create policy lazos_insert on public.lazos for insert
  with check (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa() and creado_por = auth.uid());
drop policy if exists lazos_update on public.lazos;
create policy lazos_update on public.lazos for update
  using (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa());
drop policy if exists lazos_delete on public.lazos;
create policy lazos_delete on public.lazos for delete
  using (public.get_my_role() = 'supervisor' and public.mi_cuenta_activa());

-- Dispositivos: todos leen, capturan y corrigen; borra supervisión o quien lo capturó.
drop policy if exists lazo_elementos_select on public.lazo_elementos;
create policy lazo_elementos_select on public.lazo_elementos for select
  using (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa());
drop policy if exists lazo_elementos_insert on public.lazo_elementos;
create policy lazo_elementos_insert on public.lazo_elementos for insert
  with check (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa() and creado_por = auth.uid());
drop policy if exists lazo_elementos_update on public.lazo_elementos;
create policy lazo_elementos_update on public.lazo_elementos for update
  using (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa());
drop policy if exists lazo_elementos_delete on public.lazo_elementos;
create policy lazo_elementos_delete on public.lazo_elementos for delete
  using (public.mi_cuenta_activa() and (public.get_my_role() = 'supervisor' or creado_por = auth.uid()));

-- Búsquedas de falla y cortes: todos leen y registran; solo supervisión borra.
drop policy if exists lazo_fallas_select on public.lazo_fallas;
create policy lazo_fallas_select on public.lazo_fallas for select
  using (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa());
drop policy if exists lazo_fallas_insert on public.lazo_fallas;
create policy lazo_fallas_insert on public.lazo_fallas for insert
  with check (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa() and abierta_por = auth.uid());
drop policy if exists lazo_fallas_update on public.lazo_fallas;
create policy lazo_fallas_update on public.lazo_fallas for update
  using (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa());
drop policy if exists lazo_fallas_delete on public.lazo_fallas;
create policy lazo_fallas_delete on public.lazo_fallas for delete
  using (public.get_my_role() = 'supervisor' and public.mi_cuenta_activa());

drop policy if exists lazo_cortes_select on public.lazo_cortes;
create policy lazo_cortes_select on public.lazo_cortes for select
  using (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa());
drop policy if exists lazo_cortes_insert on public.lazo_cortes;
create policy lazo_cortes_insert on public.lazo_cortes for insert
  with check (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa() and creado_por = auth.uid());
-- Sin esta, reintentar un corte que sí había subido (se cortó la señal antes
-- de la respuesta) choca con el «upsert» y la cola se atora.
drop policy if exists lazo_cortes_update on public.lazo_cortes;
create policy lazo_cortes_update on public.lazo_cortes for update
  using (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa());
drop policy if exists lazo_cortes_delete on public.lazo_cortes;
create policy lazo_cortes_delete on public.lazo_cortes for delete
  using (public.mi_cuenta_activa() and (public.get_my_role() = 'supervisor' or creado_por = auth.uid()));

grant select, insert, update, delete on public.lazos, public.lazo_elementos, public.lazo_fallas, public.lazo_cortes to authenticated;

-- ---------- Fotos ----------
-- Políticas aparte (se suman a las que ya tiene el bucket): carpeta lazos/.
drop policy if exists "evidencias_lazos_insert" on storage.objects;
create policy "evidencias_lazos_insert" on storage.objects for insert
  with check (
    bucket_id = 'evidencias'
    and (storage.foldername(name))[1] = 'lazos'
    and public.get_my_role() in ('tecnico', 'supervisor')
    and public.mi_cuenta_activa()
  );
drop policy if exists "evidencias_lazos_select" on storage.objects;
create policy "evidencias_lazos_select" on storage.objects for select
  using (
    bucket_id = 'evidencias'
    and (storage.foldername(name))[1] = 'lazos'
    and public.get_my_role() in ('tecnico', 'supervisor')
    and public.mi_cuenta_activa()
  );

-- Verificación: debe devolver 4.
-- select count(*) from information_schema.tables
--  where table_schema = 'public' and table_name in ('lazos', 'lazo_elementos', 'lazo_fallas', 'lazo_cortes');
