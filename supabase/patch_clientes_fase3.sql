-- ============================================================
-- Clientes fase 3: cotizaciones, levantamientos y servicios
-- ============================================================
-- Lo mismo que ya hacen los reportes (patch_clientes_vinculo_reportes.sql):
--
-- 1) cliente_id en cotizaciones, levantamientos y servicios_programados.
-- 2) vincular_cliente_generico(columna, crear): al guardar, busca al cliente
--    por nombre o alias (sin acentos ni mayúsculas) en la columna indicada.
--      · cotizaciones.empresa y levantamientos.empresa: si no existe, lo
--        crea como «Por revisar».
--      · servicios_programados.proyecto: solo vincula si coincide exacto
--        (el nombre suele llevar la etapa, «PRINT PACK — Etapa 4»), nunca
--        crea clientes.
-- 3) registrar_contacto_documento(): en cotizaciones y levantamientos, el
--    contacto de «Atención» (con teléfono y correo) se agrega al cliente si
--    no estaba, completa sus datos vacíos, y la dirección llena la del
--    cliente si no tenía.
-- 4) Vincula lo que ya existe cuando el nombre coincide exacto.
--
-- Requiere patch_clientes_vinculo_reportes.sql. Ejecutar completo en el SQL
-- Editor de Supabase. Idempotente.

-- ---------- 1) Columnas ----------
alter table public.cotizaciones
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
alter table public.levantamientos
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
alter table public.servicios_programados
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null;

create index if not exists idx_cotizaciones_cliente on public.cotizaciones(cliente_id);
create index if not exists idx_levantamientos_cliente on public.levantamientos(cliente_id);
create index if not exists idx_servicios_cliente on public.servicios_programados(cliente_id);

-- ---------- 2) Vincular (genérico) ----------
-- tg_argv[0] = columna con el nombre; tg_argv[1] = 'crear' | 'solo_vincular'.
create or replace function public.vincular_cliente_generico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_col text := tg_argv[0];
  v_crear boolean := coalesce(tg_argv[1], 'crear') = 'crear';
  v_texto text := to_jsonb(new) ->> v_col;
  v_norm text;
  v_id uuid;
  v_actor uuid;
begin
  if tg_op = 'UPDATE' then
    if v_texto is not distinct from (to_jsonb(old) ->> v_col) then
      return new;
    end if;
    if new.cliente_id is not distinct from old.cliente_id then
      new.cliente_id := null;
    end if;
  end if;

  if new.cliente_id is not null then
    return new;
  end if;

  v_norm := public.normalizar_nombre(v_texto);
  if v_norm = '' then
    return new;
  end if;

  select id into v_id from public.clientes where nombre_norm = v_norm order by created_at limit 1;
  if v_id is null then
    select cliente_id into v_id from public.cliente_alias where alias_norm = v_norm limit 1;
  end if;

  if v_id is null and v_crear then
    v_actor := coalesce(
      auth.uid(),
      (to_jsonb(new) ->> 'created_by')::uuid,
      (to_jsonb(new) ->> 'creado_por')::uuid
    );
    if v_actor is not null then
      insert into public.clientes (nombre, created_by, pendiente_revision)
      values (trim(v_texto), v_actor, true)
      returning id into v_id;
    end if;
  end if;

  new.cliente_id := v_id;
  return new;
end;
$$;

drop trigger if exists trg_vincular_cliente_cotizacion on public.cotizaciones;
create trigger trg_vincular_cliente_cotizacion
  before insert or update of empresa on public.cotizaciones
  for each row execute function public.vincular_cliente_generico('empresa', 'crear');

drop trigger if exists trg_vincular_cliente_levantamiento on public.levantamientos;
create trigger trg_vincular_cliente_levantamiento
  before insert or update of empresa on public.levantamientos
  for each row execute function public.vincular_cliente_generico('empresa', 'crear');

drop trigger if exists trg_vincular_cliente_servicio on public.servicios_programados;
create trigger trg_vincular_cliente_servicio
  before insert or update of proyecto on public.servicios_programados
  for each row execute function public.vincular_cliente_generico('proyecto', 'solo_vincular');

-- ---------- 3) Contacto y dirección desde cotizaciones / levantamientos ----------
create or replace function public.registrar_contacto_documento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := trim(coalesce(new.atencion, ''));
  v_tel text := nullif(trim(coalesce(new.telefono, '')), '');
  v_correo text := nullif(trim(coalesce(new.correo, '')), '');
  v_dir text := nullif(trim(coalesce(new.direccion, '')), '');
  v_id uuid;
begin
  if new.cliente_id is null then
    return new;
  end if;

  if v_dir is not null then
    update public.clientes set direccion = v_dir
    where id = new.cliente_id and (direccion is null or trim(direccion) = '');
  end if;

  if v_nombre = '' then
    return new;
  end if;

  select id into v_id from public.cliente_contactos
  where cliente_id = new.cliente_id
    and public.normalizar_nombre(nombre) = public.normalizar_nombre(v_nombre)
  limit 1;

  if v_id is null then
    insert into public.cliente_contactos (cliente_id, nombre, telefono, correo)
    values (new.cliente_id, v_nombre, v_tel, v_correo);
  else
    update public.cliente_contactos set
      telefono = coalesce(nullif(trim(telefono), ''), v_tel),
      correo = coalesce(nullif(trim(correo), ''), v_correo)
    where id = v_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_contacto_cotizacion on public.cotizaciones;
create trigger trg_contacto_cotizacion
  after insert or update of atencion, telefono, correo, direccion, cliente_id on public.cotizaciones
  for each row execute function public.registrar_contacto_documento();

drop trigger if exists trg_contacto_levantamiento on public.levantamientos;
create trigger trg_contacto_levantamiento
  after insert or update of atencion, telefono, correo, direccion, cliente_id on public.levantamientos
  for each row execute function public.registrar_contacto_documento();

-- ---------- 4) Vincular lo existente (solo coincidencias exactas) ----------
update public.cotizaciones t set cliente_id = c.id
from public.clientes c
where t.cliente_id is null and c.nombre_norm = public.normalizar_nombre(t.empresa);

update public.levantamientos t set cliente_id = c.id
from public.clientes c
where t.cliente_id is null and c.nombre_norm = public.normalizar_nombre(t.empresa);

update public.servicios_programados t set cliente_id = c.id
from public.clientes c
where t.cliente_id is null and c.nombre_norm = public.normalizar_nombre(t.proyecto);

-- Verificación: cuántos quedaron vinculados en cada tabla.
select
  (select count(*) filter (where cliente_id is not null) || ' de ' || count(*) from public.cotizaciones) as cotizaciones,
  (select count(*) filter (where cliente_id is not null) || ' de ' || count(*) from public.levantamientos) as levantamientos,
  (select count(*) filter (where cliente_id is not null) || ' de ' || count(*) from public.servicios_programados) as servicios;
