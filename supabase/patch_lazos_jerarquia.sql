-- Diagramas y planos por jerarquía: Cliente > Panel > Plano/Circuito > Dispositivo.
--
--   lazo_paneles.cliente_id   (ya existía)
--   lazo_planos.cliente_id    (ya existía; un plano es de un cliente y puede
--                              tener equipos de varios de sus paneles)
--   lazos.panel_id            (ya existía: el circuito es de un panel)
--   lazo_elementos.lazo_id    (circuito del dispositivo, ya existía)
--   lazo_elementos.plano_id   NUEVO: en qué plano está colocado. Lo mantiene
--                             la base sola cada vez que se guarda un plano.
--
-- Y la base valida que todo sea del mismo cliente:
--   · un circuito solo se liga a un panel de su cliente;
--   · un panel con circuitos no se puede pasar a otro cliente;
--   · un plano solo puede tener dispositivos y paneles de su cliente;
--   · un dispositivo no se puede mover a un circuito de otro cliente.
--
-- Migración: llena plano_id de los dispositivos que ya están en un plano
-- (HSMCH Capital Norte) a partir de lo colocado. No borra nada.
-- Requiere patch_lazos*.sql. Se puede correr más de una vez.

-- ---------- 1) Columna nueva ----------
alter table public.lazo_elementos add column if not exists plano_id uuid references public.lazo_planos(id) on delete set null;
create index if not exists lazo_elementos_plano on public.lazo_elementos (plano_id);
comment on column public.lazo_elementos.plano_id is 'Plano donde está colocado el dispositivo. Lo mantiene la base al guardar el plano.';

-- El historial del lazo no anota plano_id (cambia solo, al guardar un plano).
create or replace function public.lazo_registrar_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes jsonb;
  v_despues jsonb;
  v_fila jsonb;
  v_lazo uuid;
  v_elemento uuid;
  v_accion text;
  -- Columnas que no dicen nada al leer el historial.
  -- plano_id lo mantiene la base sola al guardar un plano (patch_lazos_jerarquia.sql).
  v_ignorar text[] := array['creado_en', 'creado_por', 'abierta_por', 'plano_id'];
begin
  if TG_OP <> 'INSERT' then v_antes := to_jsonb(old) - v_ignorar; end if;
  if TG_OP <> 'DELETE' then v_despues := to_jsonb(new) - v_ignorar; end if;
  v_fila := coalesce(v_despues, v_antes);

  -- Borrar un lazo completo: se va también su historial.
  if TG_TABLE_NAME = 'lazos' and TG_OP = 'DELETE' then
    delete from public.lazo_historial where lazo_id = old.id;
    return null;
  end if;

  if TG_TABLE_NAME = 'lazos' then
    v_lazo := (v_fila->>'id')::uuid;
  elsif TG_TABLE_NAME = 'lazo_elementos' then
    v_lazo := (v_fila->>'lazo_id')::uuid;
    v_elemento := (v_fila->>'id')::uuid;
  elsif TG_TABLE_NAME = 'lazo_fallas' then
    v_lazo := (v_fila->>'lazo_id')::uuid;
    v_elemento := (v_fila->>'elemento_id')::uuid;
  else
    select f.lazo_id into v_lazo from public.lazo_fallas f where f.id = (v_fila->>'falla_id')::uuid;
    v_elemento := (v_fila->>'elemento_id')::uuid;
  end if;

  -- Borrados en cascada de un lazo que ya no existe: nada que anotar.
  if v_lazo is null or not exists (select 1 from public.lazos where id = v_lazo) then
    return null;
  end if;

  if TG_OP = 'UPDATE' then
    -- Solo los campos que cambiaron. Un reintento sin cambios no se anota.
    select jsonb_object_agg(a.key, a.value) into v_antes
      from jsonb_each(to_jsonb(old) - v_ignorar) a
      where (to_jsonb(new) - v_ignorar)->a.key is distinct from a.value;
    if v_antes is null then return null; end if;
    select jsonb_object_agg(d.key, d.value) into v_despues
      from jsonb_each(to_jsonb(new) - v_ignorar) d
      where (to_jsonb(old) - v_ignorar)->d.key is distinct from d.value;
  end if;

  v_accion := case TG_OP when 'INSERT' then 'alta' when 'UPDATE' then 'cambio' else 'baja' end;

  insert into public.lazo_historial (lazo_id, tabla, registro_id, elemento_id, accion, antes, despues, usuario)
  values (v_lazo, TG_TABLE_NAME, (v_fila->>'id')::uuid, v_elemento, v_accion, v_antes, v_despues, auth.uid());

  return null;
