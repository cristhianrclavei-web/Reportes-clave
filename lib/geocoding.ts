'use client';

import { distanciaMetros } from './geocerca';
import type { Punto } from './geocerca';

export type SugerenciaDireccion = { direccion: string; lat: number; lng: number };

// Búsqueda de direcciones, gratis y sin llave ni cuenta (Google Places cobra
// y pide facturación desde el primer request). Dos buscadores sobre los
// datos de OpenStreetMap:
//   · Photon: pensado para buscar mientras se escribe y por nombre de lugar
//     («Plaza Galerías», «Capital Norte»), y acepta un punto de referencia
//     para preferir lo que queda cerca.
//   · Nominatim: respaldo si Photon falla o no encuentra nada.
//
// `cerca` es la zona donde trabaja la empresa (ver zonaDeTrabajo): con ella
// los resultados de la zona salen primero, en vez de los de otros estados.
// Solo México, como el resto de la app.

// Hasta aquí un resultado cuenta como «de la zona» y va antes que los demás.
const RADIO_ZONA_M = 150_000;

export async function buscarDirecciones(query: string, cerca?: Punto | null): Promise<SugerenciaDireccion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  let resultados: SugerenciaDireccion[] = [];
  try {
    resultados = await buscarEnPhoton(q, cerca || null);
  } catch {
    // Photon caído o sin red: se intenta con el respaldo.
  }
  if (resultados.length === 0) resultados = await buscarEnNominatim(q);

  return primeroLosDeLaZona(sinRepetidos(resultados), cerca || null).slice(0, 6);
}

async function buscarEnPhoton(q: string, cerca: Punto | null): Promise<SugerenciaDireccion[]> {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '10');
  url.searchParams.set('lang', 'default'); // nombres como están en el mapa (español)
  if (cerca) {
    url.searchParams.set('lat', String(cerca.lat));
    url.searchParams.set('lon', String(cerca.lng));
  }
  const respuesta = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!respuesta.ok) return [];
  const datos = await respuesta.json();
  const lugares: any[] = Array.isArray(datos?.features) ? datos.features : [];
  return lugares
    .filter((f) => f?.properties?.countrycode === 'MX')
    .map((f) => ({
      direccion: direccionDePhoton(f.properties),
      lat: Number(f.geometry?.coordinates?.[1]),
      lng: Number(f.geometry?.coordinates?.[0]),
    }))
    .filter((s) => s.direccion && !Number.isNaN(s.lat) && !Number.isNaN(s.lng));
}

async function buscarEnNominatim(q: string): Promise<SugerenciaDireccion[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '6');
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

// Dirección de un punto (al usar «mi ubicación actual» o pegar un enlace de
// Maps, que solo traen coordenadas). Devuelve '' si no se pudo averiguar:
// la dirección es un dato de apoyo, las coordenadas ya bastan para guardar.
export async function direccionDePunto(punto: Punto): Promise<string> {
  try {
    const url = new URL('https://photon.komoot.io/reverse');
    url.searchParams.set('lat', String(punto.lat));
    url.searchParams.set('lon', String(punto.lng));
    url.searchParams.set('lang', 'default');
    const respuesta = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (respuesta.ok) {
      const datos = await respuesta.json();
      const lugar = datos?.features?.[0]?.properties;
      if (lugar) return direccionDePhoton(lugar);
    }
  } catch {
    // sin red o buscador caído: se intenta con el respaldo
  }
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(punto.lat));
    url.searchParams.set('lon', String(punto.lng));
    url.searchParams.set('format', 'jsonv2');
    const respuesta = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!respuesta.ok) return '';
    const datos = await respuesta.json();
    return typeof datos?.display_name === 'string' ? datos.display_name : '';
  } catch {
    return '';
  }
}

// «Plaza Galerías, Avenida Rafael Sanzio 150, La Estancia, Zapopan, Jalisco».
export function direccionDePhoton(p: Record<string, any>): string {
  const calle = [p.street, p.housenumber].filter(Boolean).join(' ');
  const partes = [p.name, calle, p.district || p.locality, p.city || p.county, p.state].filter(Boolean) as string[];
  // El nombre de una calle suele venir repetido como «name» y «street».
  return partes.filter((parte, i) => partes.indexOf(parte) === i).join(', ');
}

// El mismo lugar puede venir dos veces (como punto y como edificio): en la
// lista se verían idénticos, así que se queda el primero.
export function sinRepetidos(lista: SugerenciaDireccion[]): SugerenciaDireccion[] {
  const vistos = new Set<string>();
  return lista.filter((s) => {
    const clave = s.direccion.toLowerCase();
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

// Los resultados de la zona de trabajo van primero; dentro de cada grupo se
// respeta el orden del buscador (qué tan bien coincide con lo escrito).
export function primeroLosDeLaZona(lista: SugerenciaDireccion[], cerca: Punto | null): SugerenciaDireccion[] {
  if (!cerca) return lista;
  const deLaZona = lista.filter((s) => distanciaMetros(s, cerca) <= RADIO_ZONA_M);
  const deFuera = lista.filter((s) => distanciaMetros(s, cerca) > RADIO_ZONA_M);
  return [...deLaZona, ...deFuera];
}

// Dónde trabaja la empresa: el punto «de en medio» de los sitios que ya
// tiene registrados. Se usa la mediana y no el promedio para que un servicio
// foráneo no jale el centro hacia otro estado. Sin sitios registrados, null.
export function zonaDeTrabajo(sitios: (Punto | null | undefined)[]): Punto | null {
  const puntos = sitios.filter((s): s is Punto => !!s && typeof s.lat === 'number' && typeof s.lng === 'number');
  if (puntos.length === 0) return null;
  const mediana = (valores: number[]) => {
    const orden = [...valores].sort((a, b) => a - b);
    return orden[Math.floor(orden.length / 2)];
  };
  return { lat: mediana(puntos.map((p) => p.lat)), lng: mediana(puntos.map((p) => p.lng)) };
}

// Los enlaces cortos de Google Maps no traen coordenadas — hay que
// resolverlos del lado del servidor (CORS no deja leerlos desde aquí). Ver
// app/api/resolver-enlace-mapa.
export async function resolverEnlaceMapa(url: string): Promise<{ punto: Punto } | { error: string }> {
  try {
    const respuesta = await fetch('/api/resolver-enlace-mapa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const datos = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      return { error: datos?.error || 'No se pudo resolver el enlace.' };
    }
    if (typeof datos?.lat !== 'number' || typeof datos?.lng !== 'number') {
      return { error: 'El enlace no trae coordenadas.' };
    }
    return { punto: { lat: datos.lat, lng: datos.lng } };
  } catch {
    return { error: 'No se pudo conectar para resolver el enlace.' };
  }
}
