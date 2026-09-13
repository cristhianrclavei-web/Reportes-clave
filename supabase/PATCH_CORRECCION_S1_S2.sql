-- ============================================================
-- CORRECCION DE REGRESIONES INTRODUCIDAS EN SESION 1 Y SESION 2
--
-- Problema 1 (Sesion 1): la politica RLS de profiles quedo en
--   "cada quien solo ve su propia fila". Los supervisores dejaron
--   de ver la lista de tecnicos, y la app consulta esa tabla
--   directo en listarTecnicos(). Resultado: "No hay tecnicos
--   registrados" al asignar servicios y al crear reportes.
--
-- Problema 2 (Sesion 2): listar_personal() se reescribio con la
--   columna llamada "nombre". La app espera "full_name", asi que
--   los nombres llegaban vacios.
--
-- Ejecutar completo en Supabase > SQL Editor.
-- ============================================================


-- ============================================================
-- PARTE 1: Restaurar visibilidad de perfiles para supervisores
-- ============================================================
-- Se usa get_my_role() (SECURITY DEFINER) en lugar de una
-- subconsulta a profiles. Esa subconsulta era lo que causaba la
-- recursion infinita original: la politica de profiles volvia a
-- consultar profiles, que volvia a evaluar la politica. Una
-- funcion SECURITY DEFINER no pasa por RLS, asi que corta el ciclo.

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;

CREATE POLICY "profiles_select_own_or_supervisor"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.get_my_role() = 'supervisor'
);

-- La politica de UPDATE se mantiene restringida a la propia fila.
-- No se toca: la edicion de otros perfiles pasa por el endpoint
-- de admin, que valida can_manage_usuarios.


-- ============================================================
-- PARTE 2: Corregir el nombre de columna en listar_personal
-- ============================================================
-- La app (lib/catalogos.ts) tipa el resultado como:
--   Persona = { id: string; full_name: string; role: string }
-- Por eso la columna debe llamarse full_name, no nombre.

DROP FUNCTION IF EXISTS public.listar_personal() CASCADE;

CREATE OR REPLACE FUNCTION public.listar_personal()
RETURNS TABLE (
  id UUID,
  full_name TEXT,
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
    u.email::TEXT,
    p.role,
    p.activo
  FROM public.profiles p
  JOIN auth.users u ON p.id = u.id
  WHERE p.activo = TRUE
    AND (
      public.get_my_role() = 'supervisor'
      OR p.id = auth.uid()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_personal() TO authenticated;


-- ============================================================
-- VERIFICACION
-- ============================================================

-- 1. La politica quedo con el OR de supervisor
SELECT policyname, cmd, qual::text
FROM pg_policies
WHERE tablename = 'profiles' AND cmd = 'SELECT';

-- 2. La funcion devuelve full_name (no "nombre")
SELECT column_name, ordinal_position
FROM information_schema.columns
WHERE table_name = 'listar_personal'
ORDER BY ordinal_position;

-- 3. Reparto de roles: confirmar que los tecnicos estan bien marcados
SELECT role, count(*), string_agg(full_name, ', ' ORDER BY full_name)
FROM public.profiles
GROUP BY role;
