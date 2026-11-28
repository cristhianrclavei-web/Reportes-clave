import sharp from 'sharp';
import fontkit from '@pdf-lib/fontkit';
import { BARLOW_CONDENSED_BOLD_BASE64 } from './brandFonts';
import { MARCA, MARCA_MAYUS, COLORES } from './marca';
import {
  ESCUDO_CONTORNO, ESCUDO_RAMAL, ESCUDO_TRAZO, ESCUDO_NODOS, ESCUDO_LETRA,
  ICONOS_SERVICIO, ROJO_FLAMA, tramosNombre,
} from './logoMarca';

// El logo de la marca como imagen PNG para el Excel (Excel no dibuja
// vectores como el PDF). Se arma un SVG con la misma geometría que el PDF
// (lib/pdfBranding.ts) y sharp lo convierte a PNG. Las letras van como
// trazos (no como texto) para no depender de las fuentes del servidor.

const NAVY = '#0F263B';
const GRIS = '#6B7A80';
const ROJO_LINEA = '#E0654A';
const BLOQUE_PATH = 'M30 6 H70 A24 24 0 0 1 94 30 V70 A24 24 0 0 1 70 94 H30 A24 24 0 0 1 6 70 V30 A24 24 0 0 1 30 6 Z';

// Resolución: el SVG se dibuja en puntos y se rasteriza 4 veces más grande
// para que no se vea borroso al imprimir.
const NITIDEZ = 4;

type Fuente = ReturnType<typeof fontkit.create>;
let fuenteCache: Fuente | null = null;
function fuente(): Fuente {
  if (!fuenteCache) fuenteCache = fontkit.create(Buffer.from(BARLOW_CONDENSED_BOLD_BASE64, 'base64'));
  return fuenteCache;
}

// Texto convertido a trazos. (x, y) = inicio de la línea base.
function textoComoTrazos(texto: string, tamano: number, x: number, y: number, color: string): { svg: string; ancho: number } {
  const f = fuente();
  const escala = tamano / f.unitsPerEm;
  const corrida = f.layout(texto);
  let cursor = 0;
  const piezas: string[] = [];
  corrida.glyphs.forEach((glifo: any, i: number) => {
    const d = glifo.path.toSVG();
    if (d) piezas.push(`<path d="${d}" fill="${color}" transform="translate(${x + cursor * escala} ${y}) scale(${escala} ${-escala})"/>`);
    cursor += corrida.positions[i].xAdvance;
  });
  return { svg: piezas.join(''), ancho: cursor * escala };
}

function anchoDeTexto(texto: string, tamano: number): number {
  return textoComoTrazos(texto, tamano, 0, 0, '#000').ancho;
}

function circulo(cx: number, cy: number, r: number, relleno: string, extra = ''): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${relleno}" ${extra}/>`;
}

// Escudo de la marca en su caja de 100×100. `contorno`: versión de marca de
// agua (solo líneas, todo en un color), como en el PDF.
function escudoSvg(contorno: boolean, colorMarca: string, colorLetras: string): string {
  if (MARCA.logo === 'punto') {
    const halo = contorno
      ? `<circle cx="50" cy="50" r="42" fill="none" stroke="${colorMarca}" stroke-width="5"/>`
      : circulo(50, 50, 42, colorMarca, 'fill-opacity="0.2"');
    return halo + circulo(50, 50, 21, colorMarca);
  }

  if (MARCA.logo === 'bloque') {
    const tinta = contorno ? colorMarca : '#FFFFFF';
    const fondo = contorno
      ? `<path d="${BLOQUE_PATH}" fill="none" stroke="${colorMarca}" stroke-width="5"/>`
      : `<path d="${BLOQUE_PATH}" fill="${colorMarca}"/>`;
    const nodos = circulo(66, 20, 5, tinta) + circulo(80, 34, 5, tinta);
    const linea = `<path d="M66 20 L80 34" stroke="${tinta}" stroke-width="3.5" stroke-linecap="round"/>`;
    const ancho = anchoDeTexto(MARCA.iniciales, 38);
    const letras = textoComoTrazos(MARCA.iniciales, 38, 48 - ancho / 2, 69, contorno ? colorLetras : '#FFFFFF').svg;
    return fondo + nodos + linea + letras;
  }

  const trazos = [ESCUDO_CONTORNO, ESCUDO_RAMAL]
    .map((d) => `<path d="${d}" fill="none" stroke="${colorMarca}" stroke-width="${ESCUDO_TRAZO}" stroke-linecap="round" stroke-linejoin="round"/>`)
    .join('');
  const nodos = ESCUDO_NODOS.map(([cx, cy, r]) => circulo(cx, cy, r, colorMarca)).join('');
  const tamano = MARCA.iniciales.length > 2 ? ESCUDO_LETRA.tam * 0.76 : ESCUDO_LETRA.tam;
  const ancho = anchoDeTexto(MARCA.iniciales, tamano);
  const letras = textoComoTrazos(MARCA.iniciales, tamano, ESCUDO_LETRA.x - ancho / 2, ESCUDO_LETRA.y, colorLetras).svg;
  return trazos + nodos + letras;
}

