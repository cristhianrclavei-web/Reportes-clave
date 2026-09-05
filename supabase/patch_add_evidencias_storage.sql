-- Ejecuta esto en Supabase > SQL Editor
-- Crea el bucket privado de fotos de evidencia y sus reglas de acceso:
-- el técnico solo puede subir/ver fotos de SUS PROPIOS reportes,
-- el supervisor puede ver las fotos de TODOS los reportes.

insert into storage.buckets (id, name, public)
values ('evidencias', 'evidencias', false)
on conflict (id) do nothing;

drop policy if exists "evidencias_insert_own_report" on storage.objects;
create policy "evidencias_insert_own_report"
  on storage.objects for insert
  with check (
    bucket_id = 'evidencias'
    and exists (
      select 1 from public.reports r
      where r.id::text = (storage.foldername(name))[1]
      and r.created_by = auth.uid()
    )
  );

drop policy if exists "evidencias_select_own_or_supervisor" on storage.objects;
create policy "evidencias_select_own_or_supervisor"
  on storage.objects for select
  using (
    bucket_id = 'evidencias'
    and (
      exists (
        select 1 from public.reports r
        where r.id::text = (storage.foldername(name))[1]
        and r.created_by = auth.uid()
      )
      or public.get_my_role() = 'supervisor'
    )
  );