end;
$$;

-- ---------- 2) Circuito ↔ panel del mismo cliente ----------
create or replace function public.lazos_validar_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.panel_id is not null and not exists (
    select 1 from public.lazo_paneles p where p.id = new.panel_id and p.cliente_id = new.cliente_id
  ) then
    raise exception 'Ese panel es de otro cliente: elige un panel de este cliente.';
  end if;
  -- Cambiar el cliente de un circuito que ya tiene equipos en un plano de su cliente anterior.
  if TG_OP = 'UPDATE' and new.cliente_id is distinct from old.cliente_id and exists (
    select 1 from public.lazo_elementos e join public.lazo_planos pl on pl.id = e.plano_id
     where e.lazo_id = new.id and pl.cliente_id <> new.cliente_id
  ) then
    raise exception 'Este circuito tiene dispositivos en planos de su cliente: quítalos del plano antes de cambiar el cliente.';
  end if;
  return new;
end;
$$;

drop trigger if exists lazos_validar_cliente on public.lazos;
create trigger lazos_validar_cliente before insert or update of cliente_id, panel_id on public.lazos
  for each row execute function public.lazos_validar_cliente();

create or replace function public.lazo_paneles_validar_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cliente_id is distinct from old.cliente_id and exists (
    select 1 from public.lazos l where l.panel_id = new.id and l.cliente_id <> new.cliente_id
  ) then
    raise exception 'Este panel tiene circuitos: no se puede pasar a otro cliente.';
  end if;
  return new;
end;
$$;

drop trigger if exists lazo_paneles_validar_cliente on public.lazo_paneles;
create trigger lazo_paneles_validar_cliente before update of cliente_id on public.lazo_paneles
  for each row execute function public.lazo_paneles_validar_cliente();

-- ---------- 3) Plano: solo equipos de su cliente ----------
-- Los dispositivos que todavía no llegan a la base (se capturaron sin señal
-- y están en la cola) no se revisan aquí: se revisan al llegar (paso 4).
create or replace function public.lazo_planos_validar_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ajeno text;
begin
  select coalesce(e.direccion, e.nombre) into v_ajeno
    from jsonb_array_elements(coalesce(new.sembrado -> 'equipos', '[]'::jsonb)) q
    join public.lazo_elementos e on e.id::text = q ->> 'elementoId'
    join public.lazos l on l.id = e.lazo_id
   where l.cliente_id <> new.cliente_id
   limit 1;
  if found then
    raise exception 'El plano tiene un dispositivo de otro cliente (%). Quítalo del plano.', v_ajeno;
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(new.sembrado -> 'equipos', '[]'::jsonb)) q
      join public.lazo_paneles p on p.id::text = q ->> 'panelId'
     where p.cliente_id <> new.cliente_id
  ) then
    raise exception 'El plano tiene el panel de otro cliente. Quítalo del plano.';
  end if;
  return new;
end;
$$;

drop trigger if exists lazo_planos_validar_cliente on public.lazo_planos;
create trigger lazo_planos_validar_cliente before insert or update of sembrado, cliente_id on public.lazo_planos
  for each row execute function public.lazo_planos_validar_cliente();

-- Después de guardar: cada dispositivo colocado apunta a este plano, y los
-- que se quitaron dejan de apuntar a él.
create or replace function public.lazo_planos_ligar_elementos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lazo_elementos e
     set plano_id = null
   where e.plano_id = new.id
     and not exists (
       select 1 from jsonb_array_elements(coalesce(new.sembrado -> 'equipos', '[]'::jsonb)) q
        where q ->> 'elementoId' = e.id::text
     );
  update public.lazo_elementos e
     set plano_id = new.id
    from jsonb_array_elements(coalesce(new.sembrado -> 'equipos', '[]'::jsonb)) q
   where q ->> 'elementoId' = e.id::text
     and e.plano_id is distinct from new.id;
  return null;
