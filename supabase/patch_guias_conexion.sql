-- Guías de conexión: el diagrama de cómo se conecta una instalación (qué
-- equipos, qué borne va con qué borne, de qué color el cable), sus pruebas
-- de puesta en marcha y las notas del ingeniero. Sirven para que un técnico
-- que no domina el sistema pueda conectarlo sin que se lo expliquen por
-- teléfono (app/guias, lib/guias.ts).
--
-- Una guía puede ser PLANTILLA (se reutiliza) o ser de un cliente y, si se
-- quiere, de un servicio. Todo el dibujo va en `datos` (jsonb) y lo que el
-- técnico va marcando en `avance` (jsonb).
--
-- Aditivo e idempotente: se puede correr varias veces.

create table if not exists public.guias_conexion (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 1 and 120),
  -- El sistema, con los mismos nombres del reporte («Control de acceso», «Paneles solares»…).
  sistema text not null check (char_length(sistema) between 1 and 60),
  descripcion text check (char_length(descripcion) <= 600),
  es_plantilla boolean not null default false,
  cliente_id uuid references public.clientes(id) on delete cascade,
  -- El proyecto (grupo de días) del servicio al que se pegó. Sin llave foránea:
  -- grupo_id no es llave de ninguna tabla.
  servicio_grupo_id uuid,
  datos jsonb not null default '{"equipos": [], "conexiones": [], "pruebas": [], "notas": [], "fotos": []}'::jsonb
    check (jsonb_typeof(datos -> 'equipos') = 'array' and jsonb_typeof(datos -> 'conexiones') = 'array' and pg_column_size(datos) < 500000),
  avance jsonb not null default '{"conexiones": {}, "pruebas": {}}'::jsonb
    check (jsonb_typeof(avance -> 'conexiones') = 'object' and jsonb_typeof(avance -> 'pruebas') = 'object' and pg_column_size(avance) < 500000),
  creado_por uuid not null default auth.uid() references public.profiles(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  -- Una plantilla no es de ningún cliente.
  check (not es_plantilla or cliente_id is null)
);

create index if not exists idx_guias_conexion_cliente on public.guias_conexion(cliente_id);
create index if not exists idx_guias_conexion_servicio on public.guias_conexion(servicio_grupo_id);

alter table public.guias_conexion enable row level security;

-- Igual que los lazos: técnicos y supervisión leen, crean y corrigen; solo
-- supervisión borra.
drop policy if exists guias_conexion_select on public.guias_conexion;
create policy guias_conexion_select on public.guias_conexion for select
  using (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa());
drop policy if exists guias_conexion_insert on public.guias_conexion;
create policy guias_conexion_insert on public.guias_conexion for insert
  with check (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa() and creado_por = auth.uid());
drop policy if exists guias_conexion_update on public.guias_conexion;
create policy guias_conexion_update on public.guias_conexion for update
  using (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa());
drop policy if exists guias_conexion_delete on public.guias_conexion;
create policy guias_conexion_delete on public.guias_conexion for delete
  using (public.get_my_role() = 'supervisor' and public.mi_cuenta_activa());

-- Marcar (o desmarcar) UNA conexión o UNA prueba sin pisar lo que otro
-- técnico marcó al mismo tiempo: solo se toca esa llave del jsonb.
-- p_tipo: 'conexiones' o 'pruebas'. p_valor null = quitar la marca.
-- Corre con los permisos de quien llama (la RLS de arriba decide).
create or replace function public.marcar_guia_conexion(p_guia uuid, p_tipo text, p_item text, p_valor jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_tipo not in ('conexiones', 'pruebas') then
    raise exception 'Tipo no válido';
  end if;
  if char_length(p_item) > 60 then
    raise exception 'Identificador no válido';
  end if;
  if p_valor is null then
    update public.guias_conexion
      set avance = avance #- array[p_tipo, p_item], actualizado_en = now()
      where id = p_guia;
  else
    update public.guias_conexion
      set avance = jsonb_set(avance, array[p_tipo, p_item], p_valor, true), actualizado_en = now()
      where id = p_guia;
  end if;
  if not found then
    raise exception 'No existe esa guía o no tienes permiso';
  end if;
end;
$$;

revoke all on function public.marcar_guia_conexion(uuid, text, text, jsonb) from public;
grant execute on function public.marcar_guia_conexion(uuid, text, text, jsonb) to authenticated;
