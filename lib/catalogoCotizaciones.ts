// Catálogo propio: los productos de SYSCOM que ya se ligaron en cotizaciones
// anteriores. Sirve para sugerir el enlace al escribir o pegar un concepto
// sin gastar consultas a SYSCOM (cada una sale por Fixie, con cupo mensual).
// El costo guardado es el de cuando se cotizó: el precio de hoy se revisa con
// «Revisar precios». Lógica pura; se prueba en lib/catalogoCotizaciones.test.ts.

import { idProductoDeEnlace } from './syscomEnlace';

export type FilaCotizada = {
  descripcion: string;
  enlace: string | null;
  costo: number | null;
  unidad: string | null;
  fecha: string;
  folio: string | null;
  foto?: string | null;
  modelo?: string | null;
  marca?: string | null;
};

export type ProductoCotizado = {
  id: string;
  enlace: string;
  descripcion: string;
  costo: number | null;
  unidad: string | null;
  // Cuándo y en qué cotización se usó por última vez.
  fecha: string;
  folio: string | null;
  foto: string | null;
  modelo: string | null;
  marca: string | null;
};

// Uno por producto de SYSCOM, el más reciente (su descripción y costo).
export function construirCatalogo(filas: FilaCotizada[]): ProductoCotizado[] {
  const porId = new Map<string, ProductoCotizado>();
  for (const fila of filas) {
    const id = idProductoDeEnlace(fila.enlace || '');
    if (!id || !fila.descripcion.trim()) continue;
    const actual = porId.get(id);
    if (actual && actual.fecha >= fila.fecha) continue;
    porId.set(id, {
      id, enlace: fila.enlace as string, descripcion: fila.descripcion, costo: fila.costo, unidad: fila.unidad, fecha: fila.fecha, folio: fila.folio,
      // Solo la foto de SYSCOM (https); las subidas a mano son de esa cotización.
      foto: fila.foto && /^https:\/\//i.test(fila.foto) ? fila.foto : null,
      modelo: fila.modelo || null, marca: fila.marca || null,
    });
  }
  return [...porId.values()];
}

// Palabras que no distinguen un producto de otro.
const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'para', 'con', 'sin', 'y', 'en', 'a', 'por', 'x', 'o', 'tipo', 'pza', 'pzas', 'pieza', 'piezas', 'unidad', 'unidades', 'paquete', 'material', 'metros', 'mts']);

// «Módulo Solar, 645 W BIFACIAL» → ['modulo', 'solar', '645', 'w', 'bifacial'].
export function palabrasClave(texto: string): string[] {
  const simple = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const palabras = simple.split(/[^a-z0-9ñ.]+/).map((p) => p.replace(/^\.+|\.+$/g, '')).filter((p) => p.length >= 1 && !VACIAS.has(p));
  return [...new Set(palabras)];
}

// Qué tanto del texto buscado aparece en el otro (0 a 1).
export function parecido(buscado: string, otro: string): number {
  const deBuscado = palabrasClave(buscado);
  if (deBuscado.length === 0) return 0;
  const deOtro = new Set(palabrasClave(otro));
  const comunes = deBuscado.filter((p) => deOtro.has(p)).length;
  return comunes / deBuscado.length;
}

// Para sugerir sin preguntar de más: casi todas las palabras deben coincidir.
export const PARECIDO_CATALOGO = 0.8;
// Lo que regresa SYSCOM ya viene ordenado por parecido; basta la mayoría.
export const PARECIDO_SYSCOM = 0.6;

// Texto que vale la pena buscar: un concepto real, no «Mano de obra».
export function vaLaPenaBuscar(texto: string): boolean {
  if (/^(mano de obra|instalaci[oó]n|consumibles|programaci[oó]n|servicio|vi[aá]ticos|flete)/i.test(texto.trim())) return false;
  return palabrasClave(texto).length >= 3;
}

export function buscarEnCatalogo(texto: string, catalogo: ProductoCotizado[]): ProductoCotizado | null {
  let mejor: ProductoCotizado | null = null;
  let puntos = 0;
  for (const producto of catalogo) {
    // En ambos sentidos: el texto pegado puede ser más largo o más corto.
    const p = Math.min(parecido(texto, producto.descripcion), parecido(producto.descripcion, texto) + 0.2);
    if (p > puntos) {
      mejor = producto;
      puntos = p;
    }
  }
  return puntos >= PARECIDO_CATALOGO ? mejor : null;
}

// Lo que se manda a buscar a SYSCOM: el primer renglón, sin cantidades entre
// paréntesis («(6 Unidades)»), cortado para no confundir al buscador.
export function textoParaBuscar(descripcion: string): string {
  return descripcion.split('\n')[0].replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
}

// Diferencia de precio en %, redondeada a un decimal (null sin datos).
export function cambioDePrecio(antes: number | null, ahora: number | null): number | null {
  if (antes === null || ahora === null || !Number.isFinite(antes) || !Number.isFinite(ahora) || antes <= 0) return null;
  return Math.round(((ahora - antes) / antes) * 1000) / 10;
}
