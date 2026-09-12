import { createClient } from './supabaseClient';
import { registrarAccionGlobal } from './auditoriaGlobal';

// Elimina un reporte de servicio. Solo supervisores — la política RLS
// reports_delete_supervisor lo respalda del lado de la base de datos.
// - Si estaba vinculado a un servicio programado, el servicio NO se toca:
//   su report_id queda en null automáticamente (on delete set null).
// - Las fotos de evidencia (bucket 'evidencias') y el PDF de factura
//   (bucket 'facturas') se limpian best-effort: si el Storage falla,
//   la eliminación del reporte no se frena.
export async function eliminarReporte(report: {
  id: string;
  empresa_cliente: string;
  fecha: string;
  data: any;
}): Promise<void> {
  const supabase = createClient();

  const fotosRaw: any[] = report.data?.fotos || [];
  const fotoPaths = fotosRaw
    .map((f) => (typeof f === 'string' ? f : f?.path))
    .filter(Boolean) as string[];
  const facturaPath: string | undefined = report.data?.facturaArchivo?.path;

  const { error } = await supabase.from('reports').delete().eq('id', report.id);
  if (error) throw error;

  if (fotoPaths.length > 0) {
    try {
      await supabase.storage.from('evidencias').remove(fotoPaths);
    } catch (e) {
      console.error('No se pudieron limpiar las fotos del reporte eliminado:', e);
    }
  }
  if (facturaPath) {
    try {
      await supabase.storage.from('facturas').remove([facturaPath]);
    } catch (e) {
      console.error('No se pudo limpiar la factura del reporte eliminado:', e);
    }
  }

  const folio = report.data?.claveFormato ? ` (folio ${report.data.claveFormato})` : '';
  await registrarAccionGlobal(
    'elimino_reporte',
    'reporte',
    report.id,
    `Eliminó el reporte de «${report.empresa_cliente}»${folio}, fecha ${report.fecha}`
  );
}
