import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { createAdminClient, hayClienteAdmin } from '@/lib/supabaseAdmin';
import { horaActualMexico, minutosTranscurridos } from '@/lib/horaMexico';
import { avisarTecnicos, avisarUsuarios } from '@/lib/cronPush';
import { sumarDias } from '@/lib/fechaHoy';
import { tocaRecordarTecnico, tocaAvisarSupervisores } from '@/lib/confirmacionServicio';

export const dynamic = 'force-dynamic';

// Cuánto margen se le da a un técnico después de su hora programada antes de
// recordarle que no ha marcado llegada. Mismo criterio que el recordatorio
// de "en sitio sin iniciar": se corre cada 10 min, así que 10 min de margen
// es como máximo un ciclo de retraso antes del primer aviso.
const MARGEN_LLEGADA_MIN = 10;

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

  let enviadas = 0;
  const caducadas: string[] = [];
  let serviciosRevisados = 0;

  // Caso 1: "en sitio" y sin hora de inicio — llegó, pero no arrancó. Es
  // justo el estado que se supone breve; si sigue así 10 minutos después,
  // se le recuerda.
  const { data: sinIniciar, error: eSinIniciar } = await admin
    .from('servicios_programados')
    .select('id, proyecto')
    .eq('estado', 'en_sitio')
    .is('hora_inicio', null);
  if (eSinIniciar) {
    console.error('No se pudieron leer los servicios en sitio:', eSinIniciar.message);
    return NextResponse.json({ error: 'Error leyendo servicios' }, { status: 500 });
  }
  serviciosRevisados += sinIniciar?.length || 0;

  for (const s of sinIniciar || []) {
    // Mismo tag en cada corrida: la notificación se reemplaza en vez de
    // apilarse si el técnico sigue sin iniciar diez minutos después.
    const carga = JSON.stringify({
      titulo: 'Sigues en sitio',
      cuerpo: `No has iniciado «${s.proyecto}». Si ya estás trabajando, márcalo para llevar el tiempo real.`,
      url: `/servicios/${s.id}`,
      tag: `recordatorio-${s.id}`,
    });
    const r = await avisarTecnicos(admin, s.id, 'recordatorio_iniciar_servicio', carga);
    enviadas += r.enviadas;
    caducadas.push(...r.caducadas);
  }

  // Caso 2: sigue "programado" y ya pasó su hora de llegada con margen — ni
  // el GPS ni el técnico marcaron nada. Antes esto no le recordaba a nadie.
  const { fecha: hoy, horaMin: horaActualMin } = horaActualMexico();
  const { data: sinLlegar, error: eSinLlegar } = await admin
    .from('servicios_programados')
    .select('id, proyecto, hora_programada')
    .eq('estado', 'programado')
    .eq('fecha', hoy)
    .not('hora_programada', 'is', null);
  if (eSinLlegar) {
    console.error('No se pudieron leer los servicios sin llegada:', eSinLlegar.message);
    return NextResponse.json({ error: 'Error leyendo servicios' }, { status: 500 });
  }

  const atrasados = (sinLlegar || []).filter(
    (s) => minutosTranscurridos(s.hora_programada as string, horaActualMin) >= MARGEN_LLEGADA_MIN
  );
  serviciosRevisados += atrasados.length;

  for (const s of atrasados) {
    const carga = JSON.stringify({
      titulo: 'Aún no marcas llegada',
      cuerpo: `Ya pasó tu hora programada para «${s.proyecto}» y no se ha registrado tu llegada.`,
      url: `/servicios/${s.id}`,
      tag: `recordatorio-llegada-${s.id}`,
    });
    const r = await avisarTecnicos(admin, s.id, 'recordatorio_llegada_pendiente', carga);
    enviadas += r.enviadas;
    caducadas.push(...r.caducadas);
  }

  // Caso 3: servicio asignado de hoy o mañana que el técnico no ha
  // confirmado («Enterado»). Primero se le recuerda a él; si una hora
  // después sigue igual, se avisa a los supervisores. Una vez cada cosa.
  const ahoraMs = Date.now();
  const { data: sinConfirmar, error: eSinConfirmar } = await admin
    .from('servicio_tecnicos')
    .select('id, tecnico_id, asignado_en, recordatorio_enterado_en, escalado_enterado_en, profiles(full_name), servicios_programados!inner(id, proyecto, fecha, estado)')
    .is('enterado_en', null)
    .eq('servicios_programados.estado', 'programado')
    .gte('servicios_programados.fecha', hoy)
    .lte('servicios_programados.fecha', sumarDias(hoy, 1));
  if (eSinConfirmar) {
    // No se corta el resto: los casos 1 y 2 ya se enviaron.
    console.error('No se pudieron leer las confirmaciones pendientes:', eSinConfirmar.message);
  }

  const recordados: string[] = [];
  const porEscalar = new Map<string, { proyecto: string; fecha: string; nombres: string[]; filas: string[] }>();
  for (const f of (sinConfirmar as any[]) || []) {
    const sv = Array.isArray(f.servicios_programados) ? f.servicios_programados[0] : f.servicios_programados;
    if (!sv) continue;
    const [y, m, d] = (sv.fecha as string).split('-');
    const fechaTxt = `${d}/${m}/${y}`;

    if (!f.recordatorio_enterado_en) {
      if (tocaRecordarTecnico({ fecha: sv.fecha, asignadoEn: f.asignado_en, hoy, horaMin: horaActualMin, ahoraMs })) {
        const carga = JSON.stringify({
          titulo: 'Confirma tu servicio',
          cuerpo: `«${sv.proyecto}» ${sv.fecha === hoy ? 'es hoy' : 'es mañana'} (${fechaTxt}). Toca «Enterado» para confirmar que lo viste.`,
          url: `/servicios/${sv.id}`,
          tag: `confirmar-servicio-${sv.id}`,
        });
        const r = await avisarUsuarios(admin, [f.tecnico_id], 'recordatorio_confirmar_servicio', carga);
        enviadas += r.enviadas;
        caducadas.push(...r.caducadas);
        recordados.push(f.id);
      }
    } else if (!f.escalado_enterado_en && tocaAvisarSupervisores({ recordatorioEn: f.recordatorio_enterado_en, horaMin: horaActualMin, ahoraMs })) {
      const nombre = (Array.isArray(f.profiles) ? f.profiles[0]?.full_name : f.profiles?.full_name) || 'Un técnico';
      const g = porEscalar.get(sv.id) || { proyecto: sv.proyecto as string, fecha: fechaTxt, nombres: [] as string[], filas: [] as string[] };
      g.nombres.push(nombre);
      g.filas.push(f.id);
      porEscalar.set(sv.id, g);
    }
  }

  if (recordados.length > 0) {
    await admin.from('servicio_tecnicos').update({ recordatorio_enterado_en: new Date().toISOString() }).in('id', recordados);
  }

  if (porEscalar.size > 0) {
    const { data: sup } = await admin.rpc('destinatarios_notificacion_tipo', {
      p_destino: 'supervisores',
      p_tipo: 'servicio_sin_confirmar',
    });
    const supervisores = ((sup as any[]) || []).map((r) => (typeof r === 'string' ? r : r.destinatarios_notificacion_tipo));
    const escalados: string[] = [];
    for (const [servicioId, g] of porEscalar) {
      const carga = JSON.stringify({
        titulo: 'Servicio sin confirmar',
        cuerpo: `${g.nombres.join(', ')} no ha${g.nombres.length > 1 ? 'n' : ''} confirmado «${g.proyecto}» del ${g.fecha}.`,
        url: `/dashboard/servicios/${servicioId}`,
        tag: `sin-confirmar-${servicioId}`,
      });
      const r = await avisarUsuarios(admin, supervisores, 'servicio_sin_confirmar', carga);
      enviadas += r.enviadas;
      caducadas.push(...r.caducadas);
      escalados.push(...g.filas);
    }
    await admin.from('servicio_tecnicos').update({ escalado_enterado_en: new Date().toISOString() }).in('id', escalados);
  }

  if (caducadas.length > 0) {
    await admin.from('push_suscripciones').delete().in('endpoint', caducadas);
  }

  return NextResponse.json({ enviadas, servicios: serviciosRevisados, limpiadas: caducadas.length });
}
