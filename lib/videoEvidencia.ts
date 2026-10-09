// Evidencia en video. La app graba ella misma (components/GrabadorVideo) en
// vez de pedirle el video a la cámara del teléfono: así sale ya comprimido
// (720p a ~1 Mbps, unos 4 MB por 30 s) y no de 60–130 MB por minuto.
//
// Cada video viaja con su «portada» (una imagen suya). La portada va donde
// siempre ha ido la foto; el video, en un campo aparte (`video`/`video_path`).
// Por eso todo lo que ya muestra fotos —listas, reporte, PDF— sigue
// funcionando sin cambios y solo hay que sumarle el botón de reproducir.

import { createClient } from './supabaseClient';

// Límites acordados con Clave (plan gratis de almacenamiento: 1 GB en total).
export const VIDEO_MAX_SEG = 30;
export const VIDEOS_POR_REGISTRO = 3;
export const VIDEO_BITS_POR_SEG = 1_000_000;
export const AUDIO_BITS_POR_SEG = 64_000;
// Tope del respaldo (cuando el teléfono no deja grabar dentro de la app y se
// usa su cámara): el plan no admite archivos de más de 50 MB.
export const VIDEO_MAX_BYTES_RESPALDO = 45 * 1024 * 1024;

export type VideoGrabado = { video: File; poster: File; dur: number };

// MP4 primero: es lo que reproduce cualquier teléfono. WebM solo si el
// navegador no sabe grabar MP4.
const CANDIDATOS = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function mimeParaGrabar(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return CANDIDATOS.find((m) => MediaRecorder.isTypeSupported(m)) || null;
}

export function extensionDeVideo(mime: string | null | undefined): string {
  const m = (mime || '').toLowerCase();
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('quicktime')) return 'mov';
  return 'webm';
}

// 24 → «0:24», 75 → «1:15».
export function duracionCorta(seg: number | null | undefined): string {
  const s = Math.max(0, Math.round(seg || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// «3.8 MB».
export function pesoTexto(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Sube el video al bucket de evidencias, dentro de `carpeta` (la misma del
// registro al que pertenece, para que apliquen sus permisos).
export async function subirVideo(carpeta: string, video: File): Promise<string> {
  const path = `${carpeta}/${Date.now()}-video.${extensionDeVideo(video.type)}`;
  const { error } = await createClient().storage.from('evidencias').upload(path, video, { contentType: video.type || 'video/mp4' });
  if (error) throw new Error('No se pudo guardar el video: ' + (error.message || 'error de almacenamiento'));
  return path;
}

// Portada y duración de un video ya grabado (el del respaldo): se carga en
// un <video> fuera de pantalla y se copia un cuadro.
export function portadaDeVideo(video: File): Promise<{ poster: File; dur: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(video);
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    const fin = (err?: Error) => { URL.revokeObjectURL(url); if (err) reject(err); };
    v.onerror = () => fin(new Error('No se pudo leer el video'));
    v.onloadeddata = () => { v.currentTime = Math.min(0.3, (v.duration || 1) / 2); };
    v.onseeked = () => {
      try {
        const escala = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight, 1));
        const c = document.createElement('canvas');
        c.width = Math.round(v.videoWidth * escala);
        c.height = Math.round(v.videoHeight * escala);
        c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
        c.toBlob((b) => {
          if (!b) return fin(new Error('No se pudo sacar la portada del video'));
          const dur = Number.isFinite(v.duration) ? v.duration : 0;
          fin();
          resolve({ poster: new File([b], 'portada.jpg', { type: 'image/jpeg' }), dur });
        }, 'image/jpeg', 0.8);
      } catch (e: any) { fin(e); }
    };
    v.src = url;
  });
}

// Bytes guardados en todo el almacenamiento (solo supervisión; null si no
// se puede saber). Requiere supabase/patch_video_evidencia.sql.
export async function usoAlmacenamiento(): Promise<number | null> {
  try {
    const { data, error } = await createClient().rpc('uso_almacenamiento');
    if (error || data === null || data === undefined) return null;
    return Number(data);
  } catch {
    return null;
  }
}

// Capacidad del plan, en GB (1 en el plan gratis). Se cambia con
// NEXT_PUBLIC_ALMACENAMIENTO_GB al pasar a un plan mayor.
export const CAPACIDAD_GB = Number(process.env.NEXT_PUBLIC_ALMACENAMIENTO_GB) > 0 ? Number(process.env.NEXT_PUBLIC_ALMACENAMIENTO_GB) : 1;
