-- Proyectos como centro de la app: Cliente → Proyecto (la obra) → Sistemas.
--
-- · proyectos: etapa del embudo (Prospecto → Cotizado → Vendido →
--   Instalación → Trámite CFE → Terminado/Interconectado), los sistemas que
--   lleva (detección, CCTV, acceso, solar…), fechas, monto y responsable.
--   La columna vieja `estado` se sigue llenando sola desde la etapa para que
--   nada de lo anterior se rompa.
-- · proyecto_id (opcional) en servicios, cotizaciones, levantamientos,
--   paneles, circuitos, planos, guías y unifilares. Lo que ya existe se
--   queda sin proyecto («Sin proyecto» en la ficha del cliente) hasta que
--   alguien lo mueva. Un trigger impide ligar algo al proyecto de OTRO
--   cliente.
-- · lazo_planos.sistema: el editor de planos sirve para todos los sistemas.
-- · Paneles solares: datos del servicio de CFE y recibos (precio del kWh de
--   cada recibo), dimensionamiento, trámite de interconexión con su
--   expediente y pagos del proyecto.
--
-- Aditivo e idempotente: se puede correr varias veces.

-- ---------------------------------------------------------------------------
-- Proyectos
-- ---------------------------------------------------------------------------

alter table public.proyectos add column if not exists etapa text;
alter table public.proyectos add column if not exists sistemas text[];
alter table public.proyectos add column if not exists fecha_inicio date;
alter table public.proyectos add column if not exists fecha_entrega date;
alter table public.proyectos add column if not exists monto numeric(14, 2) check (monto is null or monto >= 0);
alter table public.proyectos add column if not exists moneda text not null default 'MXN' check (moneda in ('MXN', 'USD'));
alter table public.proyectos add column if not exists responsable_id uuid references public.profiles(id) on delete set null;
alter table public.proyectos add column if not exists etapa_desde timestamptz;

-- Los proyectos de antes: su estado pasa a etapa y su sistema (texto libre) a la clave.
update public.proyectos set etapa = case estado
    when 'propuesta' then 'prospecto'
    when 'en_curso' then 'instalacion'
    else 'terminado' end
  where etapa is null;

update public.proyectos set sistemas = array[case
    when sistema ilike '%solar%' or sistema ilike '%fotovolt%' then 'solar'
    when sistema ilike '%cctv%' or sistema ilike '%c_mara%' or sistema ilike '%video%' then 'cctv'
    when sistema ilike '%acceso%' then 'acceso'
    when sistema ilike '%intrusi%' then 'intrusion'
    when sistema ilike '%detecci%' or sistema ilike '%incendio%' or sistema ilike '%humo%' or sistema ilike '%alarma%' or sistema ilike '%det%' then 'deteccion'
    else 'otro' end]
  where sistemas is null;

-- Primera versión de este patch no reconocía «Alarma & Det»: se corrige.
update public.proyectos set sistemas = array['deteccion']
  where sistemas = array['otro'] and (sistema ilike '%alarma%' or sistema ilike '%det%') and sistema not ilike '%intrusi%';

update public.proyectos set etapa_desde = coalesce(etapa_desde, updated_at) where etapa_desde is null;

alter table public.proyectos alter column etapa set default 'prospecto';
alter table public.proyectos alter column etapa set not null;
alter table public.proyectos alter column sistemas set default array['otro'];
alter table public.proyectos alter column sistemas set not null;

alter table public.proyectos drop constraint if exists proyectos_etapa_check;
alter table public.proyectos add constraint proyectos_etapa_check
  check (etapa in ('prospecto', 'cotizado', 'vendido', 'instalacion', 'tramite_cfe', 'terminado', 'cancelado'));
alter table public.proyectos drop constraint if exists proyectos_sistemas_check;
alter table public.proyectos add constraint proyectos_sistemas_check
  check (cardinality(sistemas) between 1 and 8 and sistemas <@ array['deteccion', 'cctv', 'acceso', 'solar', 'intrusion', 'otro']::text[]);
