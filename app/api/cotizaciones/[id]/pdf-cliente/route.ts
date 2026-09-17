import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { generateCotizacionPdf } from '@/lib/generateCotizacionPdf';
import type { Cotizacion, LineaCotizacion } from '@/lib/cotizaciones';

export const dynamic = 'force-dynamic';

// Enlace público (sin sesión) para compartir la cotización con el cliente,
// ej. por WhatsApp. No hay login del lado del cliente, así que este
// endpoint no pide auth — en vez de eso, la función de Postgres
// obtener_cotizacion_publica solo entrega datos si se conoce el id exacto
// (uuid, no adivinable) y solo si la cotización ya está aprobada/enviada.
// Ver supabase/patch_cotizaciones_publico.sql.
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('obtener_cotizacion_publica', { p_id: params.id });
  if (error || !data || !(data as any).cotizacion) {
    return NextResponse.json({ error: 'Cotización no disponible' }, { status: 404 });
  }

  const cotizacion = (data as any).cotizacion as Cotizacion;
  const lineas = ((data as any).lineas || []) as LineaCotizacion[];

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateCotizacionPdf(cotizacion, lineas);
  } catch (err: any) {
    console.error('[cotizaciones-pdf-cliente] Error generando PDF:', err?.message, err?.stack);
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
    },
  });
}
