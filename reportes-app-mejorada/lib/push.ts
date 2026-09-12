import { createClient } from './supabaseClient';

// Suscripción del dispositivo a notificaciones push y envío de avisos.
//
// El permiso lo concede el navegador y es por dispositivo: una persona con
// celular y computadora tiene dos suscripciones, y ambas reciben.

export function pushSoportado(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function permisoActual(): NotificationPermission | 'no-soportado' {
  if (!pushSoportado()) return 'no-soportado';
  return Notification.permission;
}

// La clave VAPID viaja en base64url y el navegador la pide como bytes.
function base64ToBytes(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normal);
  const buffer = new ArrayBuffer(raw.length);
  const vista = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) vista[i] = raw.charCodeAt(i);
  return buffer;
}

export async function activarNotificaciones(): Promise<{ ok: boolean; motivo?: string }> {
  if (!pushSoportado()) {
    return { ok: false, motivo: 'Este navegador no admite notificaciones.' };
  }

  const clavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!clavePublica) {
    return { ok: false, motivo: 'Las notificaciones no están configuradas en el servidor.' };
  }

  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') {
    return {
      ok: false,
      motivo:
        permiso === 'denied'
          ? 'Bloqueaste las notificaciones. Actívalas desde los ajustes del navegador para este sitio.'
          : 'No se concedió el permiso.',
    };
  }

  const registro = await navigator.serviceWorker.ready;

  // Si ya había una suscripción con otra clave, se descarta: el servidor no
  // podría firmar mensajes para ella.
  const previa = await registro.pushManager.getSubscription();
  if (previa) await previa.unsubscribe();

  const suscripcion = await registro.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64ToBytes(clavePublica),
  });

  const datos = suscripcion.toJSON();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, motivo: 'No hay sesión activa.' };

  const { error } = await supabase.from('push_suscripciones').upsert(
    {
      usuario_id: user.id,
      endpoint: datos.endpoint,
      p256dh: datos.keys?.p256dh,
      auth: datos.keys?.auth,
      user_agent: navigator.userAgent.slice(0, 200),
    },
    { onConflict: 'endpoint' }
  );
  if (error) return { ok: false, motivo: error.message };

  return { ok: true };
}

export async function desactivarNotificaciones(): Promise<void> {
  if (!pushSoportado()) return;
  const registro = await navigator.serviceWorker.ready;
  const suscripcion = await registro.pushManager.getSubscription();
  if (!suscripcion) return;

  const endpoint = suscripcion.endpoint;
  await suscripcion.unsubscribe();
  await createClient().from('push_suscripciones').delete().eq('endpoint', endpoint);
}

export async function tieneSuscripcionActiva(): Promise<boolean> {
  if (!pushSoportado() || Notification.permission !== 'granted') return false;
  const registro = await navigator.serviceWorker.ready;
  return !!(await registro.pushManager.getSubscription());
}

// Envía un aviso. Nunca lanza: una notificación que falla no debe tumbar la
// acción que la disparó (autorizar, programar, solicitar).
// Tipos de aviso. El `tipo` decide quién lo recibe según sus preferencias;
// el `tag` agrupa los repetidos en la pantalla de bloqueo.
export type TipoAviso =
  | 'solicitud_herramienta'
  | 'stock_bajo'
  | 'servicio_asignado'
  | 'llegada_servicio'
  | 'inicio_servicio'
  | 'cierre_servicio'
  | 'bitacora_inicio'
  | 'bitacora_fin'
  | 'reporte_nuevo'
  | 'correccion_solicitada'
  | 'aviso_servicio';

export const TIPOS_AVISO: { valor: TipoAviso; label: string; detalle: string; paraTecnico?: boolean }[] = [
  { valor: 'aviso_servicio', label: 'Avisos sobre días programados', detalle: 'Cuando un técnico avisa que un día no se va a poder' },
  { valor: 'solicitud_herramienta', label: 'Solicitudes de herramienta', detalle: 'Cuando un técnico pide material o equipo' },
  { valor: 'correccion_solicitada', label: 'Correcciones de reportes', detalle: 'Cuando un técnico pide corregir un reporte' },
  { valor: 'reporte_nuevo', label: 'Reportes concluidos', detalle: 'Cuando se guarda un reporte de servicio' },
  { valor: 'cierre_servicio', label: 'Cierre de servicios', detalle: 'Cuando un técnico termina un servicio' },
  { valor: 'stock_bajo', label: 'Existencias bajas', detalle: 'Cuando un artículo baja de su mínimo' },
  { valor: 'llegada_servicio', label: 'Llegadas a sitio', detalle: 'Cada vez que un técnico llega a un servicio' },
  { valor: 'inicio_servicio', label: 'Inicios de servicio', detalle: 'Cada vez que un técnico arranca un servicio' },
  { valor: 'bitacora_inicio', label: 'Inicio de actividades', detalle: 'Cuando alguien abre una actividad en bitácora' },
  { valor: 'bitacora_fin', label: 'Cierre de actividades', detalle: 'Cuando alguien concluye una actividad' },
  { valor: 'servicio_asignado', label: 'Servicios asignados', detalle: 'Cuando te programan un servicio', paraTecnico: true },
];

// Estos llegan apagados: son seguimiento del día y esa información ya está en
// vivo en el panel. Encenderlos es decisión de cada quien.
export const APAGADOS_POR_DEFECTO: TipoAviso[] = [
  'llegada_servicio', 'inicio_servicio', 'bitacora_inicio', 'bitacora_fin',
];

export async function leerPreferencias(): Promise<Record<string, boolean>> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};
  const { data } = await supabase.from('push_preferencias').select('tipo, activo').eq('usuario_id', user.id);
  const mapa: Record<string, boolean> = {};
  TIPOS_AVISO.forEach((t) => {
    mapa[t.valor] = !APAGADOS_POR_DEFECTO.includes(t.valor);
  });
  (data || []).forEach((r: any) => { mapa[r.tipo] = r.activo; });
  return mapa;
}

export async function guardarPreferencia(tipo: TipoAviso, activo: boolean): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('push_preferencias').upsert(
    { usuario_id: user.id, tipo, activo },
    { onConflict: 'usuario_id,tipo' }
  );
}

export async function notificar(opciones: {
  destino?: 'supervisores' | 'almacen';
  usuarios?: string[];
  titulo: string;
  mensaje: string;
  url?: string;
  tag?: string;
  tipo?: TipoAviso;
}): Promise<void> {
  try {
    await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opciones),
    });
  } catch (e) {
    console.error('No se pudo enviar la notificación:', e);
  }
}
