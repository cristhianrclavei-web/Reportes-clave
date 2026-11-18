import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { obtenerFichaSyscom, syscomConfigurado } from '@/lib/syscom';
import { idProductoDeEnlace } from '@/lib/syscomEnlace';

export const dynamic = 'force-dynamic';

// Completa el modelo y la marca de los conceptos ligados a SYSCOM que no los
// tienen (cotizaciones de antes de patch_equipos_cotizados.sql). Una consulta
// por producto y solo una vez: ya guardado, no se vuelve a pedir. Los usa el
// reporte para sugerir el equipo al técnico.
const MAXIMO_POR_VEZ = 25;

export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') return NextResponse.json({ error: 'Solo supervisión' }, { status: 403 });
  if (!syscomConfigurado()) return NextResponse.json({ completados: 0, configurado: false });

  const { data: lineas, error } = await supabase.from('cotizacion_lineas').select('id, enlace').eq('cotizacion_id', id).is('modelo', null).not('enlace', 'is', null);
  if (error) {
    console.error('[modelos] No se pudieron leer los conceptos:', error.message);
    return NextResponse.json({ error: 'No se pudieron leer los conceptos.' }, { status: 500 });
  }

  const porProducto = new Map<string, string[]>();
  for (const l of lineas || []) {
    const producto = idProductoDeEnlace(l.enlace || '');
    if (producto) porProducto.set(producto, [...(porProducto.get(producto) || []), l.id]);
  }

  let completados = 0;
  for (const [producto, ids] of [...porProducto].slice(0, MAXIMO_POR_VEZ)) {
    try {
      const ficha = await obtenerFichaSyscom(producto);
      if (!ficha?.modelo) continue;
      const { error: e } = await supabase.from('cotizacion_lineas')
        .update({ modelo: ficha.modelo.slice(0, 80), marca: ficha.marca?.slice(0, 80) || null }).in('id', ids);
      if (e) console.error('[modelos] No se pudo guardar el modelo:', e.message);
      else completados += ids.length;
    } catch (err: any) {
      console.error('[modelos] Ficha de SYSCOM', producto, err?.message);
    }
  }
  return NextResponse.json({ completados });
}
