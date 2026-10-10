import { createHmac, createHash, timingSafeEqual } from 'crypto';
import { MARCA } from './marca';

// Enlace público a un video de evidencia: es el que lleva el QR del PDF, para
// que el cliente lo vea sin tener cuenta. Solo código de servidor.
//
// El enlace no se guarda en ningún lado: va firmado con la llave secreta del
// servidor, así que nadie puede fabricar el de otro reporte ni el de otro
// video. Quien tiene el PDF ya tiene las fotos; con esto alcanza también los
// videos que ese mismo PDF trae (los marcados como internos no llevan enlace
// y la página los rechaza).

function llave(): string | null {
  return process.env.SUPABASE_SECRET_KEY || null;
}

function huella(videoPath: string): string {
  return createHash('sha256').update(videoPath).digest('base64url').slice(0, 10);
}

function firma(reportId: string, h: string, secreto: string): string {
  return createHmac('sha256', secreto).update(`video-evidencia:${reportId}:${h}`).digest('base64url').slice(0, 22);
}

// null si el servidor no tiene la llave: el PDF sale sin QR.
export function urlVideoPublico(reportId: string, videoPath: string): string | null {
  const secreto = llave();
  if (!secreto || !reportId || !videoPath) return null;
  const h = huella(videoPath);
  return `${MARCA.appUrl.replace(/\/$/, '')}/evidencia/${reportId}.${h}.${firma(reportId, h, secreto)}`;
}

// Devuelve el reporte y la huella del video si el enlace es auténtico.
export function leerTokenVideo(token: string): { reportId: string; huella: string } | null {
  const secreto = llave();
  const [reportId, h, f, ...resto] = (token || '').split('.');
  if (!secreto || !reportId || !h || !f || resto.length) return null;
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) return null;
  const esperada = Buffer.from(firma(reportId, h, secreto));
  const recibida = Buffer.from(f);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  return { reportId, huella: h };
}

export function coincideVideo(videoPath: string, h: string): boolean {
  return huella(videoPath) === h;
}
