import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import type { MiPlan } from '@/lib/planesDatos';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Voz natural del asistente: convierte en audio el texto de una respuesta con
// ElevenLabs. La llave (ELEVENLABS_API_KEY) vive solo en el servidor; el
// navegador recibe el MP3. Si esta ruta falla por lo que sea (sin llave, sin
// créditos, servicio caído) el chat lee con la voz del propio teléfono, así
// que aquí basta con contestar un error claro.
//
// Cada carácter se cobra: solo la usa quien tiene el asistente disponible y
// el texto va acotado. El tope de gasto real es el límite de créditos que se
// le puso a la llave en ElevenLabs.

const VOZ = process.env.ELEVENLABS_VOZ || 'rpqlUOplj0Q0PIilat8h';
const MODELO = process.env.ELEVENLABS_MODELO || 'eleven_v4_turbo';
// Si el plan contratado no incluye el modelo principal, se intenta con este.
const MODELO_RESPALDO = 'eleven_flash_v2_5';
const MAX_LETRAS = 1000;

async function sintetizar(texto: string, modelo: string): Promise<Response> {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOZ)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY!, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: texto, model_id: modelo, language_code: 'es' }),
    signal: AbortSignal.timeout(20_000),
  });
}

export async function POST(req: NextRequest) {
  if (!process.env.ELEVENLABS_API_KEY || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'La voz natural no está activada.' }, { status: 503 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const [{ data: perfil }, { data: plan }] = await Promise.all([
    supabase.from('profiles').select('activo').eq('id', user.id).single(),
    supabase.rpc('mi_plan'),
  ]);
  if (!perfil || perfil.activo === false || !(plan as MiPlan | null)?.modulos?.includes('ia')) {
    return NextResponse.json({ error: 'Sin acceso al asistente.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const texto = typeof body.texto === 'string' ? body.texto.trim() : '';
  if (!texto) return NextResponse.json({ error: 'Falta el texto.' }, { status: 400 });
  if (texto.length > MAX_LETRAS) return NextResponse.json({ error: 'Texto demasiado largo para la voz natural.' }, { status: 413 });

  try {
    let r = await sintetizar(texto, MODELO);
    // 401 = llave inválida y 429 = sin créditos o saturado: otro modelo no lo
    // arregla. Lo demás (modelo no disponible en el plan, parámetro no
    // aceptado) sí puede salir con el modelo de respaldo.
    if (!r.ok && r.status !== 401 && r.status !== 429 && MODELO !== MODELO_RESPALDO) {
      console.error('[asistente/voz]', MODELO, r.status, (await r.text()).slice(0, 300));
      r = await sintetizar(texto, MODELO_RESPALDO);
    }
    if (!r.ok || !r.body) {
      console.error('[asistente/voz] ElevenLabs', r.status, (await r.text().catch(() => '')).slice(0, 300));
      return NextResponse.json({ error: 'No se pudo generar la voz.' }, { status: 502 });
    }
    return new Response(r.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[asistente/voz]', e);
    return NextResponse.json({ error: 'No se pudo generar la voz.' }, { status: 502 });
  }
}
