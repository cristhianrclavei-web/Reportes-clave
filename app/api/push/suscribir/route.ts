import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { createAdminClient, hayClienteAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Registrar la suscripción push de este dispositivo.
//
// Esto vivía en el cliente con un upsert sobre push_suscripciones, y ahí está
// el problema que nos trajo aquí: el endpoint identifica al *dispositivo*, no
// a la persona. Un teléfono donde entró un supervisor dejaba su fila, y si
// después entraba un técnico, el aparato seguía recibiendo los avisos del
// supervisor.
//
// La fila vieja no se podía limpiar desde el navegador: la RLS solo deja
// tocar las propias, así que el borrado no hacía nada y tampoco avisaba. Por
// eso el registro pasa por aquí, donde el cliente admin sí puede soltar
// cualquier fila que reclame este endpoint antes de crear la nueva.

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  }

  let cuerpo: any;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 });
  }

  const { endpoint, p256dh, auth, user_agent } = cuerpo || {};
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Faltan datos de la suscripción' }, { status: 400 });
  }

  if (!hayClienteAdmin()) {
    // Sin la secret key no se puede garantizar la limpieza. Se rechaza en vez
    // de registrar a medias: una suscripción duplicada es justo el fallo que
    // este endpoint existe para evitar.
    return NextResponse.json(
      { error: 'Las notificaciones no están configuradas en el servidor.' },
      { status: 503 }
    );
  }

  const admin = createAdminClient();

  // Cualquier fila que reclame este endpoint es de un dueño anterior del
  // dispositivo, o una propia que quedó sin limpiar. En ambos casos sobra.
  const { error: errorBorrado } = await admin
    .from('push_suscripciones')
    .delete()
    .eq('endpoint', endpoint);

  if (errorBorrado) {
    return NextResponse.json({ error: errorBorrado.message }, { status: 500 });
  }

  const { error: errorAlta } = await admin.from('push_suscripciones').insert({
    usuario_id: user.id,
    endpoint,
    p256dh,
    auth,
    user_agent: typeof user_agent === 'string' ? user_agent.slice(0, 200) : null,
  });

  if (errorAlta) {
    return NextResponse.json({ error: errorAlta.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// Dar de baja la suscripción de este dispositivo. Se llama al apagar el
// interruptor y también al cerrar sesión, que es cuando más importa: si la
// fila se queda, el siguiente en entrar hereda los avisos del anterior.
export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  }

  let cuerpo: any;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 });
  }

  const { endpoint } = cuerpo || {};
  if (!endpoint) {
    return NextResponse.json({ error: 'Falta el endpoint' }, { status: 400 });
  }

  if (!hayClienteAdmin()) {
    return NextResponse.json({ error: 'No configurado' }, { status: 503 });
  }

  // Se borra por endpoint sin exigir que sea del usuario en sesión: quien
  // tiene el dispositivo en la mano es quien manda sobre lo que ese
  // dispositivo recibe, y el caso que importa es precisamente el de la fila
  // que quedó a nombre de otro.
  const { error } = await createAdminClient()
    .from('push_suscripciones')
    .delete()
    .eq('endpoint', endpoint);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
