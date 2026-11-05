import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { generateLazoPdf } from '@/lib/generateLazoPdf';

export const dynamic = 'force-dynamic';

// PDF del diagrama unifilar de un lazo (técnicos y supervisión).
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Inicia sesión para descargar el diagrama.' }, { status: 401 });
  }

  // Defensa en capas: RLS ya limita los lazos a técnicos y supervisión.
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (perfil?.role !== 'tecnico' && perfil?.role !== 'supervisor') {
    return NextResponse.json({ error: 'No tienes permiso para ver este lazo.' }, { status: 403 });
  }

  const [rLazo, rElementos] = await Promise.all([
    supabase.from('lazos').select('*').eq('id', params.id).single(),
    supabase.from('lazo_elementos').select('*').eq('lazo_id', params.id).order('orden'),
  ]);
  if (rLazo.error || !rLazo.data) {
    return NextResponse.json({ error: 'No se encontró el lazo.' }, { status: 404 });
  }
  if (rElementos.error) {
    return NextResponse.json({ error: 'No se pudieron cargar los dispositivos del lazo. Intenta de nuevo.' }, { status: 500 });
  }
  // Los técnicos no leen la tabla clientes directo; el catálogo sí (RPC).
  const { data: catalogo } = await supabase.rpc('catalogo_clientes');
  const cliente = ((catalogo as { id: string; nombre: string }[]) || []).find((c) => c.id === rLazo.data.cliente_id);

  let bytes: Uint8Array;
  try {
    bytes = await generateLazoPdf(rLazo.data, rElementos.data || [], cliente?.nombre || 'Cliente');
  } catch (err: any) {
    console.error('[lazo-pdf] Error generando PDF:', err?.message, err?.stack);
    return NextResponse.json({ error: 'No se pudo generar el PDF. Intenta de nuevo; si sigue fallando, avisa a quien administra la app.' }, { status: 500 });
  }

  // Sin acentos ni símbolos para que el nombre del archivo sirva en cualquier teléfono.
  const nombreArchivo = `diagrama-${rLazo.data.codigo}-${cliente?.nombre || 'cliente'}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '-');
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${nombreArchivo}.pdf"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    },
  });
}
