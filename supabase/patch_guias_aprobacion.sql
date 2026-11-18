-- Aprobación de las guías de conexión por el ingeniero.
--
-- · Permiso nuevo en profiles: can_approve_guias («Aprobar guías de conexión»).
-- · Una guía de cliente la ven los técnicos solo cuando está APROBADA (o si la
--   hizo el mismo técnico). Supervisión las ve todas. Las plantillas, todos.
-- · Si alguien cambia el dibujo (equipos, conexiones, pruebas, notas, nombre),
--   la aprobación se quita sola y hay que volver a aprobarla. Marcar
--   conexiones y pruebas (avance) NO la quita.
-- · Solo se aprueba con aprobar_guia(), que revisa el permiso.
-- · Las guías que ya existían quedan aprobadas para no quitárselas a nadie.
--
-- Requiere patch_guias_conexion.sql y patch_sale_a_servicios.sql. Idempotente.

-- ---------- 1) Permiso ----------
alter table public.profiles
  add column if not exists can_approve_guias boolean not null default false;

-- Mismo blindaje que los demás permisos: se agrega la columna a la función
-- vigente (pg_get_functiondef) en lugar de reescribirla.
do $do$
declare
  antes text;
  despues text;
begin
  antes := pg_get_functiondef('public.proteger_columnas_privilegio'::regproc);
  if position('can_approve_guias' in antes) = 0 then
    despues := replace(antes,
      'or new.sale_a_servicios is distinct from old.sale_a_servicios then',
      'or new.sale_a_servicios is distinct from old.sale_a_servicios
     or new.can_approve_guias is distinct from old.can_approve_guias then');
    if despues = antes then
      raise exception 'proteger_columnas_privilegio no tiene la forma esperada; revisar a mano.';
    end if;
    execute despues;
  end if;
end;
$do$;

create or replace function public.puedo_aprobar_guias()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and activo and can_approve_guias);
$$;

-- ---------- 2) Columnas de la aprobación ----------
alter table public.guias_conexion
  add column if not exists aprobada_por uuid references public.profiles(id),
  add column if not exists aprobada_nombre text check (char_length(aprobada_nombre) <= 120),
  add column if not exists aprobada_en timestamptz;

-- Las que ya existían: aprobadas por quien las creó (una sola vez).
do $do$
begin
  if not exists (select 1 from public.guias_conexion where aprobada_en is not null) then
    update public.guias_conexion g
       set aprobada_por = g.creado_por, aprobada_en = g.creado_en,
           aprobada_nombre = coalesce((select full_name from public.profiles where id = g.creado_por), '')
     where not g.es_plantilla;
  end if;
end;
$do$;

-- ---------- 3) Candado: la aprobación solo la pone aprobar_guia() ----------
create or replace function public.proteger_aprobacion_guia()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_aprobando boolean := coalesce(current_setting('app.aprobando_guia', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    -- Una guía nueva nace por aprobar (el SQL Editor sí puede crearla aprobada).
    if not v_aprobando and auth.uid() is not null then
      new.aprobada_por := null;
      new.aprobada_nombre := null;
      new.aprobada_en := null;
    end if;
    return new;
  end if;

  -- Cambió el dibujo: la aprobación ya no vale.
  if new.datos is distinct from old.datos
     or new.nombre is distinct from old.nombre
     or new.sistema is distinct from old.sistema
     or new.descripcion is distinct from old.descripcion then
    new.aprobada_por := null;
    new.aprobada_nombre := null;
    new.aprobada_en := null;
    return new;
  end if;

  if (new.aprobada_por is distinct from old.aprobada_por
      or new.aprobada_en is distinct from old.aprobada_en
      or new.aprobada_nombre is distinct from old.aprobada_nombre)
     and not v_aprobando and auth.uid() is not null then
    raise exception 'Solo quien tiene permiso de aprobar guías puede aprobarlas.';
  end if;
  return new;
end;
$$;

drop trigger if exists guias_conexion_aprobacion on public.guias_conexion;
create trigger guias_conexion_aprobacion
  before insert or update on public.guias_conexion
  for each row execute function public.proteger_aprobacion_guia();

-- p_aprobar = false quita la aprobación (p. ej. se detectó un error).
create or replace function public.aprobar_guia(p_guia uuid, p_aprobar boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_filas integer;
begin
  if not public.puedo_aprobar_guias() then
    raise exception 'No tienes permiso para aprobar guías de conexión.';
  end if;
  select full_name into v_nombre from public.profiles where id = auth.uid();
  perform set_config('app.aprobando_guia', '1', true);
  update public.guias_conexion
     set aprobada_por = case when p_aprobar then auth.uid() end,
         aprobada_nombre = case when p_aprobar then coalesce(v_nombre, '') end,
         aprobada_en = case when p_aprobar then now() end
   where id = p_guia and not es_plantilla;
  get diagnostics v_filas = row_count;
  perform set_config('app.aprobando_guia', '', true);
  if v_filas = 0 then
    raise exception 'No existe esa guía.';
  end if;
end;
$$;

revoke all on function public.aprobar_guia(uuid, boolean) from public, anon;
grant execute on function public.aprobar_guia(uuid, boolean) to authenticated;
revoke all on function public.puedo_aprobar_guias() from public, anon;
grant execute on function public.puedo_aprobar_guias() to authenticated;

-- ---------- 4) Quién ve qué ----------
drop policy if exists guias_conexion_select on public.guias_conexion;
create policy guias_conexion_select on public.guias_conexion for select
  using (
    public.mi_cuenta_activa()
    and (
      public.get_my_role() = 'supervisor'
      or (public.get_my_role() = 'tecnico' and (es_plantilla or aprobada_en is not null or creado_por = auth.uid()))
    )
  );

-- ---------- 5) Para las pruebas: la cuenta de supervisión de Cristhian aprueba ----------
-- (en otra instalación no coincide nadie; después se ajusta en Personal → Usuarios).
update public.profiles p set can_approve_guias = true
  from auth.users u
 where u.id = p.id and u.email = 'cristhianmonster503@gmail.com';

-- Comprobación:
-- select full_name from public.profiles where can_approve_guias;
-- select nombre, aprobada_nombre, aprobada_en from public.guias_conexion;
