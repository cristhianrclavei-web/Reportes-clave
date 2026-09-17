import { PDFDocument, PDFFont, PDFPage, rgb, degrees, LineCapStyle, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { BARLOW_CONDENSED_BOLD_BASE64, INTER_REGULAR_BASE64, INTER_SEMIBOLD_BASE64 } from './brandFonts';

// Piezas de marca compartidas entre los distintos PDF que genera la app
// (reporte de servicio, cotización, ...): colores, tipografía y el logo en
// vectores (mismos paths SVG que components/Logo.tsx, no una imagen). Antes
// vivían solo dentro de generateReportPdf.ts; se movieron aquí cuando
// apareció un segundo PDF (cotizaciones) que necesitaba el mismo encabezado.

export const NAVY = rgb(0.06, 0.15, 0.23);
export const TEAL_DARK = rgb(0.07, 0.25, 0.21);
export const GRAY_LINE = rgb(0.55, 0.55, 0.55);
export const GRAY_TEXT = rgb(0.42, 0.48, 0.5);
export const WHITE = rgb(1, 1, 1);
export const VERDE = rgb(0x2f / 255, 0x7d / 255, 0x5c / 255);
export const ROJO = rgb(0xe0 / 255, 0x65 / 255, 0x4a / 255);

export const PAGE_W = 612;
export const PAGE_H = 792;
export const MARGIN = 34;

export function circlePath(cx: number, cy: number, r: number): string {
  return `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0`;
}
export function rectPath(x: number, y: number, w: number, h: number): string {
  return `M${x},${y} h${w} v${h} h${-w} Z`;
}

// Hexágono con nodos, viewBox 0 0 100 100 — igual que Badge() en Logo.tsx.
export const BADGE_HEX_PATH = 'M50 8 L84 26 V64 L50 92 L16 64 V26 Z';
export const BADGE_NODES: [number, number, number][] = [[50, 8, 7], [16, 45, 7], [50, 92, 7]];
export const BADGE_LINE_PATH = 'M16 45 L50 92';

// Los seis servicios, viewBox 0 0 24 24 — mismos paths que ICONOS en Logo.tsx.
export const ICONOS_PATHS: string[][] = [
  ['M12.4 2.6c2.9 2.9 4.8 5.6 4.8 8.6a5.2 5.2 0 0 1-10.4 0c0-1.5.5-2.8 1.5-3.9.1 1.4.8 2.3 1.9 2.5-.7-2.7-.1-5 2.2-7.2Z'],
  [
    'M3.6 8.9 16.8 5.4l1.3 4.8-13.2 3.5Z',
    'm18.1 10.2 2.6-.7-.9-3.2-2.6.7',
    'M7.5 13.4v2.4a2 2 0 0 0 2 2h.6',
    circlePath(10.4, 19.6, 1.6),
  ],
  [
    'M12 3 19 5.6v5.6c0 4-2.8 7.3-7 8.8-4.2-1.5-7-4.8-7-8.8V5.6Z',
    rectPath(9.4, 10.8, 5.2, 4.6),
    'M10.6 10.8V9.6a1.4 1.4 0 0 1 2.8 0v1.2',
  ],
  [
    'M3.6 4.4h16.8l-1.9 8.4H5.5Z',
    'M9.8 4.4 8.7 12.8M14.2 4.4l1.1 8.4M4.5 8.6h15',
    'M12 12.8v5.4M8.8 20.6h6.4',
  ],
  [
    'M4.5 20.6h8.4',
    'M7.6 20.6v-6.4l3.6-6.2',
    'm11.6 7.6 5.1 2.2',
    circlePath(11.2, 7.2, 1.9),
    'm16.6 8 2.6 1.1-1.1 2.6-2.6-1.1Z',
  ],
  [
    'M4.4 12.4a7.6 7.6 0 0 1 15.2 0',
    rectPath(3, 12.4, 18, 2.8),
    'M7.4 18h9.2',
  ],
];

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
  const markColor = opts.markColor ?? VERDE;
  const rotate = opts.rotate;
  pg.drawSvgPath(BADGE_HEX_PATH, { x, y: yTop, scale, borderColor: markColor, borderWidth: 6, borderOpacity: opacity, borderLineCap: LineCapStyle.Round, rotate });
  for (const [cx, cy, r] of BADGE_NODES) {
    pg.drawSvgPath(circlePath(cx, cy, r), { x, y: yTop, scale, color: markColor, opacity, rotate });
  }
  pg.drawSvgPath(BADGE_LINE_PATH, { x, y: yTop, scale, borderColor: markColor, borderWidth: 5, borderOpacity: opacity, borderLineCap: LineCapStyle.Round, rotate });

  // El texto no pasa por la misma matriz que drawSvgPath (que invierte Y
  // internamente), así que su rotación y el punto de anclaje se calculan
  // aparte, sobre el mismo círculo trigonométrico que usa el resto del PDF.
  const fontSize = 38 * scale;
  const textW = display.widthOfTextAtSize('CI', fontSize);
  const localX = scale * 50 - textW / 2;
  const localY = -scale * 62;
  const rad = rotate ? (rotate.angle * Math.PI) / 180 : 0;
  pg.drawText('CI', {
    x: x + localX * Math.cos(rad) - localY * Math.sin(rad),
    y: yTop + localX * Math.sin(rad) + localY * Math.cos(rad),
    size: fontSize,
    font: display,
    color: opts.textColor ?? NAVY,
    opacity,
    rotate,
  });
}

// Los seis íconos de servicio en fila, anclados en (x, yTop) = tope de cada
// ícono (viewBox 24x24) — igual que TiraIconos() en Logo.tsx.
export function drawIconStrip(pg: PDFPage, x: number, yTop: number, size: number, color: ReturnType<typeof rgb>) {
  const scale = size / 24;
  const gap = 5;
  let cx = x;
  for (const paths of ICONOS_PATHS) {
    for (const d of paths) {
      pg.drawSvgPath(d, { x: cx, y: yTop, scale, borderColor: color, borderWidth: 1.9, borderLineCap: LineCapStyle.Round });
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
