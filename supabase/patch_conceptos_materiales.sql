-- ============================================================
-- Sugerencias de materiales aprendidas de los reportes
-- ============================================================
-- En tubería, cable y soportería del reporte, además de las sugerencias de
-- siempre, salen las que el personal ya escribió en otros reportes. Cada
-- concepto se guarda UNA vez sin importar mayúsculas, acentos o espacios
-- («Taquete», «taquete» y «TAQUETE » son el mismo): la «clave» es el texto
-- normalizado y se queda la primera forma en que se escribió.
--
-- Campos: tuberia_medida, tuberia_especifica, cable_tipo, cable_calibre,
-- soporteria_desc, soporteria_medida.
--
-- Ejecutar completo en el SQL Editor de Supabase. Aditivo e idempotente.

create table if not exists public.conceptos_materiales (
  campo text not null,
  clave text not null,
  texto text not null,
  veces integer not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (campo, clave)
);

alter table public.conceptos_materiales enable row level security;
drop policy if exists conceptos_materiales_lectura on public.conceptos_materiales;
create policy conceptos_materiales_lectura on public.conceptos_materiales for select to authenticated using (true);
-- Sin políticas de escritura: solo el trigger escribe.

-- Igual que normalizarConcepto() en lib/conceptosMateriales.ts.
create or replace function public.normalizar_concepto(p_texto text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(
    translate(lower(coalesce(p_texto, '')), 'áéíóúüàèìòùñ', 'aeiouuaeioun'),
    '\s+', ' ', 'g'
  ));
$$;

-- Saca de un reporte los pares (campo, texto) que sirven de sugerencia.
create or replace function public.conceptos_de_reporte(p_data jsonb)
returns table (campo text, texto text)
language sql
immutable
as $$
  select x.campo, trim(regexp_replace(x.texto, '\s+', ' ', 'g'))
  from (
    select 'tuberia_medida' as campo, t->>'medida' as texto from jsonb_array_elements(case when jsonb_typeof(p_data->'tuberias') = 'array' then p_data->'tuberias' else '[]'::jsonb end) t
    union all
    select 'tuberia_especifica', t->>'especifica' from jsonb_array_elements(case when jsonb_typeof(p_data->'tuberias') = 'array' then p_data->'tuberias' else '[]'::jsonb end) t
    union all
    select 'cable_tipo', c->>'tipo' from jsonb_array_elements(case when jsonb_typeof(p_data->'cables') = 'array' then p_data->'cables' else '[]'::jsonb end) c
    union all
    select 'cable_calibre', c->>'calibre' from jsonb_array_elements(case when jsonb_typeof(p_data->'cables') = 'array' then p_data->'cables' else '[]'::jsonb end) c
    union all
    select 'soporteria_desc', s->>'desc' from jsonb_array_elements(case when jsonb_typeof(p_data->'soporteria') = 'array' then p_data->'soporteria' else '[]'::jsonb end) s
    union all
    select 'soporteria_medida', s->>'medida' from jsonb_array_elements(case when jsonb_typeof(p_data->'soporteria') = 'array' then p_data->'soporteria' else '[]'::jsonb end) s
  ) x
  where length(trim(coalesce(x.texto, ''))) between 1 and 80;
$$;

create or replace function public.sincronizar_conceptos_materiales()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.conceptos_materiales as t (campo, clave, texto, veces)
  select n.campo, public.normalizar_concepto(n.texto), min(n.texto), 1
  from public.conceptos_de_reporte(new.data) n
  -- Al corregir un reporte no se vuelve a contar lo que ya traía.
  where tg_op = 'INSERT'
     or not exists (
       select 1 from public.conceptos_de_reporte(old.data) v
       where v.campo = n.campo and public.normalizar_concepto(v.texto) = public.normalizar_concepto(n.texto)
     )
  group by n.campo, public.normalizar_concepto(n.texto)
  on conflict (campo, clave) do update set
    veces = t.veces + 1,
    actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists trg_conceptos_materiales on public.reports;
create trigger trg_conceptos_materiales
  after insert or update of data on public.reports
  for each row execute function public.sincronizar_conceptos_materiales();

revoke all on function public.sincronizar_conceptos_materiales() from public, anon, authenticated;

-- Lo escrito en los reportes de antes también sirve de sugerencia.
insert into public.conceptos_materiales (campo, clave, texto, veces)
select n.campo, public.normalizar_concepto(n.texto), min(n.texto), count(*)
from public.reports r
cross join lateral public.conceptos_de_reporte(r.data) n
group by n.campo, public.normalizar_concepto(n.texto)
on conflict (campo, clave) do nothing;

-- Verificación: cuántas sugerencias quedaron por campo.
select campo, count(*) as sugerencias from public.conceptos_materiales group by campo order by campo;
