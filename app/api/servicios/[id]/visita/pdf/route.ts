import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { generateVisitaPdf } from '@/lib/generateVisitaPdf';
import { comprimirFoto } from '@/lib/pdfFotos';

export const dynamic = 'force-dynamic';

// Hoja de visita sin trabajo de un día de servicio. La RLS limita quién lo
// ve (supervisores y el personal asignado): si no puede verlo, no hay fila.
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await supabase.from('servicios_programados').select('*').eq('id', id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 });
  const s: any = data;
  if (s.resultado !== 'no_realizado' && !s.visita_estado) {
    return NextResponse.json({ error: 'Este día no se registró como visita sin trabajo' }, { status: 404 });
  }

  const [{ data: personal }, { data: eventos }, { data: cliente }, { data: revisor }] = await Promise.all([
    supabase.rpc('personal_de_servicio', { p_servicio_id: id }),
    supabase.from('servicio_eventos').select('foto_path, created_at').eq('servicio_id', id).not('foto_path', 'is', null).order('created_at', { ascending: true }),
    s.cliente_id ? supabase.from('clientes').select('nombre').eq('id', s.cliente_id).maybeSingle() : Promise.resolve({ data: null }),
    s.visita_revisada_por ? supabase.from('profiles').select('full_name').eq('id', s.visita_revisada_por).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  // Fotos del día: hasta 4, con la sesión del usuario (mismo permiso del bucket).
  const fotos: Uint8Array[] = [];
  for (const e of ((eventos || []) as any[]).slice(-4)) {
    const { data: blob } = await supabase.storage.from('evidencias').download(e.foto_path);
    if (blob) fotos.push(await comprimirFoto(new Uint8Array(await blob.arrayBuffer())));
  }

  const folio = `VST-${String(s.fecha).replace(/-/g, '')}-${String(s.id).slice(0, 4).toUpperCase()}`;
  let bytes: Uint8Array;
  try {
    bytes = await generateVisitaPdf({
      folio,
      proyecto: s.proyecto,
      cliente: (cliente as any)?.nombre || null,
      descripcion: s.descripcion,
      fecha: s.fecha,
      direccion: s.ubicacion_programada?.direccion || null,
      horaProgramada: s.hora_programada,
      horaLlegada: s.hora_llegada,
      horaInicio: s.hora_inicio,
      horaCierre: s.hora_fin,
      personal: ((personal || []) as any[]).map((p) => p.full_name).filter(Boolean),
      motivo: s.resultado_motivo,
      comentario: s.resultado_comentario,
      estado: s.visita_estado,
      revisadoPor: (revisor as any)?.full_name || null,
      revisadoEn: s.visita_revisada_en,
      nota: s.visita_nota,
      firma: s.visita_firma,
      firmaNombre: s.visita_firma_nombre,
    }, fotos);
  } catch (e: any) {
    console.error('[visita-pdf]', e?.message);
    return NextResponse.json({ error: 'Error al generar el PDF' }, { status: 500 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="visita-sin-trabajo-${folio}.pdf"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
