import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { extraerCoordenadas, extraerCoordenadasDeHtml } from '@/lib/geocerca';

export const dynamic = 'force-dynamic';

// Solo estos dominios: son los que usa Google para enlaces cortos de Maps.
// Es la barrera contra SSRF — sin esto, el endpoint sería un proxy para
// pedirle al servidor que abra cualquier URL que alguien quiera.
const HOSTS_PERMITIDOS = new Set(['maps.app.goo.gl', 'goo.gl']);

// Los enlaces cortos de Maps no traen lat/lng: hay que abrirlos. Esto pasa
// por el servidor porque el navegador no puede leer a dónde redirige un
// dominio de otro origen (CORS), y porque un fetch aquí no depende de que el
// visitante tenga sesión de Google ni JavaScript habilitado del lado de Maps.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
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

  const url = typeof cuerpo?.url === 'string' ? cuerpo.url.trim() : '';
  let destino: URL;
  try {
    destino = new URL(url);
  } catch {
    return NextResponse.json({ error: 'El enlace no es una URL válida.' }, { status: 400 });
  }

  if (!HOSTS_PERMITIDOS.has(destino.hostname)) {
    return NextResponse.json(
      { error: 'Solo se aceptan enlaces cortos de Google Maps (maps.app.goo.gl).' },
      { status: 400 }
    );
  }

  const controlador = new AbortController();
  const limite = setTimeout(() => controlador.abort(), 8000);
  let html: string;
  let urlFinal: string;
  try {
    const respuesta = await fetch(destino.toString(), {
      redirect: 'follow',
      signal: controlador.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ReportesClaveBot/1.0)' },
    });
    if (!respuesta.ok) {
      return NextResponse.json({ error: 'No se pudo abrir el enlace.' }, { status: 502 });
    }
    urlFinal = respuesta.url;
    html = await respuesta.text();
  } catch {
    return NextResponse.json(
      { error: 'No se pudo resolver el enlace (tiempo agotado o sin conexión).' },
      { status: 502 }
    );
  } finally {
    clearTimeout(limite);
  }

  // Algunos enlaces (los que sueltan un pin, a diferencia de los que apuntan
  // a un negocio) sí terminan con "@lat,lng" en la URL final — más barato de
  // revisar que escanear todo el HTML.
  const punto = extraerCoordenadas(urlFinal) || extraerCoordenadasDeHtml(html);

  if (!punto) {
    return NextResponse.json(
      { error: 'El enlace no trae coordenadas. Ábrelo, copia la URL completa de la barra del navegador y pégala aquí.' },
      { status: 422 }
    );
  }

  return NextResponse.json({ lat: punto.lat, lng: punto.lng });
}
