-- ============================================================
-- Supervisión edita reportes: fotos nuevas
-- ============================================================
-- Desde el detalle de un reporte, supervisión puede editarlo mientras el
-- cliente no lo firme y no tenga la firma de revisión. La base ya le deja
-- cambiar el reporte; esto le permite además subir fotos nuevas a la carpeta
-- de un reporte que hizo otra persona (antes solo podía su autor).
--
-- Aditivo: se suma a la política de siempre (las políticas se combinan con
-- «o»). Ejecutar en el SQL Editor de Supabase. Se puede correr varias veces.

drop policy if exists "evidencias_insert_supervisor_reporte" on storage.objects;
create policy "evidencias_insert_supervisor_reporte"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'evidencias'
    and public.get_my_role() = 'supervisor'
    and exists (
      select 1 from public.reports r
      where r.id::text = (storage.foldername(name))[1]
    )
  );

-- Verificación: debe salir 1.
select count(*) as politica_lista
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname = 'evidencias_insert_supervisor_reporte';
