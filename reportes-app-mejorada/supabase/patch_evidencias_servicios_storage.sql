-- ============================================================
-- Permitir subir evidencias de servicios y resguardos al bucket
-- ============================================================
-- La política de subida solo aceptaba rutas cuya primera carpeta fuera el id
-- de un reporte del propio técnico. Las fotos de las tareas de un servicio,
-- las evidencias extra y las firmas de resguardo se guardan bajo
-- 'servicios/...' y 'resguardos/...', así que el almacenamiento las estaba
-- rechazando: nunca llegaban a guardarse y en la línea de tiempo no aparecía
-- ninguna foto.
--
-- Se amplía la política de INSERT para aceptar esas rutas cuando quien sube
-- está asignado al servicio (o es supervisor). La de SELECT ya dejaba ver
-- todo al supervisor; se amplía para que el técnico vea las de sus servicios.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

drop policy if exists "evidencias_insert_own_report" on storage.objects;
create policy "evidencias_insert_own_report"
  on storage.objects for insert
  with check (
    bucket_id = 'evidencias'
    and (
      -- Fotos de un reporte propio (comportamiento original)
      exists (
        select 1 from public.reports r
        where r.id::text = (storage.foldername(name))[1]
        and r.created_by = auth.uid()
      )
      -- Evidencias de servicios y firmas de resguardo: la segunda carpeta es
      -- el id del servicio, y quien sube debe estar asignado a él.
      or (
        (storage.foldername(name))[1] in ('servicios', 'resguardos')
        and (
          public.get_my_role() = 'supervisor'
          or exists (
            select 1 from public.servicio_tecnicos st
            where st.servicio_id::text = (storage.foldername(name))[2]
              and st.tecnico_id = auth.uid()
          )
        )
      )
    )
  );

drop policy if exists "evidencias_select_own_or_supervisor" on storage.objects;
create policy "evidencias_select_own_or_supervisor"
  on storage.objects for select
  using (
    bucket_id = 'evidencias'
    and (
      public.get_my_role() = 'supervisor'
      or exists (
        select 1 from public.reports r
        where r.id::text = (storage.foldername(name))[1]
        and r.created_by = auth.uid()
      )
      or (
        (storage.foldername(name))[1] in ('servicios', 'resguardos')
        and exists (
          select 1 from public.servicio_tecnicos st
          where st.servicio_id::text = (storage.foldername(name))[2]
            and st.tecnico_id = auth.uid()
        )
      )
    )
  );
