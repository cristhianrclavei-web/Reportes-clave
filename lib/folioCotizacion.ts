// Folio de cotización: número consecutivo + siglas de sus sistemas, para
// saber de qué es sin abrirla. Ejemplos: COT-51-CCTV, COT-52-CCTV-DH,
// COT-53-VARIOS (tres o más), COT-54 (solo «General»).
//
// El número va a dos dígitos y crece solo (07, 51, 100, 1000). Las
// cotizaciones viejas (COT-0049) conservan su folio.

// Se revisan en orden: «Alarma & Detección de Humo» debe caer en DH antes
// de que «alarma» la mande a ALM.
const SIGLAS_POR_PALABRA: { palabras: string[]; siglas: string }[] = [
  { palabras: ['cctv', 'camara', 'videovigilancia'], siglas: 'CCTV' },
  { palabras: ['humo', 'deteccion', 'incendio', 'extincion', 'notifier'], siglas: 'DH' },
  { palabras: ['intrusion', 'alarma'], siglas: 'ALM' },
  { palabras: ['acceso', 'cda'], siglas: 'CA' },
  { palabras: ['solar', 'fotovoltaic', 'paneles'], siglas: 'FV' },
  { palabras: ['voceo'], siglas: 'VOZ' },
];

function sinAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Siglas de un sistema; null para «General» (no dice nada del contenido).
export function siglasDeSistema(sistema: string): string | null {
  const limpio = sinAcentos(sistema.trim());
  if (!limpio || limpio === 'general') return null;
  for (const { palabras, siglas } of SIGLAS_POR_PALABRA) {
    if (palabras.some((p) => limpio.includes(p))) return siglas;
  }
  // Sistema que no está en la lista: primeras 4 letras de su primera palabra.
  const primeraPalabra = limpio.replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/)[0] || '';
  return primeraPalabra.slice(0, 4).toUpperCase() || null;
}

// Siglas sin repetir: obra y póliza de CCTV dan solo «CCTV».
export function sufijoDeSistemas(sistemas: string[]): string {
  const unicas: string[] = [];
  for (const s of sistemas) {
    const siglas = siglasDeSistema(s);
    if (siglas && !unicas.includes(siglas)) unicas.push(siglas);
  }
  if (unicas.length === 0) return '';
  if (unicas.length > 2) return 'VARIOS';
  return unicas.join('-');
}

export function armarFolio(numero: number, sistemas: string[]): string {
  const sufijo = sufijoDeSistemas(sistemas);
  const base = `COT-${String(numero).padStart(2, '0')}`;
  return sufijo ? `${base}-${sufijo}` : base;
}

// Número de un folio, viejo o nuevo: «COT-0049» → 49, «COT-51-CCTV» → 51.
export function numeroDeFolio(folio: string): number | null {
  const encontrado = /^COT-(\d+)/i.exec(folio || '');
  return encontrado ? Number(encontrado[1]) : null;
}

// El mayor número usado + 1. Antes se contaban las filas, pero al borrar una
// cotización el número se repetía.
export function siguienteNumero(folios: string[]): number {
  let mayor = 0;
  for (const f of folios) {
    const n = numeroDeFolio(f);
    if (n !== null && n > mayor) mayor = n;
  }
  return mayor + 1;
}

// Al editar un borrador se actualizan las siglas (se agregó o quitó un
// sistema); el número no cambia. Los folios viejos de 4 dígitos sin siglas
// (COT-0049) se quedan como están.
export function folioActualizado(folioActual: string, sistemas: string[]): string {
  if (/^COT-\d{4}$/i.test(folioActual)) return folioActual;
  const numero = numeroDeFolio(folioActual);
  if (numero === null) return folioActual;
  return armarFolio(numero, sistemas);
}
