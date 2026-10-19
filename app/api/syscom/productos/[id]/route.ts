import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { syscomConfigurado, obtenerFichaSyscom } from '@/lib/syscom';

export const dynamic = 'force-dynamic';

// Ficha de un producto de SYSCOM («Ver ficha» y pegar un enlace en el
// concepto). Mismo permiso que la búsqueda: solo supervisión.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') {
    return NextResponse.json({ error: 'No tienes permiso para consultar SYSCOM' }, { status: 403 });
  }
  if (!syscomConfigurado()) {
    return NextResponse.json({ error: 'La integración con SYSCOM no tiene credenciales configuradas.' }, { status: 503 });
  }

  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) {
    return NextResponse.json({ error: 'Ese no es un número de producto de SYSCOM.' }, { status: 400 });
  }

  try {
    const ficha = await obtenerFichaSyscom(id);
    if (!ficha) {
      return NextResponse.json({ error: 'SYSCOM no encontró ese producto.' }, { status: 404 });
    }
    return NextResponse.json({ ficha });
  } catch (err: any) {
    console.error('[syscom] Error leyendo la ficha:', err?.message);
    return NextResponse.json({ error: err?.message || 'No se pudo consultar SYSCOM' }, { status: 502 });
  }
}
