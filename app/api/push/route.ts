import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@/lib/supabaseServer';
import { createAdminClient, hayClienteAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Tipos de aviso que el servidor acepta. La lista vive tambien en lib/push.ts
// para la pantalla de preferencias; aqui se repite a proposito, porque una
// validacion que importa el catalogo del cliente no valida nada.
const TIPOS_VALIDOS = new Set([
  'solicitud_herramienta',
  'stock_bajo',
  'servicio_asignado',
  'llegada_servicio',
  'inicio_servicio',
  'cierre_servicio',
  'bitacora_inicio',
  'bitacora_fin',
  'reporte_nuevo',
  'correccion_solicitada',
  'correccion_resuelta',
  'aviso_servicio',
  'tecnico_fuera_de_sitio',
  'general',
]);

const DESTINOS_VALIDOS = new Set(['supervisores', 'almacen']);

// Envio de notificaciones push. Corre en el servidor porque la clave privada
// VAPID no puede salir de aqui.
export async function POST(request: NextRequest) {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;

  if (!publica || !privada) {
    // Sin claves configuradas no se envia nada, pero tampoco se rompe el flujo
    // que disparo el aviso: la accion principal ya se completo.
    return NextResponse.json({ enviadas: 0, motivo: 'push no configurado' });
  }

  webpush.setVapidDetails('mailto:soporte@clave-i.mx', publica, privada);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sin sesion' }, { status: 401 });
  }

  let cuerpo: any;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: 'Peticion invalida' }, { status: 400 });
  }

  const { destino, usuarios, titulo, mensaje, url, tag, tipo } = cuerpo || {};
  if (!titulo || !mensaje) {
    return NextResponse.json({ error: 'Falta titulo o mensaje' }, { status: 400 });
  }
  if (typeof titulo !== 'string' || typeof mensaje !== 'string') {
    return NextResponse.json({ error: 'Titulo o mensaje invalido' }, { status: 400 });
  }

  const tipoAviso = tipo || 'general';
  if (!TIPOS_VALIDOS.has(tipoAviso)) {
    return NextResponse.json({ error: 'Tipo de aviso desconocido' }, { status: 400 });
  }
  if (destino && !DESTINOS_VALIDOS.has(destino)) {
    return NextResponse.json({ error: 'Destino desconocido' }, { status: 400 });
  }

  // Tener sesion bastaba para mandar lo que fuera a quien fuera. Un tecnico
  // avisando a los supervisores es legitimo y asi sigue; elegir a dedo una
  // lista de destinatarios no lo es: eso solo lo hace quien coordina.
  if (Array.isArray(usuarios) && usuarios.length > 0) {
    const { data: perfil } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (perfil?.role !== 'supervisor') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
  }

  // Recortado para que un texto largo no llegue a la pantalla de bloqueo como
  // un muro: lo que no cabe ahi tampoco se lee.
  const tituloLimpio = titulo.slice(0, 120);
  const mensajeLimpio = mensaje.slice(0, 300);

  // Resolver a quien va, respetando lo que cada quien eligio recibir.
  let ids: string[] = [];

  if (Array.isArray(usuarios) && usuarios.length > 0) {
    const { data } = await supabase.rpc('filtrar_por_preferencia', {
      p_usuarios: usuarios,
      p_tipo: tipoAviso,
    });
    ids = ((data as any[]) || []).map((r) => (typeof r === 'string' ? r : r.filtrar_por_preferencia));
  } else if (destino) {
    const { data } = await supabase.rpc('destinatarios_notificacion_tipo', {
      p_destino: destino,
      p_tipo: tipoAviso,
    });
    ids = ((data as any[]) || []).map((r) => (typeof r === 'string' ? r : r.destinatarios_notificacion_tipo));
  }

  // Nadie se notifica a si mismo: quien hace la accion ya sabe que la hizo.
  ids = ids.filter((id) => id && id !== user.id);
  if (ids.length === 0) {
    return NextResponse.json({ enviadas: 0 });
  }

  if (!hayClienteAdmin()) {
    return NextResponse.json({ enviadas: 0, motivo: 'falta secret key' });
  }
  const admin = createAdminClient();

  // Leer las suscripciones con el cliente admin en lugar de la funcion
  // SECURITY DEFINER: una capa menos que auditar, y el mismo resultado.
  const { data: subs } = await admin
    .from('push_suscripciones')
    .select('usuario_id, endpoint, p256dh, auth')
    .in('usuario_id', ids);

  const suscripciones = (subs as any[]) || [];
  if (suscripciones.length === 0) {
    return NextResponse.json({ enviadas: 0 });
  }

  const carga = JSON.stringify({ titulo: tituloLimpio, cuerpo: mensajeLimpio, url: url || '/', tag });
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

  return NextResponse.json({ enviadas, limpiadas: caducadas.length });
}
