-- ============================================================
-- Catálogo de modelos de equipo (sugerencias del reporte)
-- ============================================================
-- En «Montaje de equipo» el técnico escribe el MODELO y la app le sugiere
-- los modelos que ya se han instalado antes (con marca, descripción y foto)
-- además de los del almacén. Cada reporte guardado alimenta este catálogo:
-- un modelo que alguien buscó una vez en SYSCOM queda aquí con su foto y la
-- siguiente vez sale gratis, sin volver a consultar a SYSCOM.
--
-- También lleva la cuenta de búsquedas en SYSCOM por persona y día: cada
-- búsqueda sale por Fixie, que tiene un cupo mensual.
--
-- Requiere patch_equipos_instalados.sql. Ejecutar completo en el SQL Editor
-- de Supabase. Aditivo e idempotente: se puede correr varias veces.

create table if not exists public.equipos_modelos (
  clave text primary key,             -- modelo en minúsculas y sin espacios de más
  modelo text not null,
  marca text,
  descripcion text,
  imagen text,                        -- enlace a la foto de SYSCOM (no se guarda el archivo)
  enlace text,                        -- ficha en syscom.mx
  veces integer not null default 0,   -- cuántos reportes lo han usado
  actualizado_en timestamptz not null default now()
);

alter table public.equipos_modelos enable row level security;
drop policy if exists equipos_modelos_lectura on public.equipos_modelos;
create policy equipos_modelos_lectura on public.equipos_modelos for select to authenticated using (true);
-- Sin políticas de escritura: solo el trigger de abajo escribe.

-- Solo se aceptan fotos y fichas de SYSCOM: el catálogo lo ven todos.
create or replace function public.enlace_syscom_valido(p_url text)
returns text
language sql
immutable
as $$
  select case when p_url ~* '^https://([a-z0-9-]+\.)*syscom\.mx/' then left(p_url, 500) end;
$$;

create or replace function public.sincronizar_equipos_modelos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  e jsonb;
  v_modelo text;
  v_viejos text[] := '{}';
begin
  -- Al corregir un reporte no se vuelve a contar lo que ya traía.
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(distinct lower(trim(x->>'modelo'))), '{}') into v_viejos
    from jsonb_array_elements(coalesce(old.data->'equipos', '[]'::jsonb)) x;
  end if;

  for e in select * from jsonb_array_elements(coalesce(new.data->'equipos', '[]'::jsonb)) loop
    v_modelo := nullif(regexp_replace(trim(coalesce(e->>'modelo', '')), '\s+', ' ', 'g'), '');
    continue when v_modelo is null or length(v_modelo) > 80;

    insert into public.equipos_modelos as t (clave, modelo, marca, descripcion, imagen, enlace, veces)
    values (
      lower(v_modelo), v_modelo,
      nullif(left(trim(coalesce(e->>'marca', '')), 80), ''),
      nullif(left(trim(coalesce(e->>'desc', '')), 200), ''),
      public.enlace_syscom_valido(e->>'imagen'),
      public.enlace_syscom_valido(e->>'enlace'),
      1
    )
    on conflict (clave) do update set
      marca = coalesce(excluded.marca, t.marca),
      descripcion = coalesce(excluded.descripcion, t.descripcion),
      imagen = coalesce(excluded.imagen, t.imagen),
      enlace = coalesce(excluded.enlace, t.enlace),
      veces = t.veces + case when lower(v_modelo) = any (v_viejos) then 0 else 1 end,
      actualizado_en = now();
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_equipos_modelos on public.reports;
create trigger trg_equipos_modelos
  after insert or update of data on public.reports
  for each row execute function public.sincronizar_equipos_modelos();

-- Lo ya instalado antes de este parche también sirve de sugerencia.
insert into public.equipos_modelos (clave, modelo, marca, descripcion, veces)
select distinct on (lower(trim(modelo)))
  lower(trim(modelo)), trim(modelo), marca, descripcion,
  count(*) over (partition by lower(trim(modelo)))
from public.almacen_equipos_instalados
where nullif(trim(coalesce(modelo, '')), '') is not null and length(trim(modelo)) <= 80
order by lower(trim(modelo)), created_at desc
on conflict (clave) do nothing;

-- ---------- Tope de búsquedas en SYSCOM ----------
create table if not exists public.syscom_consultas_dia (
  usuario uuid not null references public.profiles(id) on delete cascade,
  dia date not null,
  cuenta integer not null default 0,
  primary key (usuario, dia)
);
alter table public.syscom_consultas_dia enable row level security;
-- Sin políticas: solo la función de abajo la toca.

-- Suma una búsqueda a la persona y dice si todavía estaba dentro del tope
-- (20 al día). El tope va fijo aquí para que nadie lo cambie desde la app.
create or replace function public.consumir_consulta_syscom()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta integer;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
begin
  if auth.uid() is null then
    return false;
  end if;
  insert into public.syscom_consultas_dia as t (usuario, dia, cuenta)
  values (auth.uid(), v_hoy, 1)
  on conflict (usuario, dia) do update set cuenta = t.cuenta + 1
  returning cuenta into v_cuenta;
  delete from public.syscom_consultas_dia where dia < v_hoy - 30;
  return v_cuenta <= 20;
end;
$$;

revoke all on function public.consumir_consulta_syscom() from public, anon;
grant execute on function public.consumir_consulta_syscom() to authenticated;
revoke all on function public.sincronizar_equipos_modelos() from public, anon, authenticated;

-- Verificación: cuántos modelos quedaron listos para sugerir.
select count(*) as modelos_en_catalogo from public.equipos_modelos;
