import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { enviarPush } from '@/lib/pushServidor';

export const dynamic = 'force-dynamic';

// Quien aprueba responde desde el enlace, sin sesión: firma para aprobar o
// pide cambios. La base valida todo (aprobacion_remota_responder); aquí se
// revisa la forma de la petición y, si salió bien, se avisa a quien la pidió.
const esquema = z.object({
  token: z.string().uuid(),
  aprobar: z.boolean(),
  firma: z.string().max(400000).nullable(),
  comentario: z.string().trim().max(600).nullable(),
});

export async function POST(request: NextRequest) {
  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 });
  }
  const datos = esquema.safeParse(cuerpo);
  if (!datos.success) return NextResponse.json({ error: 'Petición inválida' }, { status: 400 });
  const { token, aprobar, firma, comentario } = datos.data;

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await anon.rpc('aprobacion_remota_responder', { p_token: token, p_aprobar: aprobar, p_firma: firma, p_comentario: comentario });
  if (error || !data) {
    // Solo los «raise exception» (P0001) están escritos para quien aprueba.
    if (error && error.code !== 'P0001') console.error('aprobacion_remota_responder:', error.message);
    const mensaje = error?.code === 'P0001' ? error.message : 'No se pudo guardar. Intenta de nuevo en un momento.';
    return NextResponse.json({ error: mensaje }, { status: 400 });
  }

  const r = data as { cotizacionId: string; folio: string; empresa: string; aprobador: string; pedidoPor: string; aprobada: boolean; comentario: string | null };
  try {
    await enviarPush([r.pedidoPor], {
      titulo: r.aprobada ? `${r.folio} aprobada` : `${r.folio}: piden cambios`,
      mensaje: r.aprobada
        ? `${r.aprobador} aprobó la cotización de ${r.empresa}. Ya la puedes enviar al cliente.`
        : `${r.aprobador}: ${(r.comentario || '').slice(0, 120)}`,
      url: `/dashboard/cotizaciones/${r.cotizacionId}`,
      tag: `aprobacion-${r.cotizacionId}`,
    });
  } catch (e) {
    // El aviso no debe tumbar la respuesta, que ya quedó guardada.
    console.error('No se pudo avisar de la aprobación:', e);
  }
  return NextResponse.json({ ok: true });
}
