-- Bitácora: que supervisión pueda eliminar una actividad (por ejemplo, las
-- que se registraron de prueba) junto con sus fotos y videos.
--
-- Hasta ahora el supervisor solo podía ver las actividades. Aquí se le
-- permite borrar el registro y los archivos de esa actividad. Los avances,
-- pausas y notas se van solos con la actividad (ya estaba definido así).
-- El técnico conserva lo que ya podía hacer con las suyas.
--
-- Se puede correr varias veces.

drop policy if exists actividades_supervisor_delete on public.actividades;
create policy actividades_supervisor_delete
on public.actividades for delete
using (public.get_my_role() = 'supervisor');

-- Archivos de la actividad: los borra su dueño (como antes) o un supervisor.
drop policy if exists "evidencias_delete_actividades" on storage.objects;
create policy "evidencias_delete_actividades"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'evidencias'
  and (storage.foldername(name))[1] = 'actividades'
  and exists (
    select 1 from public.actividades a
    where a.id::text = (storage.foldername(name))[2]
      and (a.created_by = auth.uid() or public.get_my_role() = 'supervisor')
  )
);
