import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { generateCotizacionPdf } from '@/lib/generateCotizacionPdf';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // Defensa en capas: RLS ya limita cotizaciones a supervisores, pero un
  // mensaje explícito es mejor que un 404 confuso si alguien más lo intenta.
  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') {
    return NextResponse.json({ error: 'No tienes permiso para ver esta cotización' }, { status: 403 });
  }

  const [{ data: cotizacion, error: e1 }, { data: lineas, error: e2 }] = await Promise.all([
    supabase.from('cotizaciones').select('*').eq('id', params.id).single(),
    supabase.from('cotizacion_lineas').select('*').eq('cotizacion_id', params.id).order('orden'),
  ]);

  if (e1 || !cotizacion) {
    return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });
  }
  if (e2) {
    return NextResponse.json({ error: 'No se pudieron cargar las líneas de la cotización' }, { status: 500 });
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateCotizacionPdf(cotizacion as any, (lineas as any[]) || []);
  } catch (err: any) {
    console.error('[cotizaciones-pdf] Error generando PDF:', err?.message, err?.stack);
    return NextResponse.json({ error: 'Error al generar el PDF: ' + (err?.message || 'desconocido') }, { status: 500 });
  }

  const cleanEmpresa = (cotizacion.empresa || 'cliente').replace(/[^a-z0-9]+/gi, '-');
  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="cotizacion-${cotizacion.folio}-${cleanEmpresa}.pdf"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    },
  });
}
