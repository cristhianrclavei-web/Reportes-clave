import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { generateLevantamientoPdf } from '@/lib/generateLevantamientoPdf';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const [{ data: levantamiento, error: e1 }, { data: sistemas, error: e2 }] = await Promise.all([
    supabase
      .from('levantamientos')
      .select('*, profiles!levantamientos_created_by_profiles_fkey(full_name)')
      .eq('id', params.id)
      .single(),
    supabase.from('levantamiento_sistemas').select('*').eq('levantamiento_id', params.id).order('orden'),
  ]);

  if (e1 || !levantamiento) {
    return NextResponse.json({ error: 'Levantamiento no encontrado' }, { status: 404 });
  }
  if (e2) {
    return NextResponse.json({ error: 'No se pudieron cargar los sistemas del levantamiento' }, { status: 500 });
  }

  // Defensa en capas: quien lo hizo, o un supervisor. RLS ya limita la
  // consulta, pero un mensaje explícito es mejor que un 404 confuso.
  const isCreador = levantamiento.created_by === user.id;
  const { data: userProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isSupervisor = userProfile?.role === 'supervisor';

  if (!isCreador && !isSupervisor) {
    return NextResponse.json({ error: 'No tienes permiso para ver este levantamiento' }, { status: 403 });
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateLevantamientoPdf(levantamiento as any, (sistemas as any[]) || [], supabase);
  } catch (err: any) {
    console.error('[levantamientos-pdf] Error generando PDF:', err?.message, err?.stack);
    return NextResponse.json({ error: 'Error al generar el PDF: ' + (err?.message || 'desconocido') }, { status: 500 });
  }

  const cleanEmpresa = (levantamiento.empresa || 'cliente').replace(/[^a-z0-9]+/gi, '-');
  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="levantamiento-${levantamiento.folio}-${cleanEmpresa}.pdf"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    },
  });
}
