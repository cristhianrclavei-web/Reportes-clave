import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { syscomConfigurado, buscarProductosSyscom } from '@/lib/syscom';

export const dynamic = 'force-dynamic';

// Único punto por el que el navegador toca a SYSCOM: el client_secret vive
// solo en lib/syscom.ts, del lado del servidor. Requiere sesión de
// supervisor, igual que el resto del módulo de cotizaciones.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') {
    return NextResponse.json({ error: 'No tienes permiso para buscar en SYSCOM' }, { status: 403 });
  }

  // Sin credenciales todavía no es un error: es un estado esperado mientras
  // se tramitan. El buscador en pantalla lo muestra como "no configurado" en
  // vez de un error rojo.
  if (!syscomConfigurado()) {
    return NextResponse.json({ configurado: false, productos: [] });
  }

  const q = request.nextUrl.searchParams.get('q') || '';
  if (q.trim().length < 3) {
    return NextResponse.json({ configurado: true, productos: [] });
  }

  try {
    const productos = await buscarProductosSyscom(q);
    return NextResponse.json({ configurado: true, productos });
  } catch (err: any) {
    console.error('[syscom] Error buscando productos:', err?.message);
    return NextResponse.json({ error: err?.message || 'No se pudo buscar en SYSCOM' }, { status: 502 });
  }
}
