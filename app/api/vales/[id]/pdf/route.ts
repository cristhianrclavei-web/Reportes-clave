import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { generateValePdf } from '@/lib/generateValePdf';

export const dynamic = 'force-dynamic';

// PDF de un vale de almacén. La RLS de almacen_vales ya limita quién lo ve
// (el técnico dueño, el almacén y supervisores): si no puede verlo, no hay fila.
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await supabase
    .from('almacen_vales')
    .select('*, tecnico:profiles!almacen_vales_tecnico_id_fkey(full_name), entrega:profiles!almacen_vales_entregado_por_fkey(full_name), recibe:profiles!almacen_vales_recibido_por_fkey(full_name), almacen_vale_items(*, almacen_articulos(id, descripcion, unidad, categoria, marca, modelo, retornable))')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Vale no encontrado' }, { status: 404 });

  const r: any = data;
  const vale = {
    ...r,
    tecnico: r.tecnico?.full_name || 'Personal técnico',
    entregadoPor: r.entrega?.full_name || null,
    recibidoPor: r.recibe?.full_name || null,
    items: (r.almacen_vale_items || []).map(({ almacen_articulos, ...i }: any) => ({ ...i, articulo: almacen_articulos })).sort((a: any, b: any) => a.orden - b.orden),
  };

  let bytes: Uint8Array;
  try {
    bytes = await generateValePdf(vale);
  } catch (e: any) {
    console.error('[vale-pdf]', e?.message);
    return NextResponse.json({ error: 'Error al generar el PDF' }, { status: 500 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="vale-${vale.folio}.pdf"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
