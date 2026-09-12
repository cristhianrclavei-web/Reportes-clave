import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Valida que el usuario autenticado tenga permiso para usar la aplicación
 * OWASP A07:2021 - Identification and Authentication Failures
 * 
 * Rechaza:
 * - Cuentas de prueba (es_cuenta_prueba = true)
 * - Cuentas inactivas (activo = false)
 * 
 * Se debe llamar inmediatamente después de una autenticación exitosa en Supabase Auth.
 */
export async function validateLoginUser(
  supabase: SupabaseClient,
  userId: string
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('es_cuenta_prueba, activo, role, full_name')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      console.warn(`[AUTH] Perfil no encontrado para usuario ${userId}`);
      return {
        valid: false,
        reason: 'Perfil no encontrado',
      };
    }

    // Rechazar si es cuenta de prueba
    if (profile.es_cuenta_prueba === true) {
      console.warn(
        `[AUTH] Intento de login con cuenta de prueba: ${profile.full_name} (${userId})`
      );
      return {
        valid: false,
        reason:
          'Esta cuenta de prueba no está disponible. ' +
          'Contacta al administrador si crees que es un error.',
      };
    }

    // Rechazar si está inactiva
    if (profile.activo === false) {
      console.warn(
        `[AUTH] Intento de login con cuenta inactiva: ${profile.full_name} (${userId})`
      );
      return {
        valid: false,
        reason:
          'Tu cuenta ha sido desactivada. ' +
          'Contacta al administrador de sistemas.',
      };
    }

    console.log(
      `[AUTH] Validación exitosa: ${profile.full_name} (${profile.role})`
    );
    return { valid: true };
  } catch (err: any) {
    console.error('[AUTH] Excepción validando usuario:', err.message);
    return {
      valid: false,
      reason: 'Error al validar la cuenta. Intenta nuevamente.',
    };
  }
}
