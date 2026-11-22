import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { buscarProductosAscencio } from '@/lib/ascencio';

export const dynamic = 'force-dynamic';

// Búsqueda en el catálogo público de Grupo Ascencio para las cotizaciones.
// Pasa por el servidor para no depender de que su sitio permita llamadas
// desde el navegador, y solo para quien inició sesión.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const q = (request.nextUrl.searchParams.get('q') || '').trim().slice(0, 100);
  if (q.length < 3) return NextResponse.json({ productos: [] });

  try {
    return NextResponse.json({ productos: await buscarProductosAscencio(q) });
  } catch (err: any) {
    console.error('[ascencio] Error buscando productos:', err?.message);
    return NextResponse.json({ error: 'No se pudo buscar en Grupo Ascencio ahora. Revisa tu conexión o escribe el concepto a mano.' }, { status: 502 });
  }
}
