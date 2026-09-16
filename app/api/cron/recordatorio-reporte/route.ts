import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { createAdminClient, hayClienteAdmin } from '@/lib/supabaseAdmin';
import { horaActualMexico } from '@/lib/horaMexico';
import { avisarTecnicos } from '@/lib/cronPush';

export const dynamic = 'force-dynamic';

// Recordatorio de reporte de servicio pendiente. Dos horarios, un mismo
// endpoint — el momento decide qué día se revisa y cómo se redacta el
// aviso. Mismo secreto compartido que /api/cron/recordatorios: esto lo
// llama pg_cron, no una persona con sesión.
//
// 'tarde' (18:00 México): solo el día de hoy — es un recordatorio, no una
// alarma, así que no menciona días anteriores.
// 'manana' (8:30 México): todo lo que sigue sin reporte de días anteriores
// a hoy — se repite cada mañana mientras el reporte no llegue, no solo el
// día siguiente.
export async function POST(request: NextRequest) {
  const secreto = request.headers.get('x-cron-secret');
  if (!secreto || secreto !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let cuerpo: any;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 });
  }
  const momento = cuerpo?.momento;
  if (momento !== 'tarde' && momento !== 'manana') {
    return NextResponse.json({ error: 'Falta "momento": tarde | manana' }, { status: 400 });
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

  const { fecha: hoy } = horaActualMexico();

  let query = admin
    .from('servicios_programados')
    .select('id, proyecto, fecha')
    .in('estado', ['en_curso', 'concluido'])
    .is('report_id', null);
  query = momento === 'tarde' ? query.eq('fecha', hoy) : query.lt('fecha', hoy);

  const { data: servicios, error } = await query;
  if (error) {
    console.error('No se pudieron leer los servicios sin reporte:', error.message);
    return NextResponse.json({ error: 'Error leyendo servicios' }, { status: 500 });
  }

  let enviadas = 0;
  const caducadas: string[] = [];

  for (const s of servicios || []) {
    const carga =
      momento === 'tarde'
        ? JSON.stringify({
            titulo: 'Reporte de hoy pendiente',
            cuerpo: `No olvides hacer el reporte de «${s.proyecto}».`,
            url: '/mis-reportes',
            tag: `reporte-pendiente-${s.id}`,
          })
        : JSON.stringify({
            titulo: 'Sigue pendiente un reporte',
            cuerpo: `«${s.proyecto}» del ${new Date(`${s.fecha}T00:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })} todavía no tiene reporte.`,
            url: '/mis-reportes',
            tag: `reporte-pendiente-${s.id}`,
          });
    const r = await avisarTecnicos(admin, s.id, 'reporte_pendiente', carga);
    enviadas += r.enviadas;
    caducadas.push(...r.caducadas);
  }

  if (caducadas.length > 0) {
    await admin.from('push_suscripciones').delete().in('endpoint', caducadas);
  }

  return NextResponse.json({ enviadas, servicios: servicios?.length || 0, limpiadas: caducadas.length });
}
