import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { createAdminClient, hayClienteAdmin } from '@/lib/supabaseAdmin';
import { horaActualMexico } from '@/lib/horaMexico';
import { avisarUsuarios } from '@/lib/cronPush';
import { sumarDias } from '@/lib/fechaHoy';
import { INICIO_COBERTURA, agruparPorTecnico, inicioVentana, mensajePendiente } from '@/lib/coberturaReportes';

export const dynamic = 'force-dynamic';

// Recordatorio de reporte de servicio pendiente, por técnico. Dos horarios,
// un mismo endpoint. Mismo secreto compartido que /api/cron/recordatorios:
// esto lo llama pg_cron, no una persona con sesión.
//
// Qué cuenta como pendiente lo decide dias_sin_reporte() en SQL: día hábil
// (o fin de semana con servicio programado), no festivo, sin reporte donde
// el técnico aparezca y sin justificación.
//
// 'tarde' (18:00 México): solo hoy.
// 'manana' (9:00 México): los días anteriores que sigan pendientes; se
// repite cada mañana hasta que se cubran.
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
  const desde = momento === 'tarde' ? hoy : inicioVentana(hoy);
  const hasta = momento === 'tarde' ? hoy : sumarDias(hoy, -1);
  if (hasta < INICIO_COBERTURA || desde > hasta) {
    return NextResponse.json({ enviadas: 0, motivo: 'fuera del periodo de cobertura' });
  }

  const { data: filas, error } = await admin.rpc('dias_sin_reporte', { p_desde: desde, p_hasta: hasta });
  if (error) {
    console.error('No se pudieron calcular los días sin reporte:', error.message);
    return NextResponse.json({ error: 'Error calculando pendientes' }, { status: 500 });
  }

  const porTecnico = agruparPorTecnico((filas as any[]) || []);
  let enviadas = 0;
  const caducadas: string[] = [];

  for (const [tecnicoId, fechas] of porTecnico) {
    const { titulo, cuerpo } = mensajePendiente(momento, fechas);
    const carga = JSON.stringify({
      titulo,
      cuerpo,
      url: '/mis-reportes?pendientes=1',
      tag: `reporte-pendiente-${momento}`,
    });
    const r = await avisarUsuarios(admin, [tecnicoId], 'reporte_pendiente', carga);
    enviadas += r.enviadas;
    caducadas.push(...r.caducadas);
  }

  if (caducadas.length > 0) {
    await admin.from('push_suscripciones').delete().in('endpoint', caducadas);
  }

  return NextResponse.json({ enviadas, tecnicos: porTecnico.size, limpiadas: caducadas.length });
}
