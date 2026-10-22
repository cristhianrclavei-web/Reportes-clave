import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

// Búsqueda de lugares con Google (Places API New), la misma que usa Google
// Maps. Pasa por el servidor para que la llave no llegue al navegador.
//   · ?q=texto&sesion=…[&lat=&lng=]  → sugerencias mientras se escribe
//   · ?id=placeId&sesion=…           → coordenadas del lugar elegido
// La «sesion» une las sugerencias con el lugar elegido: Google cobra la
// búsqueda completa como una sola consulta en lugar de una por letra.
// Sin GOOGLE_MAPS_API_KEY responde 503 y la app usa OpenStreetMap.

const LLAVE = process.env.GOOGLE_MAPS_API_KEY;

const busqueda = z.object({
  q: z.string().trim().min(3).max(200),
  sesion: z.string().uuid(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

const detalle = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{10,300}$/),
  sesion: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  if (!LLAVE) return NextResponse.json({ error: 'sin_llave' }, { status: 503 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const parametros = Object.fromEntries(request.nextUrl.searchParams);
  try {
    if (parametros.id) {
      const datos = detalle.safeParse(parametros);
      if (!datos.success) return NextResponse.json({ error: 'Lugar inválido' }, { status: 400 });
      return await coordenadasDelLugar(datos.data.id, datos.data.sesion);
    }
    const datos = busqueda.safeParse(parametros);
    if (!datos.success) return NextResponse.json({ error: 'Búsqueda inválida' }, { status: 400 });
    return await sugerencias(datos.data);
  } catch {
    return NextResponse.json({ error: 'Google no respondió. Intenta de nuevo.' }, { status: 502 });
  }
}

async function sugerencias(b: z.infer<typeof busqueda>) {
  const cuerpo: Record<string, unknown> = {
    input: b.q,
    sessionToken: b.sesion,
    includedRegionCodes: ['mx'],
    languageCode: 'es',
  };
  // Lo cercano a donde trabaja la empresa sale primero (50 km es el máximo).
  if (b.lat !== undefined && b.lng !== undefined) {
    cuerpo.locationBias = { circle: { center: { latitude: b.lat, longitude: b.lng }, radius: 50000 } };
  }
  const respuesta = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': LLAVE as string },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(6000),
  });
  if (!respuesta.ok) {
    console.error('Google autocomplete', respuesta.status, await respuesta.text().catch(() => ''));
    return NextResponse.json({ error: 'Google no respondió.' }, { status: 502 });
  }
  const datos = await respuesta.json();
  const lista: any[] = Array.isArray(datos?.suggestions) ? datos.suggestions : [];
  const lugares = lista
    .map((s) => s?.placePrediction)
    .filter((p) => p?.placeId && p?.text?.text)
    .map((p) => ({
      placeId: p.placeId as string,
      direccion: p.text.text as string,
      principal: (p.structuredFormat?.mainText?.text as string) || null,
      secundario: (p.structuredFormat?.secondaryText?.text as string) || null,
    }));
  return NextResponse.json({ lugares });
}

async function coordenadasDelLugar(id: string, sesion: string) {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?sessionToken=${encodeURIComponent(sesion)}&languageCode=es`;
  // Solo la ubicación: es el campo más barato (tarifa «Essentials»).
  const respuesta = await fetch(url, {
    headers: { 'X-Goog-Api-Key': LLAVE as string, 'X-Goog-FieldMask': 'location' },
    signal: AbortSignal.timeout(6000),
  });
  if (!respuesta.ok) {
    console.error('Google place details', respuesta.status, await respuesta.text().catch(() => ''));
    return NextResponse.json({ error: 'No se pudo obtener la ubicación del lugar.' }, { status: 502 });
  }
  const datos = await respuesta.json();
  const lat = Number(datos?.location?.latitude);
  const lng = Number(datos?.location?.longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: 'Google no dio la ubicación de ese lugar.' }, { status: 502 });
  }
  return NextResponse.json({ lat, lng });
}
