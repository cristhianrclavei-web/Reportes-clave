-- Descargas desde la app de Android (lib/abrirArchivo.ts).
--
-- La app de Android no abre PDFs ni descarga archivos por sí sola: el archivo
-- se sube a evidencias/lazos/descargas/<usuario>/ y se abre en Chrome con un
-- enlace firmado. Subir y leer ya lo permiten las políticas de la carpeta
-- lazos/ (patch_lazos.sql). Esta política deja que cada quien BORRE sus
-- propias descargas viejas, para que no se acumulen.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

drop policy if exists "evidencias_descargas_borrar" on storage.objects;
create policy "evidencias_descargas_borrar" on storage.objects for delete
  using (
    bucket_id = 'evidencias'
    and (storage.foldername(name))[1] = 'lazos'
    and (storage.foldername(name))[2] = 'descargas'
    and (storage.foldername(name))[3] = auth.uid()::text
  );

-- Verificación: debe devolver 1.
-- select count(*) from pg_policies where schemaname = 'storage' and policyname = 'evidencias_descargas_borrar';
