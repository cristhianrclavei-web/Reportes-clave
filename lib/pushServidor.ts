import webpush from 'web-push';
import { createAdminClient, hayClienteAdmin } from './supabaseAdmin';
import { MARCA } from './marca';

// La dirección que abre un aviso al tocarlo solo puede ser una pantalla de
// la app. Sin esto, cualquier cuenta podía mandar a los supervisores un aviso
// que abriera un sitio ajeno (por ejemplo, una copia falsa del login).
// «//sitio» y «/\sitio» también salen de la app, por eso se revisa el
// segundo carácter.
export function rutaInterna(url: unknown): string {
  if (typeof url !== 'string') return '/';
  const empiezaConDiagonal = url.startsWith('/');
  const segundo = url.charAt(1);
  const saleDeLaApp = segundo === '/' || segundo === '\\';
  if (!empiezaConDiagonal || saleDeLaApp) return '/';
  return url;
}

// Envío de push desde el servidor a una lista de usuarios ya resuelta (con
// sus preferencias aplicadas). Lo usan /api/push y los avisos que dispara
// alguien sin sesión, como el cliente que firma por enlace.
export async function enviarPush(
  ids: string[],
  aviso: { titulo: string; mensaje: string; url?: string; tag?: string }
): Promise<{ enviadas: number; limpiadas?: number; motivo?: string }> {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!publica || !privada) return { enviadas: 0, motivo: 'push no configurado' };
  if (ids.length === 0) return { enviadas: 0 };
  if (!hayClienteAdmin()) return { enviadas: 0, motivo: 'falta secret key' };

  webpush.setVapidDetails(`mailto:${MARCA.correoSoporte}`, publica, privada);
  const admin = createAdminClient();

  // Leer las suscripciones con el cliente admin en lugar de la funcion
  // SECURITY DEFINER: una capa menos que auditar, y el mismo resultado.
  const { data: subs } = await admin
    .from('push_suscripciones')
    .select('usuario_id, endpoint, p256dh, auth')
    .in('usuario_id', ids);

  const suscripciones = (subs as any[]) || [];
  if (suscripciones.length === 0) return { enviadas: 0 };

  const carga = JSON.stringify({ titulo: aviso.titulo, cuerpo: aviso.mensaje, url: rutaInterna(aviso.url), tag: aviso.tag });
  let enviadas = 0;
  const caducadas: string[] = [];

  await Promise.all(
    suscripciones.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          carga
        );
        enviadas++;
      } catch (e: any) {
        // 404 y 410 significan que el navegador desecho la suscripcion: se
        // limpia para no seguir intentando en cada aviso.
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          caducadas.push(s.endpoint);
        } else {
          console.error('Fallo al enviar push:', e?.statusCode, e?.body);
        }
      }
    })
  );

  // Este borrado se hacia con la sesion de quien disparaba el aviso, y las
  // filas a limpiar son de otras personas: la RLS lo bloqueaba sin error y
  // las suscripciones muertas nunca se iban. Con el cliente admin si se van.
  if (caducadas.length > 0) {
    const { error } = await admin.from('push_suscripciones').delete().in('endpoint', caducadas);
    if (error) console.error('No se pudieron limpiar suscripciones caducadas:', error.message);
  }

  return { enviadas, limpiadas: caducadas.length };
}
