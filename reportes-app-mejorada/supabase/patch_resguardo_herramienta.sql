-- ============================================================
-- Resguardo firmado de herramienta: entrega, devolución y recepción
-- ============================================================
-- Marcar casillas no basta para deslindar responsabilidades: si al final
-- falta un taladro, una palomita no distingue "nunca me lo dieron" de "se me
-- perdió". El ciclo queda así:
--
--   1. El técnico marca lo que recibe y FIRMA el resguardo de salida. La
--      lista se congela en ese momento (items).
--   2. Al volver marca lo que regresa y firma la devolución. Lo que no
--      regresa exige un motivo: no puede quedar como casilla en blanco.
--   3. El supervisor confirma la recepción en almacén y cierra el ciclo.
--
-- Solo el técnico marca las casillas; el supervisor ve, recibe y confirma.
--
-- Ejecutar completo en el SQL Editor de Supabase, DESPUÉS de
-- patch_insumos_checklist.sql. Idempotente.

-- 1) Motivo cuando algo no regresa.
alter table public.servicio_insumo_estado
  add column if not exists motivo_faltante text,
  add column if not exists nota_faltante text;

alter table public.servicio_insumo_estado drop constraint if exists insumo_motivo_faltante_check;
alter table public.servicio_insumo_estado
  add constraint insumo_motivo_faltante_check
  check (motivo_faltante is null or motivo_faltante in ('en_obra', 'danado', 'perdido', 'otro'));

-- 2) Los dos documentos firmados por día: salida y devolución.
create table if not exists public.servicio_resguardos (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios_programados(id) on delete cascade,
  tipo text not null check (tipo in ('salida', 'devolucion')),
  firmado_por uuid not null references public.profiles(id),
  firmado_en timestamptz not null default now(),
  firma_path text,
  -- Copia de la lista tal como estaba al firmar. Si después se edita el
  -- checklist, el documento firmado no cambia: eso es lo que le da valor.
  items jsonb not null default '[]'::jsonb,
  -- Solo para la devolución: el supervisor acusa recibo en almacén.
  recibido_por uuid references public.profiles(id),
  recibido_en timestamptz,
  unique (servicio_id, tipo)
);

create index if not exists idx_resguardos_servicio on public.servicio_resguardos(servicio_id);

alter table public.servicio_resguardos enable row level security;

-- El técnico firma los resguardos de los servicios donde está asignado.
drop policy if exists resguardos_tecnico_select on public.servicio_resguardos;
create policy resguardos_tecnico_select on public.servicio_resguardos for select
  using (exists (
    select 1 from public.servicio_tecnicos st
    where st.servicio_id = servicio_resguardos.servicio_id and st.tecnico_id = auth.uid()
  ));

drop policy if exists resguardos_tecnico_insert on public.servicio_resguardos;
create policy resguardos_tecnico_insert on public.servicio_resguardos for insert
  with check (
    firmado_por = auth.uid()
    and exists (
      select 1 from public.servicio_tecnicos st
      where st.servicio_id = servicio_resguardos.servicio_id and st.tecnico_id = auth.uid()
    )
  );

-- El supervisor ve todo y confirma la recepción.
drop policy if exists resguardos_supervisor on public.servicio_resguardos;
create policy resguardos_supervisor on public.servicio_resguardos for all
  using (public.get_my_role() = 'supervisor')
  with check (public.get_my_role() = 'supervisor');

-- 3) Marcar las casillas es responsabilidad exclusiva del técnico: es quien
--    responde por la herramienta. El supervisor conserva lectura para poder
--    revisar la lista y confirmar la recepción.
drop policy if exists insumo_estado_supervisor on public.servicio_insumo_estado;
create policy insumo_estado_supervisor_select on public.servicio_insumo_estado for select
  using (public.get_my_role() = 'supervisor');
