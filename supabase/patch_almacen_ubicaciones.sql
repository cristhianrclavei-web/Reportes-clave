-- ============================================================
-- Almacén ordenado: ubicaciones, fotos, mermas y conteo físico
-- ============================================================
-- 1) Ubicaciones («Gabinete 2», «Sección 2 · Rack B»): cada artículo dice
--    dónde se guarda; el almacenista lo ve al entregar y las etiquetas QR
--    de ubicación y de artículo salen de aquí.
-- 2) Foto del artículo (para reconocerlo) y fotos en cada entrada (ticket,
--    equipo recibido), además de la factura y la orden de compra que ya había.
-- 3) Merma: ajuste que RESTA existencia (el «ajuste» de antes solo podía
--    sumar porque la cantidad siempre es positiva).
-- 4) Conteo físico: el almacenista cuenta (todo o una ubicación), la app
--    compara contra lo registrado y, al cerrarlo, ajusta las diferencias con
--    su motivo.
--
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

-- ---------- 1) Ubicaciones ----------
create table if not exists public.almacen_ubicaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) >= 1),
  descripcion text,
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_ubicaciones_nombre on public.almacen_ubicaciones (lower(trim(nombre))) where activo;

alter table public.almacen_ubicaciones enable row level security;
drop policy if exists ubicaciones_lectura on public.almacen_ubicaciones;
create policy ubicaciones_lectura on public.almacen_ubicaciones for select to authenticated using (true);
drop policy if exists ubicaciones_escritura on public.almacen_ubicaciones;
create policy ubicaciones_escritura on public.almacen_ubicaciones for all to authenticated
  using (public.puedo_gestionar_almacen()) with check (public.puedo_gestionar_almacen());

alter table public.almacen_articulos
  add column if not exists ubicacion_id uuid references public.almacen_ubicaciones(id) on delete set null,
  add column if not exists foto_path text;

-- ---------- 2) Fotos en entradas ----------
alter table public.almacen_movimientos
  add column if not exists fotos text[] not null default '{}';

-- Las fotos de artículos las puede ver cualquiera con sesión (el técnico al
-- pedir); las demás del bucket siguen siendo solo del almacén/supervisor.
drop policy if exists almacen_fotos_articulos_select on storage.objects;
create policy almacen_fotos_articulos_select on storage.objects for select to authenticated
  using (bucket_id = 'almacen' and (storage.foldername(name))[1] = 'articulos');

-- ---------- 3) Merma ----------
-- Quita cualquier restricción vieja sobre «tipo», tenga el nombre que tenga.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.almacen_movimientos'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tipo%' and pg_get_constraintdef(oid) ilike '%salida%'
  loop
    execute format('alter table public.almacen_movimientos drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.almacen_movimientos
  add constraint almacen_movimientos_tipo_check check (tipo in ('entrada', 'salida', 'retorno', 'ajuste', 'merma'));

create or replace view public.almacen_existencias as
select
  m.articulo_id,
  m.inventario,
  m.grupo_id,
  sum(
    case
      when m.tipo in ('entrada', 'retorno', 'ajuste') then m.cantidad
      when m.tipo in ('salida', 'merma') then -m.cantidad
      else 0
    end
  ) as existencia
from public.almacen_movimientos m
group by m.articulo_id, m.inventario, m.grupo_id;

-- ---------- 4) Conteo físico ----------
create sequence if not exists public.almacen_conteos_folio_seq;

create table if not exists public.almacen_conteos (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('C-' || lpad(nextval('public.almacen_conteos_folio_seq')::text, 3, '0')),
  ubicacion_id uuid references public.almacen_ubicaciones(id) on delete set null,
  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado', 'cancelado')),
  nota text,
  creado_por uuid not null references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  cerrado_en timestamptz
);

