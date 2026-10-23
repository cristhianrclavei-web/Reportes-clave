import { createSign } from 'crypto';

// Envío de notificaciones a la app de Android de Clave por Firebase Cloud
// Messaging (FCM). La página dentro del APK no puede recibir las
// notificaciones del navegador, así que el teléfono se registra con un
// «token» de Firebase y se guarda en push_suscripciones con el endpoint
// «fcm:<token>» (ver lib/pushNativo.ts).
//
// Necesita la variable FIREBASE_CUENTA_SERVICIO en Vercel: el JSON completo
// de la cuenta de servicio del proyecto de Firebase (es secreta).

export const PREFIJO_FCM = 'fcm:';

type CuentaServicio = { project_id: string; client_email: string; private_key: string };

export function leerCuentaServicio(): CuentaServicio | null {
  const texto = process.env.FIREBASE_CUENTA_SERVICIO;
  if (!texto) return null;
  try {
    const cuenta = JSON.parse(texto);
    if (!cuenta.project_id || !cuenta.client_email || !cuenta.private_key) return null;
    return cuenta;
  } catch {
    console.error('FIREBASE_CUENTA_SERVICIO no es un JSON válido');
    return null;
  }
}

function base64url(texto: string | Buffer): string {
  return Buffer.from(texto).toString('base64url');
}

// Firma que Google pide para dar un permiso de acceso de una hora.
export function firmarJwt(cuenta: CuentaServicio, ahoraSeg: number): string {
  const encabezado = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const datos = base64url(JSON.stringify({
    iss: cuenta.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: ahoraSeg,
    exp: ahoraSeg + 3600,
  }));
  const firma = createSign('RSA-SHA256').update(`${encabezado}.${datos}`).sign(cuenta.private_key);
  return `${encabezado}.${datos}.${base64url(firma)}`;
}

// El permiso dura una hora; se reutiliza mientras le queden 5 minutos.
let permiso: { token: string; venceMs: number } | null = null;

async function permisoDeGoogle(cuenta: CuentaServicio): Promise<string> {
  if (permiso && permiso.venceMs - Date.now() > 5 * 60 * 1000) return permiso.token;
  const respuesta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: firmarJwt(cuenta, Math.floor(Date.now() / 1000)),
    }),
  });
  if (!respuesta.ok) throw new Error(`Google rechazó la cuenta de servicio (${respuesta.status})`);
  const datos = await respuesta.json();
  permiso = { token: datos.access_token, venceMs: Date.now() + datos.expires_in * 1000 };
  return permiso.token;
}

// Devuelve 'ok', 'caducado' (el teléfono ya no existe: hay que borrar la
// fila) o 'error'.
export async function enviarFcm(
  cuenta: CuentaServicio,
  tokenTelefono: string,
  aviso: { titulo: string; cuerpo: string; url: string; tag?: string }
): Promise<'ok' | 'caducado' | 'error'> {
  try {
    const acceso = await permisoDeGoogle(cuenta);
    const respuesta = await fetch(`https://fcm.googleapis.com/v1/projects/${cuenta.project_id}/messages:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${acceso}` },
      body: JSON.stringify({
        message: {
          token: tokenTelefono,
          notification: { title: aviso.titulo, body: aviso.cuerpo },
          data: { url: aviso.url },
          android: {
            priority: 'high',
            // El mismo tag reemplaza al aviso anterior en vez de apilarlo.
            notification: aviso.tag ? { tag: aviso.tag } : {},
          },
        },
      }),
    });
    if (respuesta.ok) return 'ok';
    if (respuesta.status === 404) return 'caducado';
    console.error('Fallo al enviar FCM:', respuesta.status, await respuesta.text().catch(() => ''));
    return 'error';
  } catch (e) {
    console.error('Fallo al enviar FCM:', e);
    return 'error';
  }
}
