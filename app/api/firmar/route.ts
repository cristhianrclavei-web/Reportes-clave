import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient, hayClienteAdmin } from '@/lib/supabaseAdmin';
import { enviarPush } from '@/lib/pushServidor';

export const dynamic = 'force-dynamic';

// El cliente firma desde el enlace, sin sesión. La validación (token vigente,
// una sola vez, tamaño de la firma) la hace firma_remota_guardar() en la
// base; aquí solo se llama y, si salió bien, se avisa a quien hizo el
// reporte y a los supervisores.
export async function POST(request: NextRequest) {
  let cuerpo: any;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 });
  }
  const { token, nombre, firma } = cuerpo || {};
  if (typeof token !== 'string' || typeof nombre !== 'string' || typeof firma !== 'string') {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc('firma_remota_guardar', { p_token: token, p_nombre: nombre, p_firma: firma });
  if (error || !data) {
    // Solo los «raise exception» de la función (código P0001) están escritos
    // para el cliente; cualquier otro error se queda en el registro.
    if (error && error.code !== 'P0001') console.error('firma_remota_guardar:', error.message);
    const msg = error?.code === 'P0001' ? error.message : 'No se pudo guardar la firma. Intenta de nuevo más tarde.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const r = data as { reportId: string; createdBy: string | null; cliente: string; folio: string };
  try {
    if (hayClienteAdmin()) {
      const admin = createAdminClient();
      const [tec, sup] = await Promise.all([
        r.createdBy ? admin.rpc('filtrar_por_preferencia', { p_usuarios: [r.createdBy], p_tipo: 'firma_cliente' }) : Promise.resolve({ data: [] }),
        admin.rpc('destinatarios_notificacion_tipo', { p_destino: 'supervisores', p_tipo: 'firma_cliente' }),
      ]);
      const aIds = (d: any) => ((d as any[]) || []).map((x) => (typeof x === 'string' ? x : (Object.values(x)[0] as string))).filter(Boolean);
      const tecnicos = aIds(tec.data);
      const supervisores = aIds(sup.data).filter((id) => !tecnicos.includes(id));
      const aviso = {
        titulo: 'El cliente firmó el reporte',
        mensaje: `${nombre.trim().slice(0, 60)} firmó el reporte de ${r.cliente} (folio ${r.folio}).`,
        tag: `firma-${r.reportId}`,
      };
      await Promise.all([
        enviarPush(tecnicos, { ...aviso, url: `/mis-reportes?reporte=${r.reportId}` }),
        enviarPush(supervisores, { ...aviso, url: `/dashboard/reportes?reporte=${r.reportId}` }),
      ]);
    }
  } catch (e) {
    // El aviso no debe tumbar la firma, que ya quedó guardada.
    console.error('No se pudo avisar de la firma:', e);
  }

  return NextResponse.json({ ok: true });
}
