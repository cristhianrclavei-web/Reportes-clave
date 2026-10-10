import { EvidenciaGuardada, metaLimpia } from './evidencias';
import { createClient } from './supabaseClient';
import { reducirFoto } from './reducirFoto';
import { getOfflineReports, deleteOfflineReport, saveOfflineReport, faltaSubir, PendingReport } from './offlineQueue';
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

// ¿El servidor rechazó el archivo por lo que es (tipo o tamaño no permitido)?
// Eso no se arregla reintentando. Cualquier otro error (sin señal, sesión
// vencida, servidor caído) sí: el reporte se queda en la cola.
export function esRechazoDefinitivo(error: { statusCode?: string | number; status?: number; message?: string } | null): boolean {
  if (!error) return false;
  const codigo = String(error.statusCode ?? error.status ?? '');
  if (codigo === '413' || codigo === '415') return true;
  return /mime type|not supported|maximum allowed size|too large/i.test(error.message || '');
}

// ¿El archivo ya estaba subido? Pasa cuando un intento anterior lo subió
// pero se cortó antes de anotar el avance: cuenta como subido.
export function yaEstabaSubido(error: { statusCode?: string | number; status?: number; message?: string } | null): boolean {
  if (!error) return false;
  const codigo = String(error.statusCode ?? error.status ?? '');
  return codigo === '409' || /already exists|duplicate/i.test(error.message || '');
}

// Sube un reporte guardado sin conexión. Regla de fondo: la copia local no
// se borra hasta que el servidor tenga el reporte Y todas sus fotos. Si algo
// falla a medias se lanza el error, el reporte se queda en la cola y el
// siguiente intento continúa donde se quedó (item.sync guarda el avance).
//
// Devuelve cuántas fotos o videos rechazó el servidor de forma definitiva.
async function syncOne(item: PendingReport): Promise<number> {
  const supabase = createClient();

  // 1. Id y folio del reporte: se fijan y se guardan ANTES de crear nada en
  // el servidor, para que un reintento no cree un segundo reporte.
  if (!item.sync) {
    // Folio calculado ahora (con conexión real), no al capturar sin
    // internet, para que el consecutivo sea preciso.
    const { count, error: eCuenta } = await supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', item.userId);
    if (eCuenta) throw eCuenta;
    const seq = (count || 0) + 1;
    item.sync = {
      reportId: generarUUID(),
      claveFormato: `${iniciales(item.userName || item.userEmail)}-A-${String(seq).padStart(3, '0')}`,
      subidas: {},
    };
    await saveOfflineReport(item);
  }
  const avance = item.sync;
  const reportId = avance.reportId;

  // 2. El reporte, todavía sin fotos. «fotosPendientes» le dice a la base
  // que este reporte aún espera sus fotos, aunque tarden en llegar.
  const baseData = { ...item.data, claveFormato: avance.claveFormato, fotos: [] as EvidenciaGuardada[], fotosPendientes: true };
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
  // 23505 = ese id ya existe: lo creó un intento anterior. Se continúa.
  if (error && error.code !== '23505') throw error;

  // 3. Las fotos tomadas sin conexión. Las que ya estaban subidas al
  // servicio (fotosExistentes) solo se referencian.
  let rechazadas = 0;
  const pendientes: PendingReport['fotos'] = [];
  try {
    for (let i = 0; i < (item.fotos || []).length; i++) {
      if (avance.subidas[i]) continue;
      const f = item.fotos[i];
      // Se reduce aquí (al subir) y no al guardar sin conexión, para no
      // gastar batería mientras se captura en campo.
      const blob = await reducirFoto(new File([dataUrlToBlob(f.fileDataUrl)], f.fileName || 'foto.jpg', { type: f.fileType || 'image/jpeg' }));
      const ext = blob.name.split('.').pop() || 'jpg';
      // Ruta fija por posición: si se reintenta, cae en el mismo lugar.
      const path = `${reportId}/sin-conexion-${i}.${ext}`;
      const { error: eFoto } = await supabase.storage.from('evidencias').upload(path, blob, {
        contentType: blob.type || 'image/jpeg',
      });
      if (eFoto && !yaEstabaSubido(eFoto)) {
        if (!esRechazoDefinitivo(eFoto)) throw eFoto;
        // El servidor no acepta este archivo: se aparta (sigue guardado en
        // el teléfono) y se continúa con las demás.
        rechazadas++;
        pendientes.push(f);
        continue;
      }

      const evidencia: EvidenciaGuardada = { path, caption: f.caption, ...metaLimpia(f.meta) };
      // Video tomado sin conexión: se sube junto a su portada.
      if (f.videoDataUrl) {
        const tipo = f.videoType || 'video/mp4';
        try {
          evidencia.video = await subirVideo(String(reportId), new File([dataUrlToBlob(f.videoDataUrl)], `video.${extensionDeVideo(tipo)}`, { type: tipo }));
          evidencia.dur = f.dur || null;
        } catch (eVideo: any) {
          if (!esRechazoDefinitivo(eVideo)) throw eVideo;
          // Video no aceptado: queda su portada en el reporte y el video
          // sigue guardado en el teléfono.
          rechazadas++;
          pendientes.push(f);
        }
      }
      avance.subidas[i] = evidencia;
    }
  } finally {
    // Pase lo que pase, se anota lo que sí subió.
    await saveOfflineReport(item);
  }

  // 4. Se ligan las fotos al reporte y se quita la marca de pendientes.
  const fotoData: EvidenciaGuardada[] = [...(item.fotosExistentes || [])];
  for (let i = 0; i < (item.fotos || []).length; i++) {
    if (avance.subidas[i]) fotoData.push(avance.subidas[i]);
  }
  const dataFinal: Record<string, any> = { ...baseData, fotos: fotoData, fotosPendientes: false };
  if (rechazadas > 0) dataFinal.fotosNoSubidas = rechazadas;
  const { error: eLigar } = await supabase.from('reports').update({ data: dataFinal }).eq('id', reportId);
  if (eLigar) throw eLigar;

  if (item.servicioProgramadoId) {
    try {
      await vincularReporteAServicio(item.servicioProgramadoId, reportId);
    } catch {
      // No es crítico: el reporte ya se sincronizó bien; solo no quedó enlazado al servicio.
    }
  }

  // 5. Ya está todo en el servidor. Si hubo archivos rechazados, la copia
  // local se conserva solo con ellos; si no, se borra.
  if (rechazadas > 0) {
    await saveOfflineReport({ ...item, fotos: pendientes, sync: { ...avance, terminado: true } });
  } else {
    await deleteOfflineReport(item.localId);
  }
  return rechazadas;
}

export async function syncPendingReports(): Promise<{ synced: number; failed: number; rechazadas: number }> {
  const pending = (await getOfflineReports()).filter(faltaSubir);
  if (pending.length === 0) return { synced: 0, failed: 0, rechazadas: 0 };

  let synced = 0;
  let failed = 0;
  let rechazadas = 0;

  for (const item of pending) {
    try {
      rechazadas += await syncOne(item);
      synced++;
    } catch (e) {
      console.error('[sync] Error subiendo reporte pendiente:', e);
      failed++;
    }
  }

  return { synced, failed, rechazadas };
}
