import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

// Envío de notificaciones push. Corre en el servidor porque la clave privada
// VAPID no puede salir de aquí.
//
// El destinatario se resuelve por rol ('supervisores', 'almacen') o por lista
// de usuarios. Quien llama debe tener sesión: no es un endpoint abierto.
export async function POST(request: NextRequest) {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;

  if (!publica || !privada) {
    // Sin claves configuradas no se envía nada, pero tampoco se rompe el flujo
    // que disparó el aviso: la acción principal ya se completó.
    return NextResponse.json({ enviadas: 0, motivo: 'push no configurado' });
  }

  webpush.setVapidDetails(
    'mailto:soporte@clave-i.mx',
    publica,
    privada
  );

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  }

  let cuerpo: any;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 });
  }

  const { destino, usuarios, titulo, mensaje, url, tag, tipo } = cuerpo || {};
  if (!titulo || !mensaje) {
    return NextResponse.json({ error: 'Falta título o mensaje' }, { status: 400 });
  }

  // Resolver a quién va, respetando lo que cada quien eligió recibir.
  const tipoAviso = tipo || 'general';
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

  // Nadie se notifica a sí mismo: quien hace la acción ya sabe que la hizo.
  ids = ids.filter((id) => id && id !== user.id);
  if (ids.length === 0) {
    return NextResponse.json({ enviadas: 0 });
  }

  const { data: subs } = await supabase.rpc('suscripciones_para_envio', { p_usuarios: ids });
  const suscripciones = (subs as any[]) || [];
  if (suscripciones.length === 0) {
    return NextResponse.json({ enviadas: 0 });
  }

  const carga = JSON.stringify({ titulo, cuerpo: mensaje, url: url || '/', tag });
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
        // 404 y 410 significan que el navegador desechó la suscripción: se
        // limpia para no seguir intentando en cada aviso.
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          caducadas.push(s.endpoint);
        } else {
          console.error('Fallo al enviar push:', e?.statusCode, e?.body);
        }
      }
    })
  );

  if (caducadas.length > 0) {
    await supabase.from('push_suscripciones').delete().in('endpoint', caducadas);
  }

  return NextResponse.json({ enviadas, limpiadas: caducadas.length });
}