-- El trámite de CFE solo existe en proyectos con paneles solares.
alter table public.proyectos drop constraint if exists proyectos_tramite_solo_solar;
alter table public.proyectos add constraint proyectos_tramite_solo_solar
  check (etapa <> 'tramite_cfe' or 'solar' = any(sistemas));

-- `estado` (lo que usaba la app antes) se deriva de la etapa.
create or replace function public.proyectos_sincronizar_estado()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.estado := case
    when new.etapa in ('prospecto', 'cotizado') then 'propuesta'
    when new.etapa in ('vendido', 'instalacion', 'tramite_cfe') then 'en_curso'
    else 'concluido' end;
  if new.etapa = 'terminado' and (tg_op = 'INSERT' or old.etapa is distinct from 'terminado') then
    new.concluido_en := coalesce(new.concluido_en, now());
  elsif new.etapa <> 'terminado' then
    new.concluido_en := null;
  end if;
  if tg_op = 'INSERT' or old.etapa is distinct from new.etapa then
    new.etapa_desde := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_proyectos_sincronizar_estado on public.proyectos;
create trigger trg_proyectos_sincronizar_estado
  before insert or update on public.proyectos
  for each row execute function public.proyectos_sincronizar_estado();

create index if not exists idx_proyectos_etapa on public.proyectos(etapa);

-- Los técnicos ven el nombre del proyecto de sus servicios (solo lectura).
drop policy if exists proyectos_tecnico_select on public.proyectos;
create policy proyectos_tecnico_select on public.proyectos for select
  using (public.get_my_role() = 'tecnico' and public.mi_cuenta_activa());

-- ---------------------------------------------------------------------------
-- proyecto_id en todo lo que pertenece a una obra
-- ---------------------------------------------------------------------------

alter table public.servicios_programados add column if not exists proyecto_id uuid references public.proyectos(id) on delete set null;
alter table public.cotizaciones add column if not exists proyecto_id uuid references public.proyectos(id) on delete set null;
alter table public.levantamientos add column if not exists proyecto_id uuid references public.proyectos(id) on delete set null;
alter table public.lazo_paneles add column if not exists proyecto_id uuid references public.proyectos(id) on delete set null;
alter table public.lazos add column if not exists proyecto_id uuid references public.proyectos(id) on delete set null;
alter table public.lazo_planos add column if not exists proyecto_id uuid references public.proyectos(id) on delete set null;
alter table public.guias_conexion add column if not exists proyecto_id uuid references public.proyectos(id) on delete set null;
alter table public.unifilares add column if not exists proyecto_id uuid references public.proyectos(id) on delete set null;

create index if not exists idx_servicios_programados_proyecto on public.servicios_programados(proyecto_id);
create index if not exists idx_cotizaciones_proyecto on public.cotizaciones(proyecto_id);
create index if not exists idx_levantamientos_proyecto on public.levantamientos(proyecto_id);
create index if not exists idx_lazo_paneles_proyecto on public.lazo_paneles(proyecto_id);
create index if not exists idx_lazos_proyecto on public.lazos(proyecto_id);
create index if not exists idx_lazo_planos_proyecto on public.lazo_planos(proyecto_id);
create index if not exists idx_guias_conexion_proyecto on public.guias_conexion(proyecto_id);
create index if not exists idx_unifilares_proyecto on public.unifilares(proyecto_id);

