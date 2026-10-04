import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { createAdminClient, hayClienteAdmin } from '@/lib/supabaseAdmin';
import { horaActualMexico } from '@/lib/horaMexico';
import { recordatorioCorte, fechaBonita } from '@/lib/solicitudesPersonal';
import { avisarUsuarios } from '@/lib/cronPush';
import { sumarDias } from '@/lib/fechaHoy';
import { INICIO_COBERTURA, agruparPorTecnico, inicioVentana, mensajePendiente } from '@/lib/coberturaReportes';
import { MARCA, MARCA_MAYUS } from '@/lib/marca';

export const dynamic = 'force-dynamic';

// Días acumulados sin reporte a partir de los cuales se avisa al supervisor.
const UMBRAL_ESCALAMIENTO = 2;

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
  webpush.setVapidDetails(`mailto:${MARCA.correoSoporte}`, publica, privada);

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

  // Escalamiento (solo en la mañana): si un técnico acumula 2 días o más sin
  // reporte ni justificación, el supervisor recibe un resumen. El técnico ya
  // tuvo sus avisos; a partir de aquí lo resuelve quien coordina.
  let escalados = 0;
  if (momento === 'manana') {
    const atrasados = [...porTecnico].filter(([, fechas]) => fechas.length >= UMBRAL_ESCALAMIENTO);
    if (atrasados.length > 0) {
      const { data: perfiles } = await admin.from('profiles').select('id, full_name').in('id', atrasados.map(([id]) => id));
      const nombre = (id: string) => ((perfiles as any[]) || []).find((p) => p.id === id)?.full_name?.split(' ')[0] || 'Personal técnico';
      const lista = atrasados
        .sort((a, b) => b[1].length - a[1].length)
        .map(([id, f]) => `${nombre(id)} (${f.length} días)`);
      const { data: sup } = await admin.rpc('destinatarios_notificacion_tipo', { p_destino: 'supervisores', p_tipo: 'reportes_atrasados' });
      const supIds = ((sup as any[]) || []).map((r) => (typeof r === 'string' ? r : r.destinatarios_notificacion_tipo));
      const carga = JSON.stringify({
        titulo: atrasados.length === 1 ? `Reportes atrasados: ${lista[0]}` : `${atrasados.length} personas con reportes atrasados`,
        cuerpo: atrasados.length === 1 ? 'Ya recibió sus avisos y sigue sin entregar.' : lista.join(', '),
        url: '/dashboard/reportes?sub=control',
        tag: 'reportes-atrasados',
      });
      // destinatarios_notificacion_tipo ya aplicó la preferencia; avisarUsuarios
      // la vuelve a filtrar con el mismo tipo, sin efecto adicional.
      const r = await avisarUsuarios(admin, supIds, 'reportes_atrasados', carga);
      escalados = r.enviadas;
      caducadas.push(...r.caducadas);
    }
  }

  // Vales de almacén con plazo vencido (solo en la mañana): al técnico que
  // los tiene y un resumen al almacén.
  let valesVencidos = 0;
  if (momento === 'manana') {
    const { data: vencidos } = await admin
      .from('almacen_vales')
      .select('id, folio, tecnico_id, cliente_nombre, fecha_limite, profiles!almacen_vales_tecnico_id_fkey(full_name)')
      .in('estado', ['en_uso', 'por_firmar'])
      .lt('fecha_limite', new Date().toISOString());
    const lista = (vencidos as any[]) || [];
    valesVencidos = lista.length;
    const porTec = new Map<string, any[]>();
    for (const v of lista) porTec.set(v.tecnico_id, [...(porTec.get(v.tecnico_id) || []), v]);
    for (const [tecId, vs] of porTec) {
      const carga = JSON.stringify({
        titulo: vs.length === 1 ? `Vale ${vs[0].folio} vencido` : `${vs.length} vales de almacén vencidos`,
        cuerpo: 'Devuelve lo del almacén o pide más días desde la app.',
        url: '/checklists',
        tag: 'vales-vencidos',
      });
      const r = await avisarUsuarios(admin, [tecId], 'vale_almacen', carga);
      caducadas.push(...r.caducadas);
    }
    if (lista.length > 0) {
      const { data: alm } = await admin.rpc('destinatarios_notificacion_tipo', { p_destino: 'almacen', p_tipo: 'vale_almacen' });
      const ids = ((alm as any[]) || []).map((r) => (typeof r === 'string' ? r : r.destinatarios_notificacion_tipo));
      const nombres = [...new Set(lista.map((v) => (Array.isArray(v.profiles) ? v.profiles[0]?.full_name : v.profiles?.full_name)?.split(' ')[0] || 'Personal técnico'))];
      const carga = JSON.stringify({
        titulo: `${lista.length} vale(s) de almacén vencidos`,
        cuerpo: `Fuera del almacén con plazo vencido: ${nombres.join(', ')}.`,
        url: '/dashboard/almacen?sub=vales',
        tag: 'vales-vencidos-almacen',
      });
      const r = await avisarUsuarios(admin, ids, 'vale_almacen', carga);
      caducadas.push(...r.caducadas);
    }
  }

  // Equipo instalado sin registro en almacén (solo en la mañana): recordatorio
  // al almacenista mientras haya pendientes.
  let equiposSinRegistro = 0;
  if (momento === 'manana') {
    const { data: pend, error: errPend } = await admin
      .from('almacen_equipos_instalados')
      .select('folio')
      .eq('estado', 'sin_registro');
    if (!errPend && pend && pend.length > 0) {
      equiposSinRegistro = pend.length;
      const folios = [...new Set((pend as any[]).map((p) => p.folio).filter(Boolean))];
      const { data: alm } = await admin.rpc('destinatarios_notificacion_tipo', { p_destino: 'almacen', p_tipo: 'equipo_sin_registro' });
      const ids = ((alm as any[]) || []).map((r) => (typeof r === 'string' ? r : r.destinatarios_notificacion_tipo));
      const carga = JSON.stringify({
        titulo: `${pend.length} equipo(s) instalados sin registro en almacén`,
        cuerpo: `Folio ${folios.slice(0, 4).join(', ')}${folios.length > 4 ? '…' : ''}. Regístralos en Almacén → Instalados.`,
        url: '/dashboard/almacen?sub=instalados',
        tag: 'equipo-sin-registro',
      });
      const r = await avisarUsuarios(admin, ids, 'equipo_sin_registro', carga);
      caducadas.push(...r.caducadas);
    }
  }

  // Corte de horas extra (solo en la mañana): los 2 días hábiles previos y el
  // día del corte. A quien autoriza, si hay horas por autorizar; a los
  // técnicos, una sola vez (2 días hábiles antes) para que manden las suyas.
  let horasPorAutorizar = 0;
  const corte = momento === 'manana' ? recordatorioCorte(hoy) : null;
  if (corte) {
    const { data: pend, error: errPend } = await admin
      .from('solicitudes_personal')
      .select('id')
      .eq('tipo', 'horas_extra')
      .eq('estado', 'pendiente')
      .lte('corte_pago', corte.corte);
    if (!errPend) {
      horasPorAutorizar = (pend || []).length;
      const cuando = corte.faltan === 0 ? 'hoy' : `el ${fechaBonita(corte.corte)}`;
      if (horasPorAutorizar > 0) {
        const { data: aut } = await admin.rpc('destinatarios_notificacion_tipo', { p_destino: 'personal', p_tipo: 'solicitud_personal' });
        const ids = ((aut as any[]) || []).map((r) => (typeof r === 'string' ? r : r.destinatarios_notificacion_tipo));
        const carga = JSON.stringify({
          titulo: `${horasPorAutorizar} solicitud(es) de horas extra por autorizar`,
          cuerpo: `Se paga ${cuando}. Autorízalas antes del cierre de nómina.`,
          url: '/dashboard/personal',
          tag: 'corte-horas-extra',
        });
        const r = await avisarUsuarios(admin, ids, 'solicitud_personal', carga);
        caducadas.push(...r.caducadas);
      }
      if (corte.faltan === 2) {
        const { data: tecs } = await admin.from('profiles').select('id').eq('role', 'tecnico').eq('activo', true);
        const carga = JSON.stringify({
          titulo: 'Cierre de nómina: horas extra',
          cuerpo: `Se paga ${cuando}. Si trabajaste horas extra, mándalas hoy desde Solicitudes para que entren en la nómina.`,
          url: '/solicitudes',
          tag: 'corte-horas-extra',
        });
        const r = await avisarUsuarios(admin, ((tecs as any[]) || []).map((t) => t.id), 'solicitud_personal', carga);
        caducadas.push(...r.caducadas);
      }
    }
  }

  if (caducadas.length > 0) {
    await admin.from('push_suscripciones').delete().in('endpoint', caducadas);
  }

  return NextResponse.json({ enviadas, tecnicos: porTecnico.size, escalados, valesVencidos, equiposSinRegistro, horasPorAutorizar, limpiadas: caducadas.length });
}
