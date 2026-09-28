-- ============================================================
-- Facturación por cliente (prefactura + registro del CFDI timbrado)
-- ============================================================
-- Antes se facturaba reporte por reporte (FacturacionSection). Ahora una
-- factura puede agrupar varios reportes de un mismo servicio o proyecto, o
-- uno solo, y opcionalmente la cotización que la originó.
--
-- La app NO timbra: arma la factura con los datos del CFDI 4.0, genera el
-- PDF de PREFACTURA (sin validez fiscal) para revisarla o capturarla en el
-- portal del PAC, y después se registra el folio fiscal / UUID y se
-- adjuntan el PDF y XML timbrados.
--
-- Estados: borrador → timbrada → pagada (o cancelada).
--
-- 1) Datos fiscales del cliente (para no capturarlos en cada factura).
-- 2) facturas + factura_reportes (solo quien tiene permiso de facturación).
-- 3) Sincronización con los reportes: cada reporte ligado refleja en
--    data.facturaEstado / facturaId / facturaFolio el estado de su factura
--    (así el «Por facturar» del resumen sigue funcionando).
--
-- Requiere patch_permisos_almacen_facturacion.sql
-- (puedo_gestionar_facturacion). Ejecutar completo en el SQL Editor de
-- Supabase. Idempotente.

-- ---------- 1) Datos fiscales del cliente ----------
alter table public.clientes add column if not exists razon_social text;
alter table public.clientes add column if not exists rfc text;
alter table public.clientes add column if not exists regimen_fiscal text;
alter table public.clientes add column if not exists cp_fiscal text;
alter table public.clientes add column if not exists uso_cfdi text;

-- ---------- 2) Facturas ----------
create sequence if not exists public.facturas_folio_seq;
grant usage on sequence public.facturas_folio_seq to authenticated;

create table if not exists public.facturas (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('FAC-' || lpad(nextval('public.facturas_folio_seq')::text, 4, '0')),
  cliente_id uuid references public.clientes(id) on delete set null,
  cotizacion_id uuid references public.cotizaciones(id) on delete set null,
  estado text not null default 'borrador' check (estado in ('borrador', 'timbrada', 'pagada', 'cancelada')),
  fecha date not null default current_date,

  -- Receptor (copia al momento de facturar)
  receptor_nombre text not null,
  receptor_rfc text,
  receptor_regimen text,
  receptor_cp text,
  uso_cfdi text,

  -- Pago
  moneda text not null default 'MXN' check (moneda in ('MXN', 'USD')),
  tipo_cambio numeric not null default 1,
  forma_pago text,
  metodo_pago text not null default 'PUE',
  condiciones_pago text,

  -- Conceptos: [{descripcion, cantidad, valor_unitario, unidad_clave,
  -- unidad_nombre, clave_prod_serv, objeto_imp, importe}]
  conceptos jsonb not null default '[]'::jsonb,
  iva_pct numeric not null default 16,
  subtotal numeric not null default 0,
  iva numeric not null default 0,
  total numeric not null default 0,
  notas text,

  -- CFDI timbrado (se llena al registrarlo)
  folio_fiscal text,
  uuid_sat text,
  fecha_timbrado date,
  pdf_path text,
  xml_path text,
  fecha_pago date,

  created_by uuid not null constraint facturas_created_by_profiles_fkey references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.factura_reportes (
  factura_id uuid not null references public.facturas(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  primary key (factura_id, report_id)
);

create index if not exists idx_facturas_cliente on public.facturas(cliente_id);
create index if not exists idx_facturas_fecha on public.facturas(fecha desc);
create index if not exists idx_factura_reportes_report on public.factura_reportes(report_id);

alter table public.facturas enable row level security;
alter table public.factura_reportes enable row level security;

drop policy if exists facturas_facturacion_all on public.facturas;
create policy facturas_facturacion_all on public.facturas for all
  using (public.puedo_gestionar_facturacion())
  with check (public.puedo_gestionar_facturacion());

drop policy if exists factura_reportes_facturacion_all on public.factura_reportes;
create policy factura_reportes_facturacion_all on public.factura_reportes for all
  using (public.puedo_gestionar_facturacion())
  with check (public.puedo_gestionar_facturacion());

-- updated_at
create or replace function public.facturas_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_facturas_touch on public.facturas;
create trigger trg_facturas_touch
  before update on public.facturas
  for each row execute function public.facturas_touch();

-- ---------- 3) Reflejar el estado en los reportes ----------
create or replace function public.sincronizar_reportes_factura(p_factura uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f record;
begin
  select id, estado, folio into f from public.facturas where id = p_factura;
  if f.id is null then
    return;
  end if;

  if f.estado = 'cancelada' then
    update public.reports r
      set data = (coalesce(r.data, '{}'::jsonb) - 'facturaId' - 'facturaFolio')
                 || jsonb_build_object('facturaEstado', 'pendiente')
    where r.id in (select report_id from public.factura_reportes where factura_id = p_factura)
      and r.data ->> 'facturaId' = p_factura::text;
  else
    update public.reports r
      set data = coalesce(r.data, '{}'::jsonb) || jsonb_build_object(
        'facturaEstado', case when f.estado = 'borrador' then 'en_proceso' else 'facturado' end,
        'facturaId', f.id,
        'facturaFolio', f.folio
      )
    where r.id in (select report_id from public.factura_reportes where factura_id = p_factura);
  end if;
end;
$$;

revoke all on function public.sincronizar_reportes_factura(uuid) from public, anon, authenticated;

create or replace function public.trg_factura_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sincronizar_reportes_factura(new.id);
  return new;
end;
$$;

drop trigger if exists trg_facturas_sincronizar on public.facturas;
create trigger trg_facturas_sincronizar
  after insert or update of estado, folio on public.facturas
  for each row execute function public.trg_factura_estado();

create or replace function public.trg_factura_reportes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.sincronizar_reportes_factura(new.factura_id);
    return new;
  end if;
  -- Al quitar un reporte de la factura vuelve a quedar por facturar.
  update public.reports r
    set data = (coalesce(r.data, '{}'::jsonb) - 'facturaId' - 'facturaFolio')
               || jsonb_build_object('facturaEstado', 'pendiente')
  where r.id = old.report_id
    and r.data ->> 'facturaId' = old.factura_id::text;
  return old;
end;
$$;

drop trigger if exists trg_factura_reportes_sincronizar on public.factura_reportes;
create trigger trg_factura_reportes_sincronizar
  after insert or delete on public.factura_reportes
  for each row execute function public.trg_factura_reportes();

-- Verificación: debe dar 1, 1, 5 (tablas y columnas fiscales del cliente).
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'facturas') as facturas,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'factura_reportes') as factura_reportes,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'clientes'
     and column_name in ('razon_social', 'rfc', 'regimen_fiscal', 'cp_fiscal', 'uso_cfdi')) as columnas_fiscales;
