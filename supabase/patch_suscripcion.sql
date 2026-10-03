-- ============================================================
-- Suscripción: prueba demo, vencimiento, gracia y solo lectura
-- ============================================================
-- Requiere patch_planes.sql (tabla empresa_plan y mi_plan()).
--
-- Estados (empresa_plan.estado):
--   licencia   sin vencimiento (Clave Inteligente): no se muestra nada.
--   prueba     prueba demo; vence_en = último día de la prueba.
--   activa     suscripción pagada; vence_en = último día pagado.
--   cancelada  el cliente se dio de baja: solo lectura de inmediato.
--
-- Fases que ve la app (estado_suscripcion()):
--   sin_vencimiento · prueba · activa · gracia · vencida
-- Al pasar vence_en hay `dias_gracia` días con aviso rojo; después la app
-- queda en SOLO LECTURA: se puede consultar y descargar todo, pero la base
-- rechaza altas, cambios y borrados hechos por usuarios de la app. Nunca se
-- borra información. Los procesos sin usuario (cron de avisos, firma del
-- cliente por enlace) siguen funcionando.
--
-- Los pagos se registran a mano desde el SQL Editor (ver «Uso» al final).
-- Ejecutar completo en el SQL Editor de Supabase. Idempotente.

-- ---------- 1) Columnas de la suscripción ----------
alter table public.empresa_plan
  add column if not exists estado text not null default 'licencia',
  add column if not exists inicio_en date,
  add column if not exists vence_en date,
  add column if not exists periodo text,
  add column if not exists dias_gracia integer not null default 5,
  add column if not exists usuarios_extra integer not null default 0,
  add column if not exists zona_horaria text not null default 'America/Mexico_City';

alter table public.empresa_plan drop constraint if exists empresa_plan_estado_check;
alter table public.empresa_plan add constraint empresa_plan_estado_check
  check (estado in ('licencia', 'prueba', 'activa', 'cancelada'));
alter table public.empresa_plan drop constraint if exists empresa_plan_periodo_check;
alter table public.empresa_plan add constraint empresa_plan_periodo_check
  check (periodo is null or periodo in ('mensual', 'anual'));
alter table public.empresa_plan drop constraint if exists empresa_plan_vence_check;
alter table public.empresa_plan add constraint empresa_plan_vence_check
  check (estado in ('licencia', 'cancelada') or vence_en is not null);

-- ---------- 2) Historial de pagos ----------
create table if not exists public.suscripcion_pagos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  plan text not null,
  periodo text not null check (periodo in ('mensual', 'anual')),
  monto numeric(12, 2) not null default 0,
  usuarios_extra integer not null default 0,
  referencia text,
  nota text,
  vence_anterior date,
  vence_nuevo date not null
);

alter table public.suscripcion_pagos enable row level security;
drop policy if exists suscripcion_pagos_supervisor on public.suscripcion_pagos;
create policy suscripcion_pagos_supervisor on public.suscripcion_pagos for select
  to authenticated using (public.get_my_role() = 'supervisor');
-- Sin políticas de escritura: solo registrar_pago_suscripcion() (SQL Editor).

-- ---------- 3) Paquetes: usuarios incluidos ----------
-- Mantener igual que PLANES en lib/planes.ts.
create or replace function public.usuarios_del_plan(p_plan text)
returns integer
language sql
immutable
as $$
  select case p_plan when 'campo' then 5 when 'profesional' then 10 else 25 end;
$$;

