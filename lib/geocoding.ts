'use client';

export type SugerenciaDireccion = { direccion: string; lat: number; lng: number };

// Búsqueda de direcciones vía Nominatim (OpenStreetMap): gratis, sin llave
// ni cuenta — a diferencia de Google Places, que cobra y pide facturación
// desde el primer request. Sesgado a México porque toda la app lo está
// (formatos de fecha es-MX, CRM0851), pero no lo restringe: si alguien
// escribe una dirección de otro país, igual puede aparecer.
export async function buscarDirecciones(query: string): Promise<SugerenciaDireccion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('countrycodes', 'mx');

  const respuesta = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!respuesta.ok) return [];
  const datos = await respuesta.json();
  if (!Array.isArray(datos)) return [];
  return datos
    .map((d: any) => ({
      direccion: d.display_name as string,
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
    }))
    .filter((s) => s.direccion && !Number.isNaN(s.lat) && !Number.isNaN(s.lng));
}
