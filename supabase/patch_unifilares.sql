-- Diagramas unifilares de sistemas fotovoltaicos (interconectado a CFE,
-- aislado con baterías o híbrido) para el trámite de interconexión. Todo el
-- dibujo (equipos, tramos con calibres y metros, datos del plano) va en
-- `datos` (jsonb). Ver lib/unifilar.ts.
--
-- Solo supervisión los ve y los edita: es documentación de ingeniería.
--
-- Aditivo e idempotente: se puede correr varias veces.

create table if not exists public.unifilares (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 1 and 120),
  tipo text not null check (tipo in ('interconectado', 'aislado', 'hibrido')),
  cliente_id uuid references public.clientes(id) on delete set null,
  datos jsonb not null default '{"equipos": [], "tramos": []}'::jsonb
    check (jsonb_typeof(datos -> 'equipos') = 'array' and jsonb_typeof(datos -> 'tramos') = 'array' and pg_column_size(datos) < 1000000),
  creado_por uuid not null default auth.uid() references public.profiles(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_unifilares_cliente on public.unifilares(cliente_id);

alter table public.unifilares enable row level security;

drop policy if exists unifilares_select on public.unifilares;
create policy unifilares_select on public.unifilares for select
  using (public.get_my_role() = 'supervisor' and public.mi_cuenta_activa());
drop policy if exists unifilares_insert on public.unifilares;
create policy unifilares_insert on public.unifilares for insert
  with check (public.get_my_role() = 'supervisor' and public.mi_cuenta_activa() and creado_por = auth.uid());
drop policy if exists unifilares_update on public.unifilares;
create policy unifilares_update on public.unifilares for update
  using (public.get_my_role() = 'supervisor' and public.mi_cuenta_activa());
drop policy if exists unifilares_delete on public.unifilares;
create policy unifilares_delete on public.unifilares for delete
  using (public.get_my_role() = 'supervisor' and public.mi_cuenta_activa());

notify pgrst, 'reload schema';

-- Comprobar: select count(*) from public.unifilares;