end;
$$;

drop trigger if exists lazo_planos_ligar_elementos on public.lazo_planos;
create trigger lazo_planos_ligar_elementos after insert or update of sembrado on public.lazo_planos
  for each row execute function public.lazo_planos_ligar_elementos();

-- ---------- 4) Dispositivo: su plano y su circuito, del mismo cliente ----------
create or replace function public.lazo_elementos_validar_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente uuid;
begin
  select l.cliente_id into v_cliente from public.lazos l where l.id = new.lazo_id;
  -- Llega después que el plano (capturado sin señal): se busca dónde está colocado.
  if TG_OP = 'INSERT' and new.plano_id is null then
    select p.id into new.plano_id
      from public.lazo_planos p
     where p.cliente_id = v_cliente
       and p.sembrado -> 'equipos' @> jsonb_build_array(jsonb_build_object('elementoId', new.id::text))
     limit 1;
  end if;
  if new.plano_id is not null and not exists (
    select 1 from public.lazo_planos p where p.id = new.plano_id and p.cliente_id = v_cliente
  ) then
    raise exception 'Este dispositivo está en un plano de otro cliente: no se puede pasar a este circuito.';
  end if;
  return new;
end;
$$;

drop trigger if exists lazo_elementos_validar_cliente on public.lazo_elementos;
create trigger lazo_elementos_validar_cliente before insert or update of lazo_id, plano_id on public.lazo_elementos
  for each row execute function public.lazo_elementos_validar_cliente();

revoke all on function public.lazos_validar_cliente() from public, anon, authenticated;
revoke all on function public.lazo_paneles_validar_cliente() from public, anon, authenticated;
revoke all on function public.lazo_planos_validar_cliente() from public, anon, authenticated;
revoke all on function public.lazo_planos_ligar_elementos() from public, anon, authenticated;
revoke all on function public.lazo_elementos_validar_cliente() from public, anon, authenticated;

-- ---------- 4b) Resumen de cada plano para la lista ----------
-- Se piden junto con el plano («select=id,nombre,equipos_en_plano,...»):
-- cuántos equipos tiene colocados y de qué paneles son sus dispositivos.
create or replace function public.equipos_en_plano(p public.lazo_planos)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_array_length(p.sembrado -> 'equipos'), 0);
$$;

create or replace function public.paneles_en_plano(p public.lazo_planos)
returns uuid[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(distinct x.panel_id), '{}')
  from (
    select l.panel_id from public.lazo_elementos e join public.lazos l on l.id = e.lazo_id
     where e.plano_id = p.id and l.panel_id is not null
    union
    select (q ->> 'panelId')::uuid from jsonb_array_elements(coalesce(p.sembrado -> 'equipos', '[]'::jsonb)) q
     where q ->> 'panelId' ~ '^[0-9a-f-]{36}$'
  ) x;
$$;

grant execute on function public.equipos_en_plano(public.lazo_planos) to authenticated;
grant execute on function public.paneles_en_plano(public.lazo_planos) to authenticated;

-- ---------- 5) Migración de lo que ya existe ----------
-- Cada dispositivo colocado apunta a su plano (si está en dos, al más reciente).
update public.lazo_elementos e
   set plano_id = x.plano_id
  from (
    select distinct on (q ->> 'elementoId') q ->> 'elementoId' as elemento, p.id as plano_id
      from public.lazo_planos p, jsonb_array_elements(coalesce(p.sembrado -> 'equipos', '[]'::jsonb)) q
     where q ->> 'elementoId' is not null
     order by q ->> 'elementoId', p.actualizado_en desc
  ) x
 where x.elemento = e.id::text
   and e.plano_id is distinct from x.plano_id;

-- Verificación: lo que no cuadra debe salir en 0.
select
  (select count(*) from public.lazo_elementos where plano_id is not null) as dispositivos_en_plano,
  (select count(*) from public.lazos l join public.lazo_paneles p on p.id = l.panel_id where p.cliente_id <> l.cliente_id) as circuitos_con_panel_ajeno,
  (select count(*) from public.lazo_elementos e join public.lazos l on l.id = e.lazo_id join public.lazo_planos p on p.id = e.plano_id where p.cliente_id <> l.cliente_id) as dispositivos_en_plano_ajeno;
