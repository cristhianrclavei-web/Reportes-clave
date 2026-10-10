-- ============================================================
-- Auditoría de seguridad 2 (2026-10-10)
-- ============================================================
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente: se puede
-- correr más de una vez.
--
-- ANTES de correrlo, en el panel de Supabase:
--   Authentication → Sign In / Providers → apagar «Allow new users to sign up».
-- Las altas desde Personal → Usuarios siguen funcionando, porque usan la
-- llave de servidor y no el registro público.
--
-- Qué cierra:
--   1. Registrarse desde fuera eligiendo el rol de supervisor.
--   2. Que un técnico cambie el plan de su servicio (geocerca, fecha, horario).
--   3. Datos que se podían leer o escribir sin iniciar sesión.
--   4. El enlace público de la cotización entregaba la fila completa.
--   5. Que un técnico cree un reporte con la corrección ya habilitada.

-- ============================================================
-- 1) El rol ya no sale de lo que manda quien se registra
-- ============================================================
-- El trigger copiaba el rol de los metadatos de la cuenta nueva, y esos
-- metadatos los escribe quien se registra. Ahora toda cuenta nace como
-- técnico; el rol real lo pone después /api/usuarios con la llave de servidor.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'tecnico'
  );
  return new;
end;
$$;

-- ============================================================
-- 2) El plan del servicio solo lo cambia un supervisor
-- ============================================================
-- La política de técnicos deja actualizar cualquier columna de sus servicios
-- (la necesitan para marcar llegada, inicio, pausas y cierre). Sin este
-- candado podían, llamando a la base directo, mover la ubicación, agrandar
-- la geocerca o cambiar la fecha y el horario programados.
create or replace function public.proteger_plan_servicio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sin usuario: tareas del servidor (cron, llave de servidor). Dentro de
  -- otro trigger: cambios que hace la propia base.
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return new;
  end if;
  if public.get_my_role() = 'supervisor' then
    return new;
  end if;
  if new.proyecto is distinct from old.proyecto
     or new.descripcion is distinct from old.descripcion
     or new.fecha is distinct from old.fecha
     or new.cliente_id is distinct from old.cliente_id
     or new.creado_por is distinct from old.creado_por
     or new.grupo_id is distinct from old.grupo_id
     or new.numero_dia is distinct from old.numero_dia
     or new.dias_totales is distinct from old.dias_totales
     or new.duracion_estimada_min is distinct from old.duracion_estimada_min
     or new.hora_programada is distinct from old.hora_programada
     or new.hora_salida_programada is distinct from old.hora_salida_programada
     or new.ubicacion_programada is distinct from old.ubicacion_programada
     or new.radio_geocerca_m is distinct from old.radio_geocerca_m then
    raise exception 'Solo un supervisor puede cambiar el plan del servicio (fecha, horario, ubicación o geocerca).';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_plan_servicio on public.servicios_programados;
create trigger trg_proteger_plan_servicio
  before update on public.servicios_programados
  for each row execute function public.proteger_plan_servicio();

-- ============================================================
-- 3) Lo que se alcanzaba sin iniciar sesión
-- ============================================================
-- 3a) La vista de existencias corría con los permisos de su dueño y se
--     saltaba la RLS. Con security_invoker respeta las políticas de
--     almacen_movimientos (cualquier cuenta con sesión; nadie sin sesión).
alter view public.almacen_existencias set (security_invoker = true);
revoke all on public.almacen_existencias from anon;

-- 3b) Estas dos funciones devuelven ids de usuarios y no revisan quién
--     llama. Las usan la app (con sesión) y el servidor; nadie más.
revoke all on function public.destinatarios_notificacion_tipo(text, text) from public, anon;
grant execute on function public.destinatarios_notificacion_tipo(text, text) to authenticated, service_role;
revoke all on function public.filtrar_por_preferencia(uuid[], text) from public, anon;
grant execute on function public.filtrar_por_preferencia(uuid[], text) to authenticated, service_role;

-- 3c) El registro de descargas aceptaba filas de cualquiera, incluso sin
--     sesión y a nombre de otra persona.
drop policy if exists "auditoria_descargas_insert_app" on public.auditoria_descargas;
create policy "auditoria_descargas_insert_app"
  on public.auditoria_descargas for insert
  to authenticated
  with check (user_id = auth.uid());

