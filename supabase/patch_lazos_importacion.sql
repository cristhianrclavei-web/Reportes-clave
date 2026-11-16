-- Direcciones a 3 dígitos y plantilla de importación de DXF por cliente.
--
-- 1) Las direcciones se guardan siempre con 3 dígitos, como se escriben en el
--    panel: D008, M012. Antes la app guardaba «D8» y el DXF «D008», así que
--    la misma dirección podía quedar dos veces sin que la app lo notara.
--    Aquí se pasan las viejas. No se anota en el historial (no cambia nada
--    de lo que se ve: L01D008 ya se mostraba así).
-- 2) Plantilla por cliente: qué tipo de equipo es cada bloque del DXF
--    (DET-PHOTO = detector de humo…). El siguiente plano del mismo cliente
--    ya llega con los bloques asignados.
-- Se puede correr más de una vez.

-- ---------- 1) Direcciones ----------
alter table public.lazo_elementos disable trigger lazo_elementos_historial;
update public.lazo_elementos
   set direccion = left(direccion, 1) || lpad(substr(direccion, 2), 3, '0')
 where direccion ~ '^[DM][0-9]{1,2}$';
alter table public.lazo_elementos enable trigger lazo_elementos_historial;

-- ---------- 2) Plantilla por cliente ----------
create table if not exists public.lazo_plantillas_dxf (
  cliente_id uuid primary key references public.clientes(id) on delete cascade,
  -- {"DET-PHOTO": "SH", "EMAN": "EMA", "SIRENA": ""}: "" = no se importa.
  tipos jsonb not null default '{}'::jsonb check (jsonb_typeof(tipos) = 'object' and pg_column_size(tipos) < 100000),
  actualizado_por uuid references public.profiles(id),
  actualizado_en timestamptz not null default now()
);

alter table public.lazo_plantillas_dxf enable row level security;
-- La usa quien sube planos (técnicos y supervisión), igual que los planos.
drop policy if exists lazo_plantillas_dxf_leer on public.lazo_plantillas_dxf;
create policy lazo_plantillas_dxf_leer on public.lazo_plantillas_dxf for select to authenticated using (public.mi_cuenta_activa());
drop policy if exists lazo_plantillas_dxf_alta on public.lazo_plantillas_dxf;
create policy lazo_plantillas_dxf_alta on public.lazo_plantillas_dxf for insert to authenticated with check (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa());
drop policy if exists lazo_plantillas_dxf_cambio on public.lazo_plantillas_dxf;
create policy lazo_plantillas_dxf_cambio on public.lazo_plantillas_dxf for update to authenticated using (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa()) with check (public.get_my_role() in ('tecnico', 'supervisor') and public.mi_cuenta_activa());
grant select, insert, update on public.lazo_plantillas_dxf to authenticated;

-- Verificación: direcciones_cortas = 0, tabla = 1.
select
  (select count(*) from public.lazo_elementos where direccion ~ '^[DM][0-9]{1,2}$') as direcciones_cortas,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'lazo_plantillas_dxf') as tabla;
