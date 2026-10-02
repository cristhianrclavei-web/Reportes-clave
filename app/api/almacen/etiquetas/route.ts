import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { generateEtiquetasAlmacen, Etiqueta } from '@/lib/generateEtiquetasAlmacen';
import { MARCA } from '@/lib/marca';

export const dynamic = 'force-dynamic';

// GET /api/almacen/etiquetas?tipo=ubicacion|articulo&ids=a,b,c → PDF de etiquetas QR.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { data: puede } = await supabase.rpc('puedo_gestionar_almacen');
  if (!puede) return NextResponse.json({ error: 'Solo el almacén' }, { status: 403 });

  const q = request.nextUrl.searchParams;
  const tipo = q.get('tipo') === 'articulo' ? 'articulo' : 'ubicacion';
  const ids = (q.get('ids') || '').split(',').filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 200);
  const base = MARCA.appUrl.replace(/\/$/, '');
  let etiquetas: Etiqueta[] = [];

  if (tipo === 'ubicacion') {
    const { data: ubic } = await supabase.from('almacen_ubicaciones').select('id, nombre, descripcion').in('id', ids);
    const { data: arts } = await supabase.from('almacen_articulos').select('id, ubicacion_id').in('ubicacion_id', ids).eq('activo', true);
    etiquetas = (ubic || []).map((u: any) => ({
      titulo: u.nombre,
      subtitulo: u.descripcion || undefined,
      detalle: `${(arts || []).filter((a: any) => a.ubicacion_id === u.id).length} artículo(s)`,
      url: `${base}/dashboard/almacen?ubicacion=${u.id}`,
    }));
  } else {
    const { data: arts } = await supabase
      .from('almacen_articulos')
      .select('id, descripcion, marca, modelo, unidad, almacen_ubicaciones(nombre)')
      .in('id', ids);
    etiquetas = (arts || []).map((a: any) => ({
      titulo: a.descripcion,
      subtitulo: [a.marca, a.modelo].filter(Boolean).join(' ') || undefined,
      detalle: a.almacen_ubicaciones?.nombre ? `Se guarda en: ${a.almacen_ubicaciones.nombre}` : undefined,
      url: `${base}/dashboard/almacen?articulo=${a.id}`,
    }));
  }

  const bytes = await generateEtiquetasAlmacen(etiquetas);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="etiquetas-${tipo}.pdf"`, 'Cache-Control': 'no-store' },
  });
}
