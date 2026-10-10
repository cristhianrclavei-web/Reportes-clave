import { EvidenciaGuardada, metaLimpia } from './evidencias';
import { createClient } from './supabaseClient';
import { reducirFoto } from './reducirFoto';
import { getOfflineReports, deleteOfflineReport, PendingReport } from './offlineQueue';
import { vincularReporteAServicio } from './serviciosProgramados';
import { generarUUID } from './uuid';
import { subirVideo, extensionDeVideo } from './videoEvidencia';

function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return new Blob([array], { type: mime });
}

async function syncOne(item: PendingReport): Promise<void> {
  const supabase = createClient();

  // Folio automático calculado AHORA (con conexión real), no al momento de
  // crear el reporte sin internet, para que el consecutivo sea preciso.
  const { count } = await supabase
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', item.userId);
  const seq = (count || 0) + 1;
  const claveFormato = `${iniciales(item.userName || item.userEmail)}-A-${String(seq).padStart(3, '0')}`;

  const reportId = generarUUID();
  const baseData = { ...item.data, claveFormato, fotos: [] as { path: string; caption: string }[] };

  const { error } = await supabase.from('reports').insert({
    id: reportId,
    created_by: item.userId,
    empresa_cliente: item.empresaCliente,
    cliente_id: item.clienteId || null,
    fecha: item.fecha,
    tipo_servicio: item.tipoServicio,
    sub_tipo_servicio: item.subTipoServicio,
    data: baseData,
  });
  if (error) throw error;

  // Las que ya estaban subidas al servicio solo se referencian, sin volver a
  // subirlas; las nuevas (tomadas sin conexión) sí hay que subirlas ahora.
  const fotoData: EvidenciaGuardada[] = [...(item.fotosExistentes || [])];
  if (item.fotos && item.fotos.length > 0) {
    for (let i = 0; i < item.fotos.length; i++) {
      const f = item.fotos[i];
      // Se reduce aquí (al subir) y no al guardar sin conexión, para no
      // gastar batería mientras se captura en campo.
      const blob = await reducirFoto(new File([dataUrlToBlob(f.fileDataUrl)], f.fileName || 'foto.jpg', { type: f.fileType || 'image/jpeg' }));
      const ext = blob.name.split('.').pop() || 'jpg';
      const path = `${reportId}/${Date.now()}-${i}.${ext}`;
      const { error: upErr } = await supabase.storage.from('evidencias').upload(path, blob, {
        contentType: blob.type || 'image/jpeg',
      });
      if (upErr) continue;
      // Video tomado sin conexión: se sube junto a su portada.
      if (f.videoDataUrl) {
        try {
          const tipo = f.videoType || 'video/mp4';
          const video = await subirVideo(String(reportId), new File([dataUrlToBlob(f.videoDataUrl)], `video.${extensionDeVideo(tipo)}`, { type: tipo }));
          fotoData.push({ path, caption: f.caption, video, dur: f.dur || null, ...metaLimpia(f.meta) });
          continue;
        } catch { /* si el video no sube, queda al menos su portada */ }
      }
      fotoData.push({ path, caption: f.caption, ...metaLimpia(f.meta) });
    }
  }
  if (fotoData.length > 0) {
    await supabase.from('reports').update({ data: { ...baseData, fotos: fotoData } }).eq('id', reportId);
  }

  if (item.servicioProgramadoId) {
    try {
      await vincularReporteAServicio(item.servicioProgramadoId, reportId);
    } catch {
      // No es crítico: el reporte ya se sincronizó bien; solo no quedó enlazado al servicio.
    }
  }
}

export async function syncPendingReports(): Promise<{ synced: number; failed: number }> {
  const pending = await getOfflineReports();
  if (pending.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      await syncOne(item);
      await deleteOfflineReport(item.localId);
      synced++;
    } catch (e) {
      console.error('[sync] Error subiendo reporte pendiente:', e);
      failed++;
    }
  }

  return { synced, failed };
}
