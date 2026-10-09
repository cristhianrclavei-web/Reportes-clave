import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { createAdminClient, hayClienteAdmin } from '@/lib/supabaseAdmin';
import { avisarTecnicos, avisarUsuarios } from '@/lib/cronPush';
import { AJUSTES_POR_DEFECTO, AjustesOperacion, estadoPausa, avisoQueToca, textoTipoPausa, minutosTexto, PREAVISO_MIN } from '@/lib/pausas';
import { MARCA } from '@/lib/marca';

export const dynamic = 'force-dynamic';

// Recordatorios de pausa y verificaciones vencidas. La llama Supabase
// (pg_cron + pg_net) cada 2 minutos — ver patch_control_pausas.sql — así que
// no hay sesión que validar: se protege con el mismo secreto compartido que
// los demás cron.
//
// Cada pausa recibe como mucho tres avisos (por terminar, terminó, excedida)
// y el último también va a supervisión. `pausa_avisos` guarda cuál fue el
// último enviado para no repetirlos.
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

  let enviadas = 0;
  const caducadas: string[] = [];
  const ahoraMs = Date.now();

  const { data: filaAjustes } = await admin
    .from('ajustes_operacion')
    .select('comida_min, otras_pausas_min, tolerancia_min, verificacion_min')
    .maybeSingle();
  const ajustes: AjustesOperacion = { ...AJUSTES_POR_DEFECTO, ...((filaAjustes as Partial<AjustesOperacion>) || {}) };

  // ---------- Pausas en curso ----------
  const { data: pausados, error: ePausados } = await admin
    .from('servicios_programados')
    .select('id, proyecto, pausado_desde, pausa_tipo, pausa_limite_min, pausa_avisos, servicio_tecnicos(profiles(full_name))')
    .eq('estado', 'en_curso')
    .not('pausado_desde', 'is', null)
    .not('pausa_limite_min', 'is', null);
  if (ePausados) {
    console.error('No se pudieron leer las pausas en curso:', ePausados.message);
    return NextResponse.json({ error: 'Error leyendo pausas' }, { status: 500 });
  }

  let supervisores: string[] | null = null;
  async function idsSupervisores(): Promise<string[]> {
    if (supervisores) return supervisores;
    const { data } = await admin.rpc('destinatarios_notificacion_tipo', { p_destino: 'supervisores', p_tipo: 'pausa_excedida' });
    supervisores = ((data as any[]) || []).map((r) => (typeof r === 'string' ? r : r.destinatarios_notificacion_tipo));
    return supervisores;
  }

  for (const s of (pausados as any[]) || []) {
    const estado = estadoPausa(s.pausado_desde, s.pausa_limite_min, ahoraMs, ajustes.tolerancia_min);
    const nivel = avisoQueToca(estado, s.pausa_avisos || 0);
    if (!nivel) continue;

    // Se marca antes de enviar y solo si nadie más lo marcó: si dos corridas
    // se enciman, una sola manda el aviso.
    const { data: marcado } = await admin
      .from('servicios_programados')
      .update({ pausa_avisos: nivel })
      .eq('id', s.id)
      .eq('pausado_desde', s.pausado_desde)
      .lt('pausa_avisos', nivel)
      .select('id')
      .maybeSingle();
    if (!marcado) continue;

    const tipoTxt = textoTipoPausa(s.pausa_tipo).toLowerCase();
    const texto =
      nivel === 1
        ? {
            titulo: `Tu pausa termina en ${Math.max(1, Math.min(PREAVISO_MIN, estado.restantes))} min`,
            cuerpo: `Pausa de ${tipoTxt} en «${s.proyecto}». Al volver, toca «Reanudar servicio».`,
          }
        : nivel === 2
          ? {
              titulo: 'Terminó tu tiempo de pausa',
              cuerpo: `Ya pasaron ${minutosTexto(s.pausa_limite_min)} de ${tipoTxt}. Reanuda «${s.proyecto}».`,
            }
          : {
              titulo: `Llevas ${minutosTexto(estado.excedidos)} de más`,
              cuerpo: `Tu pausa de ${tipoTxt} en «${s.proyecto}» ya se excedió y se avisó a supervisión. Reanuda el servicio.`,
            };
    const r = await avisarTecnicos(
      admin, s.id, 'recordatorio_pausa',
      JSON.stringify({ ...texto, url: `/servicios/${s.id}`, tag: `pausa-${s.id}` })
    );
    enviadas += r.enviadas;
    caducadas.push(...r.caducadas);

    if (nivel === 3) {
      const nombres = ((s.servicio_tecnicos as any[]) || [])
        .map((st) => (Array.isArray(st.profiles) ? st.profiles[0]?.full_name : st.profiles?.full_name))
        .filter(Boolean);
      const r2 = await avisarUsuarios(
        admin, await idsSupervisores(), 'pausa_excedida',
        JSON.stringify({
          titulo: 'Pausa excedida',
          cuerpo: `${nombres.join(', ') || 'El personal'} lleva${nombres.length > 1 ? 'n' : ''} ${minutosTexto(estado.transcurridos)} en pausa de ${tipoTxt} en «${s.proyecto}» (permitido: ${minutosTexto(s.pausa_limite_min)}).`,
          url: `/dashboard/servicios/${s.id}`,
          tag: `pausa-excedida-${s.id}`,
        })
      );
      enviadas += r2.enviadas;
      caducadas.push(...r2.caducadas);
    }
  }

  // ---------- Verificaciones de presencia sin responder ----------
  const { data: vencidas } = await admin
    .from('verificaciones_presencia')
    .select('id, servicio_id, pedida_por, profiles!verificaciones_presencia_tecnico_id_fkey(full_name), servicios_programados(proyecto)')
    .eq('resultado', 'pendiente')
    .eq('aviso_vencida', false)
    .lte('vence_en', new Date(ahoraMs).toISOString());

  for (const v of (vencidas as any[]) || []) {
    const { data: marcada } = await admin
      .from('verificaciones_presencia')
      .update({ resultado: 'sin_respuesta', aviso_vencida: true })
      .eq('id', v.id)
      .eq('resultado', 'pendiente')
      .select('id')
      .maybeSingle();
    if (!marcada || !v.pedida_por) continue;
    const nombre = (Array.isArray(v.profiles) ? v.profiles[0]?.full_name : v.profiles?.full_name) || 'Alguien del personal';
    const sv = Array.isArray(v.servicios_programados) ? v.servicios_programados[0] : v.servicios_programados;
    const r = await avisarUsuarios(
      admin, [v.pedida_por], 'verificacion_presencia',
      JSON.stringify({
        titulo: 'Verificación sin respuesta',
        cuerpo: `${nombre} no respondió a tiempo en «${sv?.proyecto || 'su servicio'}». Puede no haber visto el aviso: conviene llamarle.`,
        url: `/dashboard/servicios/${v.servicio_id}`,
        tag: `verificacion-${v.servicio_id}`,
      })
    );
    enviadas += r.enviadas;
    caducadas.push(...r.caducadas);
  }

  if (caducadas.length > 0) {
    await admin.from('push_suscripciones').delete().in('endpoint', caducadas);
  }

  return NextResponse.json({ enviadas, pausas: pausados?.length || 0, vencidas: vencidas?.length || 0, limpiadas: caducadas.length });
}