create table if not exists public.almacen_conteo_items (
  id uuid primary key default gen_random_uuid(),
  conteo_id uuid not null references public.almacen_conteos(id) on delete cascade,
  articulo_id uuid not null references public.almacen_articulos(id) on delete cascade,
  esperado numeric not null default 0,
  contado numeric check (contado is null or contado >= 0),
  nota text,
  unique (conteo_id, articulo_id)
);

alter table public.almacen_conteos enable row level security;
alter table public.almacen_conteo_items enable row level security;
drop policy if exists conteos_almacen on public.almacen_conteos;
create policy conteos_almacen on public.almacen_conteos for all to authenticated
  using (public.puedo_gestionar_almacen() or public.get_my_role() = 'supervisor')
  with check (public.puedo_gestionar_almacen());
drop policy if exists conteo_items_almacen on public.almacen_conteo_items;
create policy conteo_items_almacen on public.almacen_conteo_items for all to authenticated
  using (public.puedo_gestionar_almacen() or public.get_my_role() = 'supervisor')
  with check (public.puedo_gestionar_almacen());

-- Inicia un conteo del inventario general (todo o una ubicación): congela
-- lo que el sistema dice que hay en ese momento.
create or replace function public.iniciar_conteo(p_ubicacion uuid, p_nota text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.puedo_gestionar_almacen() or not public.mi_cuenta_activa() then
    raise exception 'Solo el almacén puede hacer conteos';
  end if;
  insert into public.almacen_conteos (ubicacion_id, nota) values (p_ubicacion, nullif(trim(coalesce(p_nota, '')), ''))
  returning id into v_id;
  insert into public.almacen_conteo_items (conteo_id, articulo_id, esperado)
  select v_id, a.id,
         coalesce((select sum(e.existencia) from public.almacen_existencias e where e.articulo_id = a.id and e.inventario = 'general'), 0)
  from public.almacen_articulos a
  where a.activo and (p_ubicacion is null or a.ubicacion_id = p_ubicacion);
  return v_id;
end;
$$;

-- Cierra el conteo: cada diferencia se ajusta en el inventario general
-- (sobra → ajuste, falta → merma) con el folio del conteo en la nota.
create or replace function public.cerrar_conteo(p_conteo uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  it record;
  v_n integer := 0;
  v_dif numeric;
begin
  if not public.puedo_gestionar_almacen() or not public.mi_cuenta_activa() then
    raise exception 'Solo el almacén puede cerrar conteos';
  end if;
  select * into c from public.almacen_conteos where id = p_conteo for update;
  if c.id is null or c.estado <> 'abierto' then raise exception 'Este conteo no está abierto'; end if;
  for it in select * from public.almacen_conteo_items where conteo_id = p_conteo and contado is not null loop
    v_dif := it.contado - it.esperado;
    if v_dif <> 0 then
      insert into public.almacen_movimientos (articulo_id, tipo, cantidad, inventario, creado_por, nota)
      values (it.articulo_id, case when v_dif > 0 then 'ajuste' else 'merma' end, abs(v_dif), 'general', auth.uid(),
              'Conteo físico ' || c.folio || coalesce(': ' || nullif(trim(it.nota), ''), ''));
      v_n := v_n + 1;
    end if;
  end loop;
  update public.almacen_conteos set estado = 'cerrado', cerrado_en = now() where id = p_conteo;
  return v_n;
end;
$$;

revoke all on function public.iniciar_conteo(uuid, text) from public, anon;
grant execute on function public.iniciar_conteo(uuid, text) to authenticated;
revoke all on function public.cerrar_conteo(uuid) from public, anon;
grant execute on function public.cerrar_conteo(uuid) to authenticated;

-- Verificación: deben salir 4 en true.
select
  to_regclass('public.almacen_ubicaciones') is not null as ubicaciones,
  to_regclass('public.almacen_conteos') is not null as conteos,
  exists (select 1 from information_schema.columns where table_name = 'almacen_articulos' and column_name = 'ubicacion_id') as articulo_ubicacion,
  position('merma' in pg_get_constraintdef((select oid from pg_constraint where conname = 'almacen_movimientos_tipo_check'))) > 0 as merma;
