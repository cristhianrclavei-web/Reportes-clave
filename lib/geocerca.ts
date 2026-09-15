export type Punto = { lat: number; lng: number };

// Distancia entre dos puntos GPS en metros (fórmula de haversine). Suficiente
// para comparar contra un radio de geocerca de un puñado de cientos de
// metros — no hace falta más precisión que esa para esta app.
export function distanciaMetros(a: Punto, b: Punto): number {
  const R = 6371000;
  const rad = (n: number) => (n * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const senoLat = Math.sin(dLat / 2);
  const senoLng = Math.sin(dLng / 2);
  const h = senoLat * senoLat + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * senoLng * senoLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Intenta sacar un lat,lng de lo que sea que alguien pegue: un link de
// Google Maps (varios formatos) o las coordenadas escritas directamente.
// No valida que sea realmente un link de Maps — solo busca el primer par de
// números con forma de coordenada, que es lo que todos esos formatos tienen
// en común.
export function extraerCoordenadas(texto: string): Punto | null {
  const m = texto.match(/(-?\d{1,3}\.\d+)\s*[,\s]\s*(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
