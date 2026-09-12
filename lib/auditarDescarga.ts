import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Registra en la tabla auditoria_descargas cada descarga de PDF/Excel
 * OWASP A09:2021 - Logging & Monitoring Failures
 * 
 * Debe ser llamado ANTES de enviar el archivo al cliente.
 * Nota: Si la auditoría falla, NO bloquea la descarga, pero sí registra el error.
 */
export async function auditarDescarga(
  supabase: SupabaseClient,
  reportId: string,
  userId: string,
  tipo: 'pdf' | 'xlsx',
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('auditoria_descargas').insert({
      report_id: reportId,
      user_id: userId,
      tipo,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      timestamp: new Date().toISOString(),
    });

    if (error) {
      console.error('[AUDIT] Error registrando descarga:', error.message);
      return { success: false, error: error.message };
    }

    console.log(
      `[AUDIT] Descarga registrada: reporte=${reportId} tipo=${tipo} usuario=${userId} ip=${ipAddress}`
    );
    return { success: true };
  } catch (err: any) {
    console.error('[AUDIT] Excepción registrando descarga:', err.message);
    return { success: false, error: err.message };
  }
}
