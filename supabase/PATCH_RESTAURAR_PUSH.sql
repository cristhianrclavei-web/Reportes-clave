-- ============================================================
-- RESTAURAR NOTIFICACIONES PUSH
--
-- En Sesion 2 se reescribio suscripciones_para_envio y quedo
-- inservible por tres errores:
--   1. Parametro p_tecnicos_ids, pero /api/push llama p_usuarios
--   2. Columnas auth_secret y p256dh_key, la ruta lee auth y p256dh
--   3. Tabla push_subscripciones (con b); la real es push_suscripciones
-- plpgsql no valida referencias al crear, solo al ejecutar, por eso
-- el SQL se creo "correctamente" y fallaba en silencio.
--
-- Ademas el filtro role = 'tecnico' excluia a supervisores, y la
-- validacion de rol impedia que un tecnico disparara avisos hacia
-- los supervisores.
--
-- Este patch restaura el contrato original exacto.
-- ============================================================

DROP FUNCTION IF EXISTS public.suscripciones_para_envio(UUID[]) CASCADE;

CREATE OR REPLACE FUNCTION public.suscripciones_para_envio(p_usuarios uuid[])
RETURNS TABLE (usuario_id uuid, endpoint text, p256dh text, auth text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.usuario_id, s.endpoint, s.p256dh, s.auth
  FROM public.push_suscripciones s
  WHERE s.usuario_id = ANY(p_usuarios);
$$;

GRANT EXECUTE ON FUNCTION public.suscripciones_para_envio(uuid[]) TO authenticated;

-- ============================================================
-- RIESGO QUE QUEDA ABIERTO
--
-- Devuelve endpoints y llaves push de cualquier usuario cuyo UUID
-- se le pase, a cualquier usuario autenticado.
--
-- La solucion correcta no es validar rol dentro de la funcion (eso
-- rompe el flujo tecnico -> supervisor), sino sacar la llamada del
-- cliente: que /api/push use SUPABASE_SERVICE_ROLE_KEY y se revoque
-- el execute a authenticated. Requiere agregar esa variable en
-- Vercel, que hoy el proyecto no tiene.
-- ============================================================
