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

// Tope por persona: cada audio cuesta créditos y, sin esto, una sola cuenta
// podía pedir audios sin parar. En una conversación normal se oyen unas
// cuantas respuestas por minuto.
// shortcut: la cuenta vive en la memoria de cada instancia del servidor, así
// que el tope real puede ser algo mayor; si hace falta exactitud, llevarla a
// una tabla como asistente_uso.
const MAX_AUDIOS = 30;
const VENTANA_MS = 10 * 60_000;
const audiosPorUsuario = new Map<string, number[]>();

function superaElTope(userId: string): boolean {
  const ahora = Date.now();
  const recientes = (audiosPorUsuario.get(userId) || []).filter((t) => ahora - t < VENTANA_MS);
  if (recientes.length >= MAX_AUDIOS) {
    audiosPorUsuario.set(userId, recientes);
    return true;
  }
  recientes.push(ahora);
  audiosPorUsuario.set(userId, recientes);
  return false;
}

// Se usa el punto de entrada «stream» de ElevenLabs y su respuesta se pasa
// tal cual al navegador: el audio empieza a sonar en cuanto llegan los
// primeros trozos, sin esperar a que se genere completo.
async function sintetizar(texto: string, modelo: string): Promise<Response> {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOZ)}/stream?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY!, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: texto, model_id: modelo, language_code: 'es' }),
    signal: AbortSignal.timeout(20_000),
  });
}

async function responder(texto: string): Promise<Response> {
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
  if (!texto) return NextResponse.json({ error: 'Falta el texto.' }, { status: 400 });
  if (texto.length > MAX_LETRAS) return NextResponse.json({ error: 'Texto demasiado largo para la voz natural.' }, { status: 413 });
  if (superaElTope(user.id)) return NextResponse.json({ error: 'Demasiados audios seguidos. Espera unos minutos; mientras, se usa la voz del teléfono.' }, { status: 429 });

  const t0 = Date.now();
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
    console.log(`[asistente/voz] ${texto.length} letras, primer audio en ${Date.now() - t0} ms`);
    return new Response(r.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[asistente/voz]', e);
    return NextResponse.json({ error: 'No se pudo generar la voz.' }, { status: 502 });
  }
}

// GET ?t=texto: es la que usa el chat, como origen directo de un <audio>,
// para que el navegador vaya reproduciendo mientras descarga. Las cookies de
// sesión no viajan en peticiones de otros sitios, así que no se puede
// disparar desde fuera para gastar créditos.
export async function GET(req: NextRequest) {
  return responder((req.nextUrl.searchParams.get('t') || '').trim());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return responder(typeof body.texto === 'string' ? body.texto.trim() : '');
}
