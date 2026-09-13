-- ============================================================
-- FOTOS DE BITACORA: permitir subirlas y verlas
--
-- Diagnostico:
--   Las fotos de avance en bitacora se suben a la ruta
--     actividades/{actividad_id}/{timestamp}.jpg
--   La politica de INSERT del bucket evidencias solo acepta
--   archivos bajo un reports.id propio, o bajo los prefijos
--   'servicios' y 'resguardos'. El prefijo 'actividades' no
--   estaba contemplado, asi que el upload se rechazaba.
--
--   subirFotoEvento() devolvia null ante el error y el evento se
--   guardaba sin foto, en silencio. Por eso actividad_eventos
--   tiene cero filas con foto_path.
--
-- Enfoque:
--   Se AGREGAN politicas nuevas acotadas al prefijo 'actividades'
--   en lugar de modificar las existentes. En Postgres las
--   politicas permisivas se combinan con OR, asi que lo que hoy
--   funciona (reportes, servicios, resguardos) queda intacto.
--
-- Permisos que se otorgan:
--   INSERT - solo el dueno de la actividad (created_by)
--   SELECT - el dueno de la actividad, y los supervisores
--   DELETE - solo el dueno, para poder corregir un avance
-- ============================================================


-- ------------------------------------------------------------
-- INSERT: el tecnico sube fotos a sus propias actividades
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "evidencias_insert_actividades" ON storage.objects;

CREATE POLICY "evidencias_insert_actividades"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'evidencias'
  AND (storage.foldername(name))[1] = 'actividades'
  AND EXISTS (
    SELECT 1 FROM public.actividades a
    WHERE a.id::text = (storage.foldername(name))[2]
      AND a.created_by = auth.uid()
  )
);


-- ------------------------------------------------------------
-- SELECT: el dueno ve las suyas; el supervisor ve todas
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "evidencias_select_actividades" ON storage.objects;

CREATE POLICY "evidencias_select_actividades"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'evidencias'
  AND (storage.foldername(name))[1] = 'actividades'
  AND (
    public.get_my_role() = 'supervisor'
    OR EXISTS (
      SELECT 1 FROM public.actividades a
      WHERE a.id::text = (storage.foldername(name))[2]
        AND a.created_by = auth.uid()
    )
  )
);


-- ------------------------------------------------------------
-- DELETE: el dueno puede borrar una foto suya
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "evidencias_delete_actividades" ON storage.objects;

CREATE POLICY "evidencias_delete_actividades"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'evidencias'
  AND (storage.foldername(name))[1] = 'actividades'
  AND EXISTS (
    SELECT 1 FROM public.actividades a
    WHERE a.id::text = (storage.foldername(name))[2]
      AND a.created_by = auth.uid()
  )
);


-- ============================================================
-- VERIFICACION
-- ============================================================

-- Deben aparecer las 3 nuevas junto a las que ya existian
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE 'evidencias%'
ORDER BY cmd, policyname;

-- Despues de subir una foto de prueba desde la app, esta debe
-- devolver al menos una fila (antes devolvia cero):
-- SELECT id, actividad_id, tipo, foto_path, created_at
-- FROM public.actividad_eventos
-- WHERE foto_path IS NOT NULL
-- ORDER BY created_at DESC LIMIT 5;
