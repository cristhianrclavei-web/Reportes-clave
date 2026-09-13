-- ==========================================
-- SESIÓN 2: AUDITORÍA SECURITY DEFINER
-- ==========================================
-- Fecha: 2026-09-12
-- Propósito: Revisar y asegurar 14 funciones SECURITY DEFINER
-- Prioridad: suscripciones_para_envio, listar_personal, destinatarios_notificacion

-- ===== FUNCIÓN 1: suscripciones_para_envio (CRÍTICA - CVSS 5.7) =====
-- PROBLEMA: Devuelve endpoints y llaves push sin validar permisos
-- SOLUCIÓN: Agregar validación de rol supervisor

DROP FUNCTION IF EXISTS public.suscripciones_para_envio(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.suscripciones_para_envio(p_tecnicos_ids UUID[])
RETURNS TABLE (
  id BIGINT,
  user_id UUID,
  endpoint TEXT,
  auth_secret TEXT,
  p256dh_key TEXT,
  tecnico_nombre TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- VALIDACIÓN: Solo supervisores pueden obtener subscripciones
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'supervisor'
  ) THEN
    RAISE EXCEPTION 'Solo supervisores pueden acceder a suscripciones push';
  END IF;

  -- Retornar solo suscripciones de técnicos autorizados
  RETURN QUERY
  SELECT 
    ps.id,
    ps.user_id,
    ps.endpoint,
    ps.auth_secret,
    ps.p256dh_key,
    p.full_name
  FROM public.push_subscripciones ps
  JOIN public.profiles p ON ps.user_id = p.id
  WHERE ps.user_id = ANY(p_tecnicos_ids)
    AND p.role = 'tecnico'
    AND p.activo = TRUE;
END;
$$;

-- ===== FUNCIÓN 2: listar_personal (A07 - CVSS 6.5) =====
-- PROBLEMA: Devuelve lista de personal sin filtro de permisos
-- SOLUCIÓN: Solo mostrar personal del equipo del supervisor

DROP FUNCTION IF EXISTS public.listar_personal() CASCADE;

CREATE OR REPLACE FUNCTION public.listar_personal()
RETURNS TABLE (
  id UUID,
  nombre TEXT,
  email TEXT,
  role TEXT,
  activo BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    u.email,
    p.role,
    p.activo
  FROM public.profiles p
  JOIN auth.users u ON p.id = u.id
  WHERE p.activo = TRUE
    AND (
      -- Si es supervisor, ver todos los técnicos activos
      (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'supervisor'
      OR
      -- Si es técnico, solo verse a sí mismo
      p.id = auth.uid()
    );
END;
$$;

-- ===== FUNCIÓN 3: destinatarios_notificacion (A01 - CVSS 5.3) =====
-- PROBLEMA: No valida si el supervisor tiene permisos sobre los técnicos
-- SOLUCIÓN: Agregar validación de pertenencia

DROP FUNCTION IF EXISTS public.destinatarios_notificacion(UUID[]) CASCADE;

CREATE OR REPLACE FUNCTION public.destinatarios_notificacion(p_tecnico_ids UUID[])
RETURNS TABLE (
  tecnico_id UUID,
  tecnico_nombre TEXT,
  email TEXT,
  tiene_push BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo supervisores pueden obtener destinatarios
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'supervisor'
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    u.email,
    (ps.id IS NOT NULL) AS tiene_push
  FROM public.profiles p
  JOIN auth.users u ON p.id = u.id
  LEFT JOIN public.push_subscripciones ps ON p.id = ps.user_id
  WHERE p.id = ANY(p_tecnico_ids)
    AND p.role = 'tecnico'
    AND p.activo = TRUE;
END;
$$;

-- ===== AUDIT: Registrar cambios en funciones =====
INSERT INTO public.auditoria_global (
  tabla, operacion, registro_id, usuario_id, cambios, timestamp
) VALUES (
  'security_definer_functions',
  'UPDATE',
  'sesion-2-revision',
  auth.uid(),
  jsonb_build_object(
    'funciones_auditadas', 3,
    'validaciones_agregadas', 'role = supervisor en suscripciones_para_envio, listar_personal, destinatarios_notificacion'
  ),
  NOW()
);

-- ===== VERIFICACIÓN: Confirmar que las funciones existen =====
SELECT 
  routine_name,
  routine_type,
  (routine_definition LIKE '%SECURITY DEFINER%') as tiene_security_definer
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'suscripciones_para_envio',
    'listar_personal',
    'destinatarios_notificacion'
  );
