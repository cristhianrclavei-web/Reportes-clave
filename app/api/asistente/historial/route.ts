import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { MARCA, hoyNegocio } from '@/lib/marca';

export const dynamic = 'force-dynamic';

// Historial del asistente de quien tiene la sesión, organizado por día. Sale
// de asistente_uso (la misma bitácora que lleva el tope diario); la RLS deja
// a cada quien leer lo suyo, y aquí además se filtra por su user_id para que
// un supervisor no reciba las conversaciones de otros.
//
//   GET                  → { dias: [{ dia: 'AAAA-MM-DD', mensajes: n }] }
//   GET ?dia=AAAA-MM-DD  → { dia, conversacion: [{ id, hora, pregunta, respuesta }] }

const diaLocal = (ts: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: MARCA.zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
const horaLocal = (ts: string) =>
  new Intl.DateTimeFormat('es-MX', { timeZone: MARCA.zonaHoraria, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  // «hoy» lo resuelve el servidor con la zona de la operación.
  const pedido = req.nextUrl.searchParams.get('dia');
  const dia = pedido === 'hoy' ? hoyNegocio() : pedido;
  if (dia) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return NextResponse.json({ error: 'Día inválido' }, { status: 400 });
    // Ventana de 3 días alrededor y filtro por día local: evita calcular el
    // desfase horario a mano (cambia con el horario de verano donde aplique).
    const centro = new Date(`${dia}T12:00:00Z`).getTime();
    const { data, error } = await supabase
      .from('asistente_uso')
      .select('id, created_at, pregunta, respuesta')
      .eq('user_id', user.id)
      .gte('created_at', new Date(centro - 36 * 3600_000).toISOString())
      .lte('created_at', new Date(centro + 36 * 3600_000).toISOString())
      .order('created_at')
      .limit(400);
    if (error) return NextResponse.json({ error: 'No se pudo leer el historial' }, { status: 500 });
    const conversacion = ((data as any[]) || [])
      .filter((r) => diaLocal(r.created_at) === dia)
      .map((r) => ({ id: r.id, hora: horaLocal(r.created_at), ts: r.created_at, pregunta: r.pregunta, respuesta: r.respuesta || '' }));
    return NextResponse.json({ dia, conversacion });
  }

  const { data, error } = await supabase
    .from('asistente_uso')
    .select('created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) return NextResponse.json({ error: 'No se pudo leer el historial' }, { status: 500 });
  const cuenta = new Map<string, number>();
  for (const r of (data as any[]) || []) {
    const d = diaLocal(r.created_at);
    cuenta.set(d, (cuenta.get(d) || 0) + 1);
  }
  return NextResponse.json({ dias: [...cuenta].map(([d, mensajes]) => ({ dia: d, mensajes })).slice(0, 60) });
}