-- ============================================================
-- 4) El enlace público de la cotización solo entrega lo que se imprime
-- ============================================================
-- Devolvía la fila completa de la cotización: quien tuviera el enlace podía
-- pedir también la firma de quien aprobó y las notas internas del asistente.
-- Ahora solo salen las columnas de la lista; una columna nueva no se publica
-- sola, hay que agregarla aquí.
create or replace function public.obtener_cotizacion_publica(p_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  cot record;
  v_publicas constant text[] := array[
    'id', 'folio', 'fecha', 'estado', 'atencion', 'empresa', 'telefono', 'correo', 'direccion',
    'forma_pago', 'tiempo_entrega', 'garantia', 'vigencia_dias', 'notas',
    'firmante_nombre', 'firmante_correo', 'iva_pct', 'subtotal', 'iva', 'total',
    'moneda', 'tipo_cambio', 'presentacion_precios'
  ];
  v_cotizacion jsonb;
  resultado json;
begin
  select * into cot from public.cotizaciones
    where id = p_id and estado in ('aprobada', 'enviada');

  if not found then
    return null;
  end if;

  select jsonb_object_agg(c.key, c.value) into v_cotizacion
  from jsonb_each(to_jsonb(cot)) c
  where c.key = any(v_publicas);

  select json_build_object(
    'cotizacion', v_cotizacion,
    -- Solo lo que se imprime: sin costo, margen ni enlace interno.
    'lineas', (
      select coalesce(json_agg(json_build_object(
        'id', l.id,
        'cotizacion_id', l.cotizacion_id,
        'sistema', l.sistema,
        'orden', l.orden,
        'descripcion', l.descripcion,
        'unidad', l.unidad,
        'cantidad', l.cantidad,
        'precio_unitario', l.precio_unitario,
        'importe', l.importe
      ) order by l.orden), '[]'::json)
      from public.cotizacion_lineas l
      where l.cotizacion_id = p_id
    )
  ) into resultado;

  return resultado;
end;
$$;

grant execute on function public.obtener_cotizacion_publica(uuid) to anon, authenticated;

-- ============================================================
-- 5) Un reporte nuevo nunca nace con la corrección habilitada
-- ============================================================
-- El candado de corrección solo vigilaba los cambios (UPDATE). Creando el
-- reporte por fuera de la app con correccion_habilitada = true, un técnico
-- se dejaba el reporte editable para siempre.
create or replace function public.proteger_correccion_al_crear()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and public.get_my_role() is distinct from 'supervisor' then
    new.correccion_habilitada := false;
    new.correccion_por := null;
    new.correccion_en := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_correccion_al_crear on public.reports;
create trigger trg_proteger_correccion_al_crear
  before insert on public.reports
  for each row execute function public.proteger_correccion_al_crear();

-- ============================================================
-- Verificación: las cinco filas deben decir «true»
-- ============================================================
select 'el rol ya no sale de los metadatos' as revision,
       position('raw_user_meta_data->>''role''' in pg_get_functiondef('public.handle_new_user'::regproc)) = 0 as ok
union all
select 'candado del plan del servicio',
       exists (select 1 from pg_trigger where tgname = 'trg_proteger_plan_servicio')
union all
select 'candado de corrección al crear',
       exists (select 1 from pg_trigger where tgname = 'trg_proteger_correccion_al_crear')
union all
select 'sin sesión no se listan destinatarios',
       not has_function_privilege('anon', 'public.destinatarios_notificacion_tipo(text, text)', 'execute')
       and not has_function_privilege('anon', 'public.filtrar_por_preferencia(uuid[], text)', 'execute')
union all
select 'sin sesión no se leen existencias',
       not has_table_privilege('anon', 'public.almacen_existencias', 'select');

-- Cuentas creadas en los últimos 60 días: revisa que las reconozcas todas.
select u.email, p.full_name, p.role, p.activo, u.created_at
from auth.users u join public.profiles p on p.id = u.id
where u.created_at > now() - interval '60 days'
order by u.created_at desc;