-- ---------- 4) Estado calculado ----------
create or replace function public.estado_suscripcion()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select e.*, (now() at time zone e.zona_horaria)::date as hoy
    from public.empresa_plan e
  ), f as (
    select p.*,
      case
        when p.estado = 'licencia' then 'sin_vencimiento'
        when p.estado = 'cancelada' then 'vencida'
        when p.hoy <= p.vence_en then p.estado
        when p.hoy <= p.vence_en + p.dias_gracia then 'gracia'
        else 'vencida'
      end as fase
    from p
  )
  select jsonb_build_object(
    'estado', f.estado,
    'fase', f.fase,
    'periodo', f.periodo,
    'inicio_en', f.inicio_en,
    'vence_en', f.vence_en,
    -- Cuenta el día de hoy: el último día de la prueba dice «queda 1 día».
    'dias_restantes', case when f.vence_en is null then null else greatest(f.vence_en - f.hoy + 1, 0) end,
    'fin_gracia', case when f.vence_en is null then null else f.vence_en + f.dias_gracia end,
    'dias_gracia_restantes', case when f.fase = 'gracia' then f.vence_en + f.dias_gracia - f.hoy + 1 else null end,
    'solo_lectura', f.fase = 'vencida'
  )
  from f;
$$;

create or replace function public.suscripcion_solo_lectura()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((public.estado_suscripcion() ->> 'solo_lectura')::boolean, false);
$$;

revoke all on function public.estado_suscripcion() from public, anon;
revoke all on function public.suscripcion_solo_lectura() from public, anon;
grant execute on function public.estado_suscripcion() to authenticated;
grant execute on function public.suscripcion_solo_lectura() to authenticated;

-- mi_plan() ahora incluye la suscripción y si quien pregunta es supervisor
-- (la franja de días se muestra distinto a técnicos y supervisores).
create or replace function public.mi_plan()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'plan', p.plan,
    'modulos', to_jsonb(public.modulos_activos()),
    'limite_usuarios', p.limite_usuarios,
    'usuarios_activos', (select count(*) from public.profiles where coalesce(activo, true)),
    'suscripcion', public.estado_suscripcion(),
    'es_supervisor', coalesce(public.get_my_role() = 'supervisor', false)
  )
  from public.empresa_plan p;
$$;

revoke all on function public.mi_plan() from public, anon;
grant execute on function public.mi_plan() to authenticated;

-- ---------- 5) Solo lectura en la base ----------
-- Trigger por sentencia: solo bloquea a usuarios de la app (auth.uid() no
-- nulo). Cron, service role y la firma del cliente por enlace no se tocan.
create or replace function public.bloquear_si_solo_lectura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and public.suscripcion_solo_lectura() then
    raise exception 'La suscripción venció: la app está en solo lectura. Puedes consultar y descargar; para crear o editar, renueva la suscripción.'
      using errcode = 'P0001';
  end if;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'reports', 'servicios_programados', 'servicio_tecnicos', 'servicio_tareas',
    'servicio_insumos', 'servicio_insumo_estado', 'servicio_resguardos', 'servicio_eventos',
    'actividades', 'actividad_eventos',
    'clientes', 'cliente_contactos', 'cliente_alias',
    'cotizaciones', 'cotizacion_lineas', 'levantamientos', 'levantamiento_sistemas',
    'facturas', 'factura_reportes',
    'proyectos', 'proyecto_documentos', 'proyecto_cotizaciones',
    'mantenimientos_recurrentes', 'rutinas_tareas', 'plantillas_insumos',
    'solicitudes_personal', 'justificaciones_dia', 'vehiculos', 'dias_festivos',
    'almacen_articulos', 'almacen_movimientos', 'almacen_vales', 'almacen_vale_items',
    'almacen_ubicaciones', 'almacen_conteos', 'almacen_conteo_items', 'almacen_traspasos',
    'almacen_equipos_instalados', 'almacen_altas_solicitadas', 'almacen_sistemas'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_solo_lectura on public.%I', t);
      execute format(
        'create trigger trg_solo_lectura before insert or update or delete on public.%I
           for each statement execute function public.bloquear_si_solo_lectura()', t);
    end if;
  end loop;
end $$;

-- ---------- 6) Funciones para ti (solo SQL Editor) ----------
-- Inicia (o reinicia) la prueba demo: paquete Empresa, N días desde hoy.
create or replace function public.iniciar_prueba(p_dias integer default 14)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date;
begin
  select (now() at time zone zona_horaria)::date into v_hoy from public.empresa_plan;
  update public.empresa_plan set
    estado = 'prueba', plan = 'empresa', periodo = null, usuarios_extra = 0,
    limite_usuarios = public.usuarios_del_plan('empresa'),
    inicio_en = v_hoy, vence_en = v_hoy + p_dias - 1, updated_at = now()
  where id;
  return public.estado_suscripcion();
