import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { generateFacturaPdf } from '@/lib/generateFacturaPdf';

export const dynamic = 'force-dynamic';

// PDF de la PREFACTURA (sin validez fiscal). Solo quien tiene el permiso de
// facturación; RLS ya lo limita, esto da un mensaje claro.
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { data: puede } = await supabase.rpc('puedo_gestionar_facturacion');
  if (!puede) {
    return NextResponse.json({ error: 'No tienes permiso de facturación' }, { status: 403 });
  }

  const { data: factura, error } = await supabase.from('facturas').select('*').eq('id', params.id).single();
  if (error || !factura) {
    return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateFacturaPdf(factura as any);
  } catch (err: any) {
    console.error('[facturas-pdf] Error generando PDF:', err?.message, err?.stack);
    return NextResponse.json({ error: 'No se pudo generar el PDF. Intenta de nuevo; si sigue fallando, avisa a quien administra la app.' }, { status: 500 });
  }

  const limpio = (factura.receptor_nombre || 'cliente').replace(/[^a-z0-9]+/gi, '-');
  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="prefactura-${factura.folio}-${limpio}.pdf"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    },
  });
}
