import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { syscomConfigurado, buscarProductosSyscom } from '@/lib/syscom';

export const dynamic = 'force-dynamic';

// Único punto por el que el navegador toca a SYSCOM: el client_secret vive
// solo en lib/syscom.ts, del lado del servidor. Supervisión busca para las
// cotizaciones; los técnicos, para el equipo del reporte, con un tope diario
// (cada búsqueda sale por Fixie, que tiene cupo mensual).
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { data: role } = await supabase.rpc('get_my_role');

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

  if (role !== 'supervisor') {
    const { data: dentroDelTope, error } = await supabase.rpc('consumir_consulta_syscom');
    if (error) {
      console.error('[syscom] No se pudo revisar el tope de búsquedas:', error.message);
      return NextResponse.json({ error: 'No se pudo buscar en SYSCOM ahora. Escribe el modelo a mano.' }, { status: 503 });
    }
    if (!dentroDelTope) {
      return NextResponse.json({ error: 'Ya hiciste las 20 búsquedas en SYSCOM de hoy. Escribe el modelo a mano; mañana se reinicia.' }, { status: 429 });
    }
  }

  try {
    const productos = await buscarProductosSyscom(q);
    if (role === 'supervisor') return NextResponse.json({ configurado: true, productos });
    // Los técnicos no ven el costo de SYSCOM.
    return NextResponse.json({ configurado: true, productos: productos.map((p) => ({ ...p, precio: null })) });
  } catch (err: any) {
    console.error('[syscom] Error buscando productos:', err?.message);
    return NextResponse.json({ error: err?.message || 'No se pudo buscar en SYSCOM' }, { status: 502 });
  }
}
