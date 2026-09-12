'use client';

export type GeoPoint = { lat: number; lng: number; accuracy?: number } | null;

// Intenta obtener la ubicación actual del dispositivo. Nunca rechaza (reject) —
// si el usuario niega el permiso, si el navegador no lo soporta, o si tarda
// demasiado, simplemente resuelve con null para no bloquear el registro del evento.
export function getCurrentLocation(timeoutMs = 6000): Promise<GeoPoint> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => resolve(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({
          lat: Math.round(pos.coords.latitude * 1e6) / 1e6,
          lng: Math.round(pos.coords.longitude * 1e6) / 1e6,
          accuracy: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : undefined,
        });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
    );
  });
}

export function mapsLink(loc: GeoPoint): string | null {
  if (!loc) return null;
  return `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
}
