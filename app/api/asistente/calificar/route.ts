import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { createAdminClient, hayClienteAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Pulgar arriba o abajo sobre una respuesta del asistente. La tabla
// asistente_uso no tiene política de UPDATE a propósito (nadie debe poder
// alterar su registro de uso), así que la calificación se escribe aquí con el
// cliente admin, después de comprobar que la consulta es de quien califica y
// tocando únicamente la columna `calificacion`.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!hayClienteAdmin()) return NextResponse.json({ error: 'No disponible' }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
  const valor = body.valor === 1 || body.valor === -1 ? body.valor : body.valor === 0 ? null : undefined;
  if (!id || valor === undefined) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  // La RLS solo deja leer lo propio (y a supervisores, todo): se exige además
  // que el renglón sea de quien califica.
  const { data: fila } = await supabase.from('asistente_uso').select('id, user_id').eq('id', id).maybeSingle();
  if (!fila || fila.user_id !== user.id) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  const { error } = await createAdminClient().from('asistente_uso').update({ calificacion: valor }).eq('id', id).eq('user_id', user.id);
  if (error) {
    // Falta patch_asistente_uso_costo.sql: el pulgar no se guarda, sin romper nada.
    return NextResponse.json({ error: 'Aún no se pueden guardar calificaciones.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
