-- ============================================================
-- Lazos: planos con sembrado de equipos y canalización
-- ============================================================
-- Se sube el plano del cliente en PDF (exportado de AutoCAD), una hoja por
-- plano (nivel o área). Sobre él se siembran los equipos (ligados o no a un
-- dispositivo de un lazo) y se dibuja la tubería. Todo lo dibujado va en
-- `sembrado` (jsonb) con coordenadas en puntos de la hoja del PDF, así no
-- depende de la resolución de la imagen ni de la pantalla:
--
--   { "equipos":  [{ "id", "tipo", "x", "y", "elementoId"?, "etiqueta"? }],
--     "tuberias": [{ "id", "tipo", "diametro", "puntos": [[x, y], ...] }] }
--
-- `metros_por_unidad` es la escala (cuántos metros reales mide un punto de
-- la hoja); vacía mientras no se calibre.
--
-- Archivos en el bucket 'evidencias' bajo lazos/planos/<id>/ (ya cubierto
-- por las políticas de la carpeta lazos/ de patch_lazos.sql).
--
-- Mismos permisos que los lazos: técnicos y supervisión leen, crean y
-- editan; solo supervisión borra.
--
-- Requiere patch_lazos.sql. Ejecutar completo en el SQL Editor. Idempotente.

create table if not exists public.lazo_planos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 80),
  pdf_path text not null check (pdf_path like 'lazos/planos/%'),
  imagen_path text not null check (imagen_path like 'lazos/planos/%'),
  pagina integer not null default 1 check (pagina between 1 and 500),
  -- Tamaño de la hoja en puntos (como se ve, ya girada).
  ancho double precision not null check (ancho > 0 and ancho < 100000),
  alto double precision not null check (alto > 0 and alto < 100000),
  metros_por_unidad double precision check (metros_por_unidad > 0 and metros_por_unidad < 1000),
  sembrado jsonb not null default '{"equipos": [], "tuberias": []}'::jsonb
    check (jsonb_typeof(sembrado -> 'equipos') = 'array' and jsonb_typeof(sembrado -> 'tuberias') = 'array'
           and pg_column_size(sembrado) < 2000000),
  creado_por uuid not null default auth.uid() references public.profiles(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references public.profiles(id),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_lazo_planos_cliente on public.lazo_planos(cliente_id);

alter table public.lazo_planos enable row level security;

drop policy if exists lazo_planos_select on public.lazo_planos;
create policy lazo_planos_select on public.lazo_planos for select
  using (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa());
drop policy if exists lazo_planos_insert on public.lazo_planos;
create policy lazo_planos_insert on public.lazo_planos for insert
  with check (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa() and creado_por = auth.uid());
drop policy if exists lazo_planos_update on public.lazo_planos;
create policy lazo_planos_update on public.lazo_planos for update
  using (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa());
drop policy if exists lazo_planos_delete on public.lazo_planos;
create policy lazo_planos_delete on public.lazo_planos for delete
  using (public.get_my_role() = 'supervisor' and public.mi_cuenta_activa());

grant select, insert, update, delete on public.lazo_planos to authenticated;

-- Quién y cuándo guardó lo último (lo pone la base, no el teléfono).
create or replace function public.lazo_planos_al_actualizar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.actualizado_por := auth.uid();
  new.actualizado_en := now();
  -- El dueño y la fecha de alta no cambian.
  new.creado_por := old.creado_por;
  new.creado_en := old.creado_en;
  return new;
end;
$$;

drop trigger if exists trg_lazo_planos_al_actualizar on public.lazo_planos;
create trigger trg_lazo_planos_al_actualizar
  before update on public.lazo_planos
  for each row execute function public.lazo_planos_al_actualizar();

-- Verificación: debe devolver 1 y 4 políticas.
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'lazo_planos') as tabla,
  (select count(*) from pg_policies where tablename = 'lazo_planos') as politicas;
