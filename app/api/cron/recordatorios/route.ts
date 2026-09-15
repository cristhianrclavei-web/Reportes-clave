import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { createAdminClient, hayClienteAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Recordatorio de "sigues en sitio sin iniciar el servicio". A diferencia de
// /api/push, esta ruta no la llama un usuario logueado — la llama Supabase
// (pg_cron + pg_net) cada 10 minutos, así que no hay sesión que validar. En
// su lugar se protege con un secreto compartido que solo conocen el cron job
// y esta ruta.
export async function POST(request: NextRequest) {
  const secreto = request.headers.get('x-cron-secret');
  if (!secreto || secreto !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!publica || !privada) {
    return NextResponse.json({ enviadas: 0, motivo: 'push no configurado' });
  }
  webpush.setVapidDetails('mailto:soporte@clave-i.mx', publica, privada);

  if (!hayClienteAdmin()) {
    return NextResponse.json({ enviadas: 0, motivo: 'falta secret key' });
  }
  const admin = createAdminClient();

  // "En sitio" y sin hora de inicio: llegó, pero no arrancó. Es justo el
  // estado que se supone breve — si sigue así 10 minutos después, se le
  // recuerda.
  const { data: servicios, error: eServicios } = await admin
    .from('servicios_programados')
    .select('id, proyecto')
    .eq('estado', 'en_sitio')
    .is('hora_inicio', null);
  if (eServicios) {
    console.error('No se pudieron leer los servicios en sitio:', eServicios.message);
    return NextResponse.json({ error: 'Error leyendo servicios' }, { status: 500 });
  }
  if (!servicios || servicios.length === 0) {
    return NextResponse.json({ enviadas: 0, servicios: 0 });
  }

  let enviadas = 0;
  const caducadas: string[] = [];

  for (const s of servicios) {
    const { data: asignaciones } = await admin
      .from('servicio_tecnicos')
      .select('tecnico_id')
      .eq('servicio_id', s.id);
    const tecnicoIds = (asignaciones || []).map((a: any) => a.tecnico_id as string);
    if (tecnicoIds.length === 0) continue;

    const { data: filtrados } = await admin.rpc('filtrar_por_preferencia', {
      p_usuarios: tecnicoIds,
      p_tipo: 'recordatorio_iniciar_servicio',
    });
    const ids = ((filtrados as any[]) || []).map((r) => (typeof r === 'string' ? r : r.filtrar_por_preferencia));
    if (ids.length === 0) continue;

    const { data: subs } = await admin
      .from('push_suscripciones')
      .select('usuario_id, endpoint, p256dh, auth')
      .in('usuario_id', ids);
    if (!subs || subs.length === 0) continue;

    // Mismo tag en cada corrida: la notificación se reemplaza en vez de
    // apilarse si el técnico sigue sin iniciar diez minutos después.
    const carga = JSON.stringify({
      titulo: 'Sigues en sitio',
      cuerpo: `No has iniciado «${s.proyecto}». Si ya estás trabajando, márcalo para llevar el tiempo real.`,
      url: `/servicios/${s.id}`,
      tag: `recordatorio-${s.id}`,
    });

    await Promise.all(
      subs.map(async (sub: any) => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, carga);
          enviadas++;
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            caducadas.push(sub.endpoint);
          } else {
            console.error('Fallo al enviar recordatorio:', e?.statusCode, e?.body);
          }
        }
      })
    );
  }

  if (caducadas.length > 0) {
    await admin.from('push_suscripciones').delete().in('endpoint', caducadas);
  }

  return NextResponse.json({ enviadas, servicios: servicios.length, limpiadas: caducadas.length });
}
