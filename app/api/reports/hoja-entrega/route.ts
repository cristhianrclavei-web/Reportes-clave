import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabaseServer';
import { generateHojaEntregaPdf, RenglonEntrega } from '@/lib/generateHojaEntregaPdf';
import { MAXIMO_POR_ARCHIVO } from '@/lib/impresionReportes';
import { textoTiposServicio } from '@/lib/tiposServicio';

export const dynamic = 'force-dynamic';

// Hoja de entrega de «Imprimir varios»: la lista de reportes (en el orden
// del archivo) con espacio para la firma de quien los recibe. Los datos se
// leen de la base; del navegador solo llegan los ids y cuántas hojas salió
// cada reporte (eso solo se sabe después de generar sus PDF).

const cuerpo = z.object({
  renglones: z.array(z.object({
    id: z.string().uuid(),
    hojas: z.number().int().min(1).max(500),
  })).min(1).max(MAXIMO_POR_ARCHIVO),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Tu sesión terminó. Vuelve a entrar.' }, { status: 401 });

  const { data: rol } = await supabase.rpc('get_my_role');
  if (rol !== 'supervisor') return NextResponse.json({ error: 'Solo supervisión puede imprimir varios reportes.' }, { status: 403 });

  const datos = cuerpo.safeParse(await request.json().catch(() => null));
  if (!datos.success) return NextResponse.json({ error: 'La lista de reportes no es válida.' }, { status: 400 });
  const { renglones } = datos.data;

  const ids = renglones.map((r) => r.id);
  const [{ data: reportes, error }, { data: yo }] = await Promise.all([
    supabase
      .from('reports')
      .select('id, fecha, empresa_cliente, tipo_servicio, sub_tipo_servicio, data, profiles!reports_created_by_profiles_fkey(full_name)')
      .in('id', ids),
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
  ]);
  if (error) return NextResponse.json({ error: 'No se pudieron leer los reportes. Intenta de nuevo.' }, { status: 500 });

  const porId = new Map((reportes || []).map((r: any) => [r.id, r]));
  const lista: RenglonEntrega[] = [];
  for (const renglon of renglones) {
    const r: any = porId.get(renglon.id);
    // Un reporte borrado mientras se generaba el archivo no aparece en la hoja.
    if (!r) continue;
    const perfil = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    lista.push({
      folio: r.data?.claveFormato || r.id.slice(0, 8).toUpperCase(),
      cliente: r.empresa_cliente || '—',
      fecha: r.fecha || '',
      tecnico: perfil?.full_name || 'Personal técnico',
      tipo: textoTiposServicio(r.tipo_servicio, r.sub_tipo_servicio) || '—',
      hojas: renglon.hojas,
    });
  }
  if (lista.length === 0) return NextResponse.json({ error: 'Ninguno de esos reportes existe ya.' }, { status: 404 });

  try {
    const pdf = await generateHojaEntregaPdf(lista, yo?.full_name || user.email || 'Supervisión', new Date());
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' },
    });
  } catch (e: any) {
    console.error('[hoja-entrega] Error generando PDF:', e?.message);
    return NextResponse.json({ error: 'No se pudo generar la hoja de entrega.' }, { status: 500 });
  }
}
