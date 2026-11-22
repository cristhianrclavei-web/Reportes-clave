-- Propuestas de cambio y versiones de planos, unifilares y guías
-- (como en git): el técnico edita una COPIA; supervisión compara, acepta
-- cambio por cambio y fusiona con el original. Cada fusión guarda la versión
-- anterior para poder verla o restaurarla.
--
-- · propuestas_cambio: la copia del técnico. `base` = cómo estaba el
--   original cuando empezó (para saber qué cambió él y qué cambió alguien
--   más mientras tanto); `datos` = su versión. Una abierta por persona y
--   documento.
-- · versiones_documento: fotos del original antes de cada fusión o
--   restauración.
-- · Unifilares: los técnicos ya los pueden VER (para proponer cambios); solo
--   supervisión los edita directo.
--
-- El avance de obra, las fallas a tierra y las marcas de las guías NO pasan
-- por aquí: son registros de campo y se guardan directo como siempre.
--
-- Aditivo e idempotente.

create table if not exists public.propuestas_cambio (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('plano', 'unifilar', 'guia')),
  objeto_id uuid not null,
  base jsonb not null check (pg_column_size(base) < 2000000),
  datos jsonb not null check (pg_column_size(datos) < 2000000),
  estado text not null default 'borrador' check (estado in ('borrador', 'enviada', 'aceptada', 'parcial', 'rechazada', 'descartada')),
  comentario text check (char_length(comentario) <= 1000),
  autor_id uuid not null default auth.uid() references public.profiles(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  enviada_en timestamptz,
  revisado_por uuid references public.profiles(id),
  revisado_en timestamptz,
  respuesta text check (char_length(respuesta) <= 1000),
  -- Qué se aceptó y qué no: [{ "id": "...", "texto": "...", "aceptado": true }]
  resultado jsonb check (resultado is null or jsonb_typeof(resultado) = 'array')
);

create index if not exists idx_propuestas_cambio_objeto on public.propuestas_cambio(tipo, objeto_id);
create index if not exists idx_propuestas_cambio_estado on public.propuestas_cambio(estado);
-- Una copia abierta por persona y documento.
create unique index if not exists uq_propuestas_cambio_abierta
  on public.propuestas_cambio(tipo, objeto_id, autor_id) where estado in ('borrador', 'enviada');

alter table public.propuestas_cambio enable row level security;

drop policy if exists propuestas_cambio_select on public.propuestas_cambio;
create policy propuestas_cambio_select on public.propuestas_cambio for select
  using (public.mi_cuenta_activa() and (autor_id = auth.uid() or public.get_my_role() = 'supervisor'));

drop policy if exists propuestas_cambio_insert on public.propuestas_cambio;
create policy propuestas_cambio_insert on public.propuestas_cambio for insert
  with check (public.mi_cuenta_activa() and public.get_my_role() in ('tecnico', 'supervisor') and autor_id = auth.uid() and estado in ('borrador', 'enviada'));

-- El autor edita su copia mientras está abierta (y puede descartarla);
-- supervisión la revisa.
drop policy if exists propuestas_cambio_update on public.propuestas_cambio;
create policy propuestas_cambio_update on public.propuestas_cambio for update
  using (public.mi_cuenta_activa() and ((autor_id = auth.uid() and estado in ('borrador', 'enviada')) or public.get_my_role() = 'supervisor'))
  with check (public.mi_cuenta_activa() and (
    (autor_id = auth.uid() and estado in ('borrador', 'enviada', 'descartada'))
    or public.get_my_role() = 'supervisor'));

drop policy if exists propuestas_cambio_delete on public.propuestas_cambio;
create policy propuestas_cambio_delete on public.propuestas_cambio for delete
  using (public.mi_cuenta_activa() and public.get_my_role() = 'supervisor');

create or replace function public.propuestas_cambio_tocar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.actualizado_en := now();
  -- El autor no puede marcarse aceptada ni cambiar quién revisó.
  if public.get_my_role() <> 'supervisor' then
    new.revisado_por := old.revisado_por;
    new.revisado_en := old.revisado_en;
    new.respuesta := old.respuesta;
    new.resultado := old.resultado;
    new.base := old.base;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_propuestas_cambio_tocar on public.propuestas_cambio;
create trigger trg_propuestas_cambio_tocar
  before update on public.propuestas_cambio
  for each row execute function public.propuestas_cambio_tocar();

create table if not exists public.versiones_documento (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('plano', 'unifilar', 'guia')),
  objeto_id uuid not null,
  datos jsonb not null check (pg_column_size(datos) < 2000000),
  nota text check (char_length(nota) <= 300),
  propuesta_id uuid references public.propuestas_cambio(id) on delete set null,
  creado_por uuid not null default auth.uid() references public.profiles(id),
  creado_en timestamptz not null default now()
);

create index if not exists idx_versiones_documento_objeto on public.versiones_documento(tipo, objeto_id, creado_en desc);

alter table public.versiones_documento enable row level security;

drop policy if exists versiones_documento_select on public.versiones_documento;
create policy versiones_documento_select on public.versiones_documento for select
  using (public.mi_cuenta_activa() and public.get_my_role() in ('tecnico', 'supervisor'));
drop policy if exists versiones_documento_insert on public.versiones_documento;
create policy versiones_documento_insert on public.versiones_documento for insert
  with check (public.mi_cuenta_activa() and public.get_my_role() = 'supervisor' and creado_por = auth.uid());

-- Los técnicos ven los unifilares (para proponer cambios); editar sigue siendo de supervisión.
drop policy if exists unifilares_select on public.unifilares;
create policy unifilares_select on public.unifilares for select
  using (public.get_my_role() in ('supervisor', 'tecnico') and public.mi_cuenta_activa());

notify pgrst, 'reload schema';

-- Comprobar: select tipo, estado, count(*) from public.propuestas_cambio group by 1, 2;