end;
$$;

-- Registra un pago y extiende la suscripción. Si aún no vencía, el periodo
-- nuevo se suma al final del actual; si ya venció (o venía de prueba),
-- arranca hoy.
create or replace function public.registrar_pago_suscripcion(
  p_plan text,
  p_periodo text default 'mensual',
  p_monto numeric default 0,
  p_usuarios_extra integer default 0,
  p_referencia text default null,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.empresa_plan%rowtype;
  v_hoy date;
  v_desde date;
  v_vence date;
begin
  if p_plan not in ('campo', 'profesional', 'empresa') then
    raise exception 'Plan desconocido: %', p_plan;
  end if;
  if p_periodo not in ('mensual', 'anual') then
    raise exception 'Periodo desconocido: % (mensual o anual)', p_periodo;
  end if;

  select * into e from public.empresa_plan;
  v_hoy := (now() at time zone e.zona_horaria)::date;
  v_desde := case when e.estado = 'activa' and e.vence_en >= v_hoy then e.vence_en + 1 else v_hoy end;
  v_vence := (v_desde + case p_periodo when 'anual' then interval '1 year' else interval '1 month' end)::date - 1;

  update public.empresa_plan set
    estado = 'activa', plan = p_plan, periodo = p_periodo,
    usuarios_extra = greatest(p_usuarios_extra, 0),
    limite_usuarios = public.usuarios_del_plan(p_plan) + greatest(p_usuarios_extra, 0),
    inicio_en = coalesce(case when e.estado = 'activa' then e.inicio_en end, v_hoy),
    vence_en = v_vence, updated_at = now()
  where id;

  insert into public.suscripcion_pagos (plan, periodo, monto, usuarios_extra, referencia, nota, vence_anterior, vence_nuevo)
  values (p_plan, p_periodo, p_monto, greatest(p_usuarios_extra, 0), p_referencia, p_nota, e.vence_en, v_vence);

  return public.estado_suscripcion();
end;
$$;

-- Días de cortesía (prueba o suscripción) sin registrar pago.
create or replace function public.extender_suscripcion(p_dias integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.empresa_plan set
    vence_en = greatest(vence_en, (now() at time zone zona_horaria)::date - 1) + p_dias,
    updated_at = now()
  where id and estado in ('prueba', 'activa');
  return public.estado_suscripcion();
end;
$$;

revoke all on function public.iniciar_prueba(integer) from public, anon, authenticated;
revoke all on function public.registrar_pago_suscripcion(text, text, numeric, integer, text, text) from public, anon, authenticated;
revoke all on function public.extender_suscripcion(integer) from public, anon, authenticated;

-- Verificación: Clave Inteligente debe seguir en «licencia» / «sin_vencimiento».
select public.estado_suscripcion() as suscripcion;

-- ============================================================
-- Uso (SQL Editor de la instalación de cada cliente)
-- ============================================================
--   Prueba demo de 14 días:      select iniciar_prueba();
--   Prueba de 30 días:           select iniciar_prueba(30);
--   Pago mensual Profesional:    select registrar_pago_suscripcion('profesional', 'mensual', 2990, 0, 'SPEI 123');
--   Pago anual Empresa + 3 usr:  select registrar_pago_suscripcion('empresa', 'anual', 54900, 3, 'Factura A-12');
--   5 días de cortesía:          select extender_suscripcion(5);
--   Cancelar (solo lectura):     update empresa_plan set estado = 'cancelada';
--   Volver a licencia sin fin:   update empresa_plan set estado = 'licencia', vence_en = null;
--   Ver historial:               select * from suscripcion_pagos order by created_at desc;