-- Mismo cliente: si la fila trae cliente, debe ser el del proyecto; si no
-- trae, toma el del proyecto. Las plantillas de guías no llevan proyecto.
create or replace function public.validar_proyecto_del_cliente()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cliente_del_proyecto uuid;
begin
  if new.proyecto_id is null then
    return new;
  end if;
  select cliente_id into cliente_del_proyecto from public.proyectos where id = new.proyecto_id;
  if cliente_del_proyecto is null then
    raise exception 'El proyecto no existe';
  end if;
  if new.cliente_id is null then
    new.cliente_id := cliente_del_proyecto;
  elsif new.cliente_id <> cliente_del_proyecto then
    raise exception 'El proyecto es de otro cliente';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['servicios_programados', 'cotizaciones', 'levantamientos', 'lazo_paneles', 'lazos', 'lazo_planos', 'guias_conexion', 'unifilares'] loop
    execute format('drop trigger if exists trg_%s_proyecto_cliente on public.%I', t, t);
    execute format('create trigger trg_%s_proyecto_cliente before insert or update of proyecto_id, cliente_id on public.%I for each row execute function public.validar_proyecto_del_cliente()', t, t);
  end loop;
end $$;

-- Las cotizaciones que ya estaban ligadas con el vínculo de antes
-- (proyecto_cotizaciones) pasan a su proyecto, si son del mismo cliente.
update public.cotizaciones c set proyecto_id = pc.proyecto_id
  from public.proyecto_cotizaciones pc
  join public.proyectos p on p.id = pc.proyecto_id
  where pc.cotizacion_id = c.id and c.proyecto_id is null
    and (c.cliente_id is null or c.cliente_id = p.cliente_id);

-- Una guía plantilla no puede tener proyecto (tampoco tiene cliente).
alter table public.guias_conexion drop constraint if exists guias_conexion_plantilla_sin_proyecto;
alter table public.guias_conexion add constraint guias_conexion_plantilla_sin_proyecto check (not es_plantilla or proyecto_id is null);

-- ---------------------------------------------------------------------------
-- Planos de todos los sistemas
-- ---------------------------------------------------------------------------

alter table public.lazo_planos add column if not exists sistema text not null default 'deteccion';
alter table public.lazo_planos drop constraint if exists lazo_planos_sistema_check;
alter table public.lazo_planos add constraint lazo_planos_sistema_check
  check (sistema in ('deteccion', 'cctv', 'acceso', 'solar', 'intrusion', 'otro'));

-- ---------------------------------------------------------------------------
-- Paneles solares
-- ---------------------------------------------------------------------------

-- Datos del servicio de CFE y el dimensionamiento (uno por proyecto).
create table if not exists public.proyecto_solar (
  proyecto_id uuid primary key references public.proyectos(id) on delete cascade,
  titular text check (char_length(titular) <= 160),
  rpu text check (char_length(rpu) <= 20),
  tarifa text check (char_length(tarifa) <= 12),
  tipo_persona text not null default 'fisica' check (tipo_persona in ('fisica', 'moral')),
  direccion_servicio text check (char_length(direccion_servicio) <= 300),
  -- Horas solares pico al día del lugar y factor de pérdidas del sistema.
  hsp numeric(4, 2) not null default 5.5 check (hsp between 2 and 8),
  factor_perdidas numeric(4, 3) not null default 0.8 check (factor_perdidas between 0.5 and 1),
  -- Lo que se propone: módulos, watts y cuánto del consumo cubrir.
  modulo_w numeric(6, 1) check (modulo_w is null or modulo_w between 50 and 1000),
  modulos integer check (modulos is null or modulos between 1 and 100000),
  cobertura_pct numeric(5, 1) not null default 100 check (cobertura_pct between 10 and 150),
  inversor text check (char_length(inversor) <= 120),
  costo_sistema numeric(14, 2) check (costo_sistema is null or costo_sistema >= 0),
  notas text check (char_length(notas) <= 2000),
  actualizado_por uuid references public.profiles(id),
  actualizado_en timestamptz not null default now()
);

