import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { createAdminClient, hayClienteAdmin } from '@/lib/supabaseAdmin';
import { avisarUsuarios } from '@/lib/cronPush';
import { horaActualMexico } from '@/lib/horaMexico';
import { sumarDias } from '@/lib/fechaHoy';
import { MARCA } from '@/lib/marca';
import { mensajeTrasFirma } from '@/lib/paradas';

export const dynamic = 'force-dynamic';

// Aviso inmediato: el técnico se quedó con el cliente más de 15 min después
// de la firma. Lo detecta detectar_paradas() (pg_cron cada 15 min) y este
// endpoint, llamado por pg_cron con el secreto compartido, le manda un push
// para que diga qué fue en el momento y no al final del día. Cada parada se
// avisa una sola vez (paradas_detectadas.avisado_en).
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
  webpush.setVapidDetails(`mailto:${MARCA.correoSoporte}`, publica, privada);
  if (!hayClienteAdmin()) {
    return NextResponse.json({ enviadas: 0, motivo: 'falta secret key' });
  }
  const admin = createAdminClient();

  // Solo de ayer y hoy: lo más viejo ya lo cubre el recordatorio de la mañana.
  const { fecha: hoy } = horaActualMexico();
  const { data, error } = await admin
    .from('paradas_detectadas')
    .select('id, tecnico_id, minutos, clientes(nombre)')
    .not('reporte_id', 'is', null)
    .is('estado', null)
    .is('avisado_en', null)
    .gte('fecha', sumarDias(hoy, -1));
  if (error) {
    console.error('No se pudieron leer las paradas después de la firma:', error.message);
    return NextResponse.json({ error: 'No se pudieron leer las paradas' }, { status: 500 });
  }

  let enviadas = 0;
  const caducadas: string[] = [];
  const avisadas: string[] = [];
  for (const parada of (data || []) as any[]) {
    const cliente = (Array.isArray(parada.clientes) ? parada.clientes[0]?.nombre : parada.clientes?.nombre) || null;
    const mensaje = mensajeTrasFirma(cliente, parada.minutos);
    const carga = JSON.stringify({ titulo: mensaje.titulo, cuerpo: mensaje.cuerpo, url: '/mis-reportes', tag: `tras-firma-${parada.id}` });
    const r = await avisarUsuarios(admin, [parada.tecnico_id], 'reporte_pendiente', carga);
    enviadas += r.enviadas;
    caducadas.push(...r.caducadas);
    avisadas.push(parada.id);
  }

  // Se marca aunque el técnico no tenga notificaciones: lo verá en Mis reportes.
  if (avisadas.length > 0) {
    const { error: errMarca } = await admin.from('paradas_detectadas').update({ avisado_en: new Date().toISOString() }).in('id', avisadas);
    if (errMarca) console.error('No se pudo marcar el aviso de las paradas:', errMarca.message);
  }
  if (caducadas.length > 0) {
    await admin.from('push_suscripciones').delete().in('endpoint', caducadas);
  }
  return NextResponse.json({ enviadas, paradas: avisadas.length, limpiadas: caducadas.length });
}
