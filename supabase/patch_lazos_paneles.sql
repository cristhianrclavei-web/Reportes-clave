-- ============================================================
-- Lazos: paneles (cada panel de un cliente con sus circuitos)
-- ============================================================
-- Un panel (Firelite ES-1000X del cuarto eléctrico, por ejemplo) tiene
-- tarjetas SLC (lazos de detección), salidas NAC (sirenas y estrobos) y a
-- veces voceo. Aquí se guarda el panel y cuántas salidas de cada tipo tiene,
-- y cada lazo apunta a su panel (lazos.panel_id).
--
-- Los lazos que ya existían se juntan solos: por cliente y por el texto que
-- tenían en «Panel» (sin importar mayúsculas ni espacios).
--
-- Mismos permisos que los lazos: técnicos y supervisión leen, crean y
-- editan; solo supervisión borra. Borrar un panel NO borra sus lazos: se
-- quedan sin panel.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

create table if not exists public.lazo_paneles (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 80),
  modelo text check (char_length(modelo) <= 120),
  ubicacion text check (char_length(ubicacion) <= 160),
  -- Cuántas salidas de cada tipo tiene el panel (para mostrar las vacías).
  slc integer not null default 1 check (slc between 0 and 20),
  nac integer not null default 0 check (nac between 0 and 20),
  voceo integer not null default 0 check (voceo between 0 and 20),
  notas text check (char_length(notas) <= 1000),
  creado_por uuid not null default auth.uid() references public.profiles(id),
  creado_en timestamptz not null default now()
);

create index if not exists idx_lazo_paneles_cliente on public.lazo_paneles(cliente_id);

alter table public.lazos add column if not exists panel_id uuid references public.lazo_paneles(id) on delete set null;
create index if not exists idx_lazos_panel on public.lazos(panel_id);

alter table public.lazo_paneles enable row level security;

drop policy if exists lazo_paneles_select on public.lazo_paneles;
create policy lazo_paneles_select on public.lazo_paneles for select
  using (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa());
drop policy if exists lazo_paneles_insert on public.lazo_paneles;
create policy lazo_paneles_insert on public.lazo_paneles for insert
  with check (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa() and creado_por = auth.uid());
drop policy if exists lazo_paneles_update on public.lazo_paneles;
create policy lazo_paneles_update on public.lazo_paneles for update
  using (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa());
drop policy if exists lazo_paneles_delete on public.lazo_paneles;
create policy lazo_paneles_delete on public.lazo_paneles for delete
  using (public.get_my_role() = 'supervisor' and public.mi_cuenta_activa());

grant select, insert, update, delete on public.lazo_paneles to authenticated;

-- ---------- Juntar los lazos que ya existen ----------
-- Un panel por cada cliente + texto de panel. Las salidas se ponen según lo
-- que ya está capturado (el número más alto o cuántos hay).
with grupos as (
  select
    cliente_id,
    lower(regexp_replace(trim(panel), '\s+', ' ', 'g')) as clave,
    -- Como lo escribieron en el primer lazo, sin espacios de más.
    (array_agg(regexp_replace(trim(panel), '\s+', ' ', 'g') order by creado_en))[1] as texto,
    greatest(1, coalesce(max(numero) filter (where tipo = 'deteccion'), 0), count(*) filter (where tipo = 'deteccion')) as slc,
    greatest(coalesce(max(numero) filter (where tipo = 'estrobos'), 0), count(*) filter (where tipo = 'estrobos')) as nac,
    greatest(coalesce(max(numero) filter (where tipo = 'voceo'), 0), count(*) filter (where tipo = 'voceo')) as voceo,
    (array_agg(creado_por order by creado_en))[1] as creado_por
  from public.lazos
  where panel_id is null and coalesce(trim(panel), '') <> ''
  group by cliente_id, lower(regexp_replace(trim(panel), '\s+', ' ', 'g'))
),
nuevos as (
  insert into public.lazo_paneles (cliente_id, nombre, modelo, slc, nac, voceo, creado_por)
  select cliente_id, left('Panel ' || texto, 80), left(texto, 120), least(slc, 20), least(nac, 20), least(voceo, 20), creado_por
  from grupos
  returning id, cliente_id, modelo
)
update public.lazos l
set panel_id = n.id
from nuevos n
where l.panel_id is null
  and l.cliente_id = n.cliente_id
  and lower(regexp_replace(trim(l.panel), '\s+', ' ', 'g')) = lower(regexp_replace(trim(n.modelo), '\s+', ' ', 'g'));