-- Recibos de CFE: consumo e importe de cada periodo. El precio del kWh de
-- cada recibo es importe ÷ kWh, salvo que se capture a mano.
create table if not exists public.recibos_cfe (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  periodo text not null check (char_length(periodo) between 1 and 40),
  fecha_inicio date,
  fecha_fin date,
  kwh numeric(12, 2) not null check (kwh >= 0),
  importe numeric(12, 2) not null check (importe >= 0),
  precio_kwh_manual numeric(8, 4) check (precio_kwh_manual is null or precio_kwh_manual > 0),
  archivo_path text,
  archivo_nombre text,
  creado_por uuid not null default auth.uid() references public.profiles(id),
  creado_en timestamptz not null default now(),
  check (fecha_fin is null or fecha_inicio is null or fecha_fin >= fecha_inicio)
);
create index if not exists idx_recibos_cfe_proyecto on public.recibos_cfe(proyecto_id);

-- Trámite de interconexión (uno por proyecto).
create table if not exists public.tramites_cfe (
  proyecto_id uuid primary key references public.proyectos(id) on delete cascade,
  estado text not null default 'preparando' check (estado in (
    'preparando', 'entregado', 'en_revision', 'observaciones', 'aprobado', 'contrato_firmado', 'medidor_cambiado', 'rechazado')),
  esquema text not null default 'medicion_neta' check (esquema in ('medicion_neta', 'facturacion_neta', 'venta_total')),
  numero_solicitud text check (char_length(numero_solicitud) <= 60),
  oficina text check (char_length(oficina) <= 120),
  fecha_entrega date,
  fecha_aprobacion date,
  fecha_contrato date,
  fecha_medidor date,
  numero_medidor text check (char_length(numero_medidor) <= 60),
  -- Bitácora: [{ "en": iso, "por": nombre, "texto": "...", "estado": "..." }]
  bitacora jsonb not null default '[]'::jsonb check (jsonb_typeof(bitacora) = 'array' and pg_column_size(bitacora) < 200000),
  actualizado_por uuid references public.profiles(id),
  actualizado_en timestamptz not null default now()
);

-- Expediente: un archivo por documento (solicitud, identificación…).
create table if not exists public.tramite_cfe_documentos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  tipo text not null check (char_length(tipo) between 1 and 60),
  archivo_path text not null,
  archivo_nombre text,
  subido_por uuid not null default auth.uid() references public.profiles(id),
  creado_en timestamptz not null default now()
);
create index if not exists idx_tramite_cfe_documentos_proyecto on public.tramite_cfe_documentos(proyecto_id);

-- Pagos del proyecto (anticipo, avances, finiquito) con su comprobante.
create table if not exists public.proyecto_pagos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  fecha date not null,
  monto numeric(14, 2) not null check (monto > 0),
  moneda text not null default 'MXN' check (moneda in ('MXN', 'USD')),
  metodo text not null check (metodo in ('transferencia', 'efectivo', 'cheque', 'tarjeta', 'otro')),
  concepto text not null check (char_length(concepto) between 1 and 120),
  referencia text check (char_length(referencia) <= 120),
  comprobante_path text,
  comprobante_nombre text,
  registrado_por uuid not null default auth.uid() references public.profiles(id),
  creado_en timestamptz not null default now()
);
create index if not exists idx_proyecto_pagos_proyecto on public.proyecto_pagos(proyecto_id);

alter table public.proyecto_solar enable row level security;
alter table public.recibos_cfe enable row level security;
alter table public.tramites_cfe enable row level security;
alter table public.tramite_cfe_documentos enable row level security;
alter table public.proyecto_pagos enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['proyecto_solar', 'recibos_cfe', 'tramites_cfe', 'tramite_cfe_documentos', 'proyecto_pagos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_supervisor_all', t);
    execute format('create policy %I on public.%I for all using (public.get_my_role() = ''supervisor'' and public.mi_cuenta_activa()) with check (public.get_my_role() = ''supervisor'' and public.mi_cuenta_activa())', t || '_supervisor_all', t);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Comprobar:
-- select etapa, sistemas, estado from public.proyectos;
-- select count(*) from public.recibos_cfe;