// Nombre como en el PDF: Clave Inteligente en versalitas; las demás marcas
// en mayúsculas parejas o tal cual.
function nombreSvg(x: number, y: number, tamano: number): { svg: string; ancho: number } {
  if (MARCA.logo === 'bloque') return textoComoTrazos(MARCA_MAYUS, tamano, x, y, NAVY);
  if (MARCA.logo === 'punto') return textoComoTrazos(MARCA.nombre, tamano, x, y, NAVY);
  let cursor = x;
  const piezas: string[] = [];
  for (const tramo of tramosNombre(MARCA.nombre)) {
    const parte = textoComoTrazos(tramo.texto, tamano * 1.14 * tramo.escala, cursor, y, NAVY);
    piezas.push(parte.svg);
    cursor += parte.ancho;
  }
  return { svg: piezas.join(''), ancho: cursor - x };
}

function tiraDeIconosSvg(x: number, yTope: number, tamano: number): string {
  if (!MARCA.iconos) return '';
  const escala = tamano / 24;
  const separacion = tamano * 0.36;
  return ICONOS_SERVICIO.map((icono, i) => {
    let color = GRIS;
    if (icono.tono === 'rojo') color = ROJO_FLAMA;
    if (icono.tono === 'fuerte') color = NAVY;
    const piezas = icono.piezas.map((pieza) => (pieza.trazo
      ? `<path d="${pieza.d}" fill="none" stroke="${color}" stroke-width="${pieza.trazo}" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="${pieza.d}" fill="${color}"/>`)).join('');
    const xIcono = x + i * (tamano + separacion);
    return `<g transform="translate(${xIcono} ${yTope}) scale(${escala})">${piezas}</g>`;
  }).join('');
}

async function aPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export type ImagenExcel = { png: Buffer; ancho: number; alto: number };

// Encabezado: escudo + nombre + línea + tira de servicios, como en el PDF.
// `ancho` y `alto` en puntos (lo que mide en la hoja).
export async function encabezadoDeMarca(): Promise<ImagenExcel> {
  const tamanoEscudo = 40;
  const xNombre = tamanoEscudo + 12;
  const nombre = nombreSvg(xNombre, 17, 15);
  const yLinea = 25;
  const colorLinea = MARCA.logo === 'escudo' ? ROJO_LINEA : COLORES.logo;
  // Con un nombre corto la tira de íconos es más ancha que el nombre.
  const tamanoIcono = 14;
  const anchoTira = MARCA.iconos ? ICONOS_SERVICIO.length * tamanoIcono * 1.36 : 0;
  const ancho = Math.ceil(xNombre + Math.max(nombre.ancho, anchoTira) + 2);
  const alto = 48;
  const contenido = [
    `<g transform="scale(${tamanoEscudo / 100})">${escudoSvg(false, COLORES.logo, NAVY)}</g>`,
    nombre.svg,
    `<path d="M${xNombre} ${yLinea} H${xNombre + nombre.ancho}" stroke="${colorLinea}" stroke-width="1"/>`,
    tiraDeIconosSvg(xNombre, yLinea + 8, tamanoIcono),
  ].join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho * NITIDEZ}" height="${alto * NITIDEZ}" viewBox="0 0 ${ancho} ${alto}">${contenido}</svg>`;
  return { png: await aPng(svg), ancho, alto };
}

// Marca de agua: el escudo en diagonal, muy tenue, como en el centro de
// cada hoja del PDF. La imagen mide `ancho` × `alto` puntos y el escudo va
// centrado en ella: así, puesta a todo lo ancho de la hoja, queda al centro.
export async function marcaDeAgua(ancho: number, alto: number): Promise<ImagenExcel> {
  // El escudo (caja de 100) ocupa casi todo el alto de la imagen.
  const lado = alto * 0.95;
  const escala = lado / 100;
  const x = (ancho - lado) / 2;
  const y = (alto - lado) / 2;
  const contenido = `<g transform="translate(${x} ${y}) scale(${escala})"><g opacity="0.08" transform="rotate(30 50 50)">${escudoSvg(true, NAVY, NAVY)}</g></g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho * NITIDEZ}" height="${alto * NITIDEZ}" viewBox="0 0 ${ancho} ${alto}">${contenido}</svg>`;
  return { png: await aPng(svg), ancho, alto };
}
