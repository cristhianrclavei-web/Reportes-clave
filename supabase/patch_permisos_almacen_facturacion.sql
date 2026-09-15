-- ============================================================
-- Otorgar Almacén y Facturación desde la UI de Usuarios
-- ============================================================
-- can_manage_almacen y can_manage_billing ya existen (patch_almacen.sql,
-- patch_add_billing_permission.sql), pero solo se activaban corriendo un
-- UPDATE a mano. Este patch no agrega columnas: solo corrige el bucket de
-- facturas para que dependa del permiso, igual que ya hace almacén.
--
-- Hoy la policy de 'facturas' usa get_my_role() = 'supervisor' directo, así
-- que cualquier supervisor puede subir/ver facturas sin importar
-- can_manage_billing. ReportDetailModal ya oculta los botones sin el
-- permiso, pero el bucket en sí quedaba abierto.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

-- 1. Función de permiso, calcada de puedo_gestionar_almacen() ------------

create or replace function public.puedo_gestionar_facturacion()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.can_manage_billing from public.profiles p where p.id = auth.uid()), false);
$$;

revoke all on function public.puedo_gestionar_facturacion() from public;
grant execute on function public.puedo_gestionar_facturacion() to authenticated;

-- 2. Policy del bucket 'facturas': de rol a permiso -----------------------

drop policy if exists "facturas_supervisor_all" on storage.objects;

create policy "facturas_supervisor_all"
on storage.objects for all
using (bucket_id = 'facturas' and public.puedo_gestionar_facturacion())
with check (bucket_id = 'facturas' and public.puedo_gestionar_facturacion());

-- 3. Verificación ----------------------------------------------------------
-- Debe devolver 1, 1.
--
-- select
--   (select count(*) from pg_proc where proname = 'puedo_gestionar_facturacion') as funcion,
--   (select count(*) from pg_policies
--      where tablename = 'objects' and policyname = 'facturas_supervisor_all') as politica;
