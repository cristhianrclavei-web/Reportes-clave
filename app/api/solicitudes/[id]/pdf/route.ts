import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { generateSolicitudPdf } from '@/lib/generateSolicitudPdf';

export const dynamic = 'force-dynamic';

// PDF de una solicitud de personal. La RLS limita quién la ve (el
// solicitante y quien autoriza): si no puede verla, no hay fila.
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await supabase
    .from('solicitudes_personal')
    .select('*, solicitante:profiles!solicitudes_personal_solicitante_id_fkey(full_name)')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });

  // Evidencias: hasta 4, con la sesión del usuario (mismo permiso del bucket).
  const fotos: Uint8Array[] = [];
  for (const path of ((data as any).fotos || []).slice(0, 4)) {
    const { data: blob } = await supabase.storage.from('solicitudes').download(path);
    if (blob) fotos.push(new Uint8Array(await blob.arrayBuffer()));
  }

  let bytes: Uint8Array;
  try {
    bytes = await generateSolicitudPdf({ ...(data as any), fotos: (data as any).fotos || [], historial: (data as any).historial || [] }, fotos);
  } catch (e: any) {
    console.error('[solicitud-pdf]', e?.message);
    return NextResponse.json({ error: 'Error al generar el PDF' }, { status: 500 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="solicitud-${(data as any).folio}.pdf"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
