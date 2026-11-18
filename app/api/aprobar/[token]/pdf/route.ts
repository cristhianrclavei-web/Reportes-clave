import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient, hayClienteAdmin } from '@/lib/supabaseAdmin';
import { generateCotizacionPdf } from '@/lib/generateCotizacionPdf';

export const dynamic = 'force-dynamic';

// El PDF de la cotización para quien la aprueba desde el enlace de WhatsApp,
// sin sesión. El token decide: si aprobacion_remota_info() no lo reconoce,
// no hay PDF. Los datos se leen con la llave del servidor (el aprobador no
// tiene sesión), solo de la cotización de ese token.
export async function GET(_request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data: info, error } = await anon.rpc('aprobacion_remota_info', { p_token: token });
  if (error) console.error('aprobacion_remota_info:', error.message);
  if (error || !info) return NextResponse.json({ error: 'Enlace no válido.' }, { status: 404 });
  if (!hayClienteAdmin()) return NextResponse.json({ error: 'Falta configurar el servidor (SUPABASE_SECRET_KEY).' }, { status: 500 });

  const admin = createAdminClient();
  const { data: solicitud, error: e0 } = await admin.from('cotizacion_aprobaciones').select('cotizacion_id').eq('token', token.toLowerCase()).maybeSingle();
  if (e0 || !solicitud) return NextResponse.json({ error: 'Enlace no válido.' }, { status: 404 });
  const [{ data: cotizacion, error: e1 }, { data: lineas, error: e2 }] = await Promise.all([
    admin.from('cotizaciones').select('*').eq('id', solicitud.cotizacion_id).single(),
    admin.from('cotizacion_lineas').select('*').eq('cotizacion_id', solicitud.cotizacion_id).order('orden'),
  ]);
  if (e1 || e2 || !cotizacion) {
    console.error('PDF de aprobación:', e1?.message || e2?.message);
    return NextResponse.json({ error: 'No se pudo cargar la cotización. Intenta de nuevo.' }, { status: 500 });
  }

  let pdf: Uint8Array;
  try {
    pdf = await generateCotizacionPdf(cotizacion as any, (lineas as any[]) || []);
  } catch (err: any) {
    console.error('[aprobar-pdf] Error generando PDF:', err?.message);
    return NextResponse.json({ error: 'No se pudo generar el PDF. Intenta de nuevo.' }, { status: 500 });
  }
  const empresa = (cotizacion.empresa || 'cliente').replace(/[^a-z0-9]+/gi, '-');
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="cotizacion-${cotizacion.folio}-${empresa}.pdf"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
