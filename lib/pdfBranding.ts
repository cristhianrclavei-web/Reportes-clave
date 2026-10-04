import { PDFDocument, PDFFont, PDFPage, rgb, degrees, LineCapStyle, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { BARLOW_CONDENSED_BOLD_BASE64, INTER_REGULAR_BASE64, INTER_SEMIBOLD_BASE64 } from './brandFonts';
import { MARCA, MARCA_MAYUS, COLORES } from './marca';
import {
  ESCUDO_CONTORNO, ESCUDO_RAMAL, ESCUDO_TRAZO, ESCUDO_NODOS, ESCUDO_LETRA,
  ICONOS_SERVICIO, ROJO_FLAMA, tramosNombre,
} from './logoMarca';

// Piezas de marca compartidas entre los distintos PDF que genera la app
// (reporte de servicio, cotización, ...): colores, tipografía y el logo en
// vectores (mismos paths SVG que components/Logo.tsx, no una imagen). Antes
// vivían solo dentro de generateReportPdf.ts; se movieron aquí cuando
// apareció un segundo PDF (cotizaciones) que necesitaba el mismo encabezado.

export const NAVY = rgb(0.06, 0.15, 0.23);
function hex(h: string) {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
// Acento oscuro de títulos y totales: sigue el tema de la instalación.
export const TEAL_DARK = MARCA.tema === 'azul' ? hex(COLORES.acentoOscuro) : rgb(0.07, 0.25, 0.21);
export const GRAY_LINE = rgb(0.55, 0.55, 0.55);
export const GRAY_TEXT = rgb(0.42, 0.48, 0.5);
export const WHITE = rgb(1, 1, 1);
// VERDE y ROJO tienen significado en los documentos (cumple / no cumple,
// aprobada / rechazada): no cambian con el tema.
export const VERDE = rgb(0x2f / 255, 0x7d / 255, 0x5c / 255);
// Color del logo y de la línea bajo el nombre: estos sí siguen a la marca.
export const COLOR_MARCA = hex(COLORES.logo);
export const ROJO = rgb(0xe0 / 255, 0x65 / 255, 0x4a / 255);
export const LINEA_MARCA = MARCA.logo === 'bloque' ? COLOR_MARCA : ROJO;

export const PAGE_W = 612;
export const PAGE_H = 792;
export const MARGIN = 34;

export function circlePath(cx: number, cy: number, r: number): string {
  return `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0`;
}
export function rectPath(x: number, y: number, w: number, h: number): string {
  return `M${x},${y} h${w} v${h} h${-w} Z`;
}

// Marca «bloque» (cuadro redondeado), viewBox 0 0 100 100 — igual que
// Bloque() en Logo.tsx.
export const BLOQUE_PATH = 'M30 6 H70 A24 24 0 0 1 94 30 V70 A24 24 0 0 1 70 94 H30 A24 24 0 0 1 6 70 V30 A24 24 0 0 1 30 6 Z';
export const BLOQUE_NODES: [number, number, number][] = [[66, 20, 5], [80, 34, 5]];
export const BLOQUE_LINE_PATH = 'M66 20 L80 34';

export type BrandFonts = { font: PDFFont; bold: PDFFont; display: PDFFont };

// Fuentes de marca (Barlow Condensed + Inter, las mismas que la app) en vez
// de Helvetica genérica. Si el embed fallara por lo que sea, un PDF con
// tipografía estándar es mejor que un PDF que no se genera.
export async function embedBrandFonts(pdfDoc: PDFDocument): Promise<BrandFonts> {
  try {
    pdfDoc.registerFontkit(fontkit);
    const font = await pdfDoc.embedFont(Buffer.from(INTER_REGULAR_BASE64, 'base64'));
    const bold = await pdfDoc.embedFont(Buffer.from(INTER_SEMIBOLD_BASE64, 'base64'));
    const display = await pdfDoc.embedFont(Buffer.from(BARLOW_CONDENSED_BOLD_BASE64, 'base64'));
    return { font, bold, display };
  } catch (e) {
    console.error('No se pudieron incrustar las fuentes de marca, usando Helvetica:', e);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    return { font, bold, display: bold };
  }
}

// Escudo (hexágono + "CI"), anclado en (x, yTop) = esquina superior
// izquierda del viewBox 100x100 — igual que Badge() en Logo.tsx.
export function drawBadge(
  pg: PDFPage,
  display: PDFFont,
  x: number,
  yTop: number,
  size: number,
  opts: { textColor?: ReturnType<typeof rgb>; markColor?: ReturnType<typeof rgb>; opacity?: number; rotate?: ReturnType<typeof degrees> } = {}
) {
  const scale = size / 100;
  const opacity = opts.opacity ?? 1;
  const markColor = opts.markColor ?? COLOR_MARCA;
  const rotate = opts.rotate;

  if (MARCA.logo === 'bloque') {
    // Marca de agua (markColor explícito): solo el contorno, para no tapar
    // el contenido. En el encabezado: bloque relleno con iniciales blancas.
    const contorno = opts.markColor !== undefined;
    const tinta = contorno ? markColor : WHITE;
    if (contorno) {
      pg.drawSvgPath(BLOQUE_PATH, { x, y: yTop, scale, borderColor: markColor, borderWidth: 5, borderOpacity: opacity, rotate });
    } else {
      pg.drawSvgPath(BLOQUE_PATH, { x, y: yTop, scale, color: markColor, opacity, rotate });
    }
    for (const [cx, cy, r] of BLOQUE_NODES) {
      pg.drawSvgPath(circlePath(cx, cy, r), { x, y: yTop, scale, color: tinta, opacity, rotate });
    }
    pg.drawSvgPath(BLOQUE_LINE_PATH, { x, y: yTop, scale, borderColor: tinta, borderWidth: 3.5, borderOpacity: opacity, borderLineCap: LineCapStyle.Round, rotate });
    const fs = 38 * scale;
    const tw = display.widthOfTextAtSize(MARCA.iniciales, fs);
    const lx = scale * 48 - tw / 2;
    const ly = -scale * 69;
    const rd = rotate ? (rotate.angle * Math.PI) / 180 : 0;
    pg.drawText(MARCA.iniciales, {
      x: x + lx * Math.cos(rd) - ly * Math.sin(rd),
      y: yTop + lx * Math.sin(rd) + ly * Math.cos(rd),
      size: fs, font: display, color: contorno ? (opts.textColor ?? markColor) : WHITE, opacity, rotate,
    });
    return;
  }

  // Misma geometría que Badge() en Logo.tsx (lib/logoMarca.ts).
  for (const d of [ESCUDO_CONTORNO, ESCUDO_RAMAL]) {
    pg.drawSvgPath(d, { x, y: yTop, scale, borderColor: markColor, borderWidth: ESCUDO_TRAZO, borderOpacity: opacity, borderLineCap: LineCapStyle.Round, rotate });
  }
  for (const [cx, cy, r] of ESCUDO_NODOS) {
    pg.drawSvgPath(circlePath(cx, cy, r), { x, y: yTop, scale, color: markColor, opacity, rotate });
  }

  // El texto no pasa por la misma matriz que drawSvgPath (que invierte Y
  // internamente), así que su rotación y el punto de anclaje se calculan
  // aparte, sobre el mismo círculo trigonométrico que usa el resto del PDF.
  const fontSize = (MARCA.iniciales.length > 2 ? ESCUDO_LETRA.tam * 0.76 : ESCUDO_LETRA.tam) * scale;
  const textW = display.widthOfTextAtSize(MARCA.iniciales, fontSize);
  const localX = scale * ESCUDO_LETRA.x - textW / 2;
  const localY = -scale * ESCUDO_LETRA.y;
  const rad = rotate ? (rotate.angle * Math.PI) / 180 : 0;
  pg.drawText(MARCA.iniciales, {
    x: x + localX * Math.cos(rad) - localY * Math.sin(rad),
    y: yTop + localX * Math.sin(rad) + localY * Math.cos(rad),
    size: fontSize,
    font: display,
    color: opts.textColor ?? NAVY,
    opacity,
    rotate,
  });
}

// Nombre de la marca como en el logo: Clave Inteligente en versalitas (la
// inicial de cada palabra más alta); las demás marcas, en mayúsculas parejas.
// (x, y) = inicio de la línea base. Devuelve el ancho dibujado.
export function drawWordmark(pg: PDFPage, display: PDFFont, x: number, y: number, size: number, color: ReturnType<typeof rgb> = NAVY): number {
  if (MARCA.logo === 'bloque') {
    pg.drawText(MARCA_MAYUS, { x, y, size, font: display, color });
    return display.widthOfTextAtSize(MARCA_MAYUS, size);
  }
  // Un poco más grande que el tamaño pedido: las versalitas ocupan menos
  // que las mayúsculas parejas y el nombre quedaba corto sobre la tira.
  let cx = x;
  for (const t of tramosNombre(MARCA.nombre)) {
    const tam = size * 1.14 * t.escala;
    pg.drawText(t.texto, { x: cx, y, size: tam, font: display, color });
    cx += display.widthOfTextAtSize(t.texto, tam);
  }
  return cx - x;
}

// Los seis íconos de servicio en fila, anclados en (x, yTop) = tope de cada
// ícono (viewBox 24x24) — mismas piezas que TiraIconos() en Logo.tsx: la
// flama en rojo, los demás en `color` y el detector en el tono fuerte.
const ROJO_ICONO = hex(ROJO_FLAMA);
export function drawIconStrip(pg: PDFPage, x: number, yTop: number, size: number, color: ReturnType<typeof rgb>) {
  if (!MARCA.iconos) return;
  const scale = size / 24;
  const gap = size * 0.36;
  let cx = x;
  for (const ico of ICONOS_SERVICIO) {
    const c = ico.tono === 'rojo' ? ROJO_ICONO : ico.tono === 'fuerte' ? NAVY : color;
    for (const pz of ico.piezas) {
      if (pz.trazo) pg.drawSvgPath(pz.d, { x: cx, y: yTop, scale, borderColor: c, borderWidth: pz.trazo, borderLineCap: LineCapStyle.Round });
      else pg.drawSvgPath(pz.d, { x: cx, y: yTop, scale, color: c });
    }
    cx += size + gap;
  }
}

// Marca de agua: el escudo en diagonal, muy tenue, centrado en la página —
// le da autenticidad al documento sin estorbar la lectura.
export function drawWatermark(pg: PDFPage, display: PDFFont) {
  const watermarkAngle = degrees(30);
  const watermarkRad = (30 * Math.PI) / 180;
  const wmSize = 230;
  const watermarkX = PAGE_W / 2 - (wmSize / 2) * Math.cos(watermarkRad) - (wmSize / 2) * Math.sin(watermarkRad);
  const watermarkY = PAGE_H / 2 - (wmSize / 2) * Math.sin(watermarkRad) + (wmSize / 2) * Math.cos(watermarkRad);
  drawBadge(pg, display, watermarkX, watermarkY, wmSize, {
    markColor: NAVY, textColor: NAVY, opacity: 0.08, rotate: watermarkAngle,
  });
}
