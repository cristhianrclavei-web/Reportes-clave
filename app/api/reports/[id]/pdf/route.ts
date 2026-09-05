import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { generateReportPdf } from '@/lib/generateReportPdf';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { data: report, error } = await supabase
    .from('reports')
    .select('id, created_at, empresa_cliente, fecha, tipo_servicio, sub_tipo_servicio, data, created_by, profiles(full_name)')
    .eq('id', params.id)
    .single();

  if (error || !report) {
    return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 });
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateReportPdf(report as any, supabase);
  } catch (err: any) {
    console.error('[pdf-route] Error generando PDF:', err?.message, err?.stack);
    return NextResponse.json({ error: 'Error al generar el PDF: ' + (err?.message || 'desconocido') }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="reporte-${report.fecha}-${report.empresa_cliente.replace(/[^a-z0-9]+/gi, '-')}.pdf"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
