-- ============================================================================
-- PARCHES DE SEGURIDAD — REPORTES DE SERVICIO (CLAVE INTELIGENTE)
-- ============================================================================
-- EJECUTAR EN: Supabase > SQL Editor
-- ORDEN: Exactamente como aparece aquí (importante para dependencias)
-- 
-- Remediaciones:
-- 1. OWASP A09:2021 - Logging & Monitoring Failures
--    └─ Tabla auditoria_descargas para registrar PDF/Excel
-- 2. OWASP A07:2021 - Identification & Authentication Failures
--    └─ Columnas es_cuenta_prueba y activo en profiles
-- 3. OWASP A04:2021 - Insecure Design
--    └─ Disparadores y políticas para bloquear cuentas de prueba
-- ============================================================================

-- ============================================================================
-- PARCHE 1: AUDITORÍA DE DESCARGAS (OWASP A09:2021)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.auditoria_descargas (
  id BIGSERIAL PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('pdf', 'xlsx')),
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_auditoria_descargas_report_id 
  ON public.auditoria_descargas(report_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_descargas_user_id 
  ON public.auditoria_descargas(user_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_descargas_timestamp 
  ON public.auditoria_descargas(timestamp DESC);

-- RLS: Solo los supervisores pueden ver los logs de auditoría
ALTER TABLE public.auditoria_descargas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auditoria_descargas_insert_app" ON public.auditoria_descargas;
CREATE POLICY "auditoria_descargas_insert_app"
  ON public.auditoria_descargas FOR INSERT
  WITH CHECK (TRUE); -- La app inserta con anon key + sesión

DROP POLICY IF EXISTS "auditoria_descargas_select_supervisor" ON public.auditoria_descargas;
CREATE POLICY "auditoria_descargas_select_supervisor"
  ON public.auditoria_descargas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'supervisor'
    )
  );

-- Vista auxiliar: resumen de descargas por usuario
DROP VIEW IF EXISTS public.auditoria_descargas_resumen;
CREATE OR REPLACE VIEW public.auditoria_descargas_resumen AS
SELECT
  u.email,
  p.full_name,
  COUNT(*) as descargas_total,
  COUNT(CASE WHEN tipo = 'pdf' THEN 1 END) as pdf_count,
  COUNT(CASE WHEN tipo = 'xlsx' THEN 1 END) as xlsx_count,
  MAX(timestamp) as ultima_descarga
FROM public.auditoria_descargas ad
JOIN auth.users u ON u.id = ad.user_id
JOIN public.profiles p ON p.id = ad.user_id
GROUP BY u.email, p.full_name
ORDER BY ultima_descarga DESC;

-- ============================================================================
-- PARCHE 2: CUENTAS DE PRUEBA (OWASP A07:2021)
-- ============================================================================

-- Agregar columnas si no existen
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS es_cuenta_prueba BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;

-- Marcar cuentas de prueba conocidas (si existen)
-- Ajusta esto según los emails de prueba reales en tu base
UPDATE public.profiles 
  SET es_cuenta_prueba = TRUE
  WHERE id IN (
    SELECT DISTINCT id FROM auth.users 
    WHERE email LIKE '%@prueba.com'
       OR email LIKE '%test%'
       OR email LIKE '%demo%'
  )
  AND es_cuenta_prueba = FALSE;

-- ============================================================================
-- PARCHE 3: DISPARADOR PARA VALIDAR CAMBIO DE ESTADO DE PRUEBA
-- ============================================================================

DROP FUNCTION IF EXISTS public.validar_cambio_estado_prueba() CASCADE;
CREATE OR REPLACE FUNCTION public.validar_cambio_estado_prueba()
RETURNS TRIGGER AS $$
BEGIN
  -- Si cambia de es_cuenta_prueba=true a false, exigir datos reales
  IF OLD.es_cuenta_prueba = TRUE AND NEW.es_cuenta_prueba = FALSE THEN
    IF TRIM(COALESCE(NEW.telefono, '')) = '' THEN
      RAISE EXCEPTION 'Debe agregar un teléfono real antes de cambiar el estado de prueba';
    END IF;
    IF TRIM(COALESCE(NEW.full_name, '')) = '' OR NEW.full_name ILIKE '%prueba%' THEN
      RAISE EXCEPTION 'Debe cambiar el nombre a uno real (no contener "prueba")';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validar_prueba ON public.profiles;
CREATE TRIGGER trigger_validar_prueba
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_cambio_estado_prueba();

-- ============================================================================
-- PARCHE 4: ACTUALIZAR RLS DE PROFILES (OWASP A04)
-- ============================================================================

-- Actualizar la política de select para rechazar cuentas inactivas
DROP POLICY IF EXISTS "profiles_select_own_or_supervisor" ON public.profiles;
CREATE POLICY "profiles_select_own_or_supervisor"
  ON public.profiles FOR SELECT
  USING (
    (id = auth.uid() AND activo = TRUE)
    OR (EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() 
      AND p.role = 'supervisor'
      AND p.activo = TRUE
    ))
  );

-- Actualizar política de update para que solo se pueda editar la propia cuenta
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid() AND activo = TRUE)
  WITH CHECK (id = auth.uid() AND activo = TRUE);

-- ============================================================================
-- VERIFICACIÓN FINAL
-- ============================================================================

-- Ejecuta esto para verificar que todo fue creado correctamente:
-- SELECT
--   (SELECT COUNT(*) FROM pg_tables WHERE tablename='auditoria_descargas') as tabla_creada,
--   (SELECT COUNT(*) FROM pg_indexes WHERE indexname LIKE 'idx_auditoria%') as indices_creados,
--   (SELECT COUNT(*) FROM pg_views WHERE viewname='auditoria_descargas_resumen') as vista_creada,
--   (SELECT COUNT(*) FROM pg_trigger WHERE tgname='trigger_validar_prueba') as disparador_creado,
--   (SELECT COUNT(*) FROM pg_policies WHERE tablename='auditoria_descargas') as politicas_rls;

-- ============================================================================
-- FIN DE PARCHES
-- ============================================================================
