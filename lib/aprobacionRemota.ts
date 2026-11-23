import { createAdminClient, hayClienteAdmin } from '@/lib/supabaseAdmin';
import type { Cotizacion, LineaCotizacion } from '@/lib/cotizaciones';

// Lee la cotización de un enlace de aprobación (/aprobar/<token>) con la
// llave del servidor: quien aprueba no tiene sesión. Solo se llama después de
// que aprobacion_remota_info() reconoció el token, y solo trae la cotización
// de ese token. Se usa en la página del enlace y en su PDF.
export async function cargarCotizacionDelEnlace(
  token: string,
): Promise<{ cotizacion: Cotizacion; lineas: LineaCotizacion[] } | { error: string }> {
  if (!hayClienteAdmin()) return { error: 'Falta configurar el servidor (SUPABASE_SECRET_KEY).' };
  const admin = createAdminClient();
  const { data: solicitud, error: e0 } = await admin
    .from('cotizacion_aprobaciones').select('cotizacion_id').eq('token', token.toLowerCase()).maybeSingle();
  if (e0 || !solicitud) return { error: 'Enlace no válido.' };
  const [{ data: cotizacion, error: e1 }, { data: lineas, error: e2 }] = await Promise.all([
    admin.from('cotizaciones').select('*').eq('id', solicitud.cotizacion_id).single(),
    admin.from('cotizacion_lineas').select('*').eq('cotizacion_id', solicitud.cotizacion_id).order('orden'),
  ]);
  if (e1 || e2 || !cotizacion) {
    console.error('Cotización del enlace de aprobación:', e1?.message || e2?.message);
    return { error: 'No se pudo cargar la cotización. Intenta de nuevo.' };
  }
  return { cotizacion: cotizacion as Cotizacion, lineas: (lineas as LineaCotizacion[]) || [] };
}
