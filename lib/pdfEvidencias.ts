import sharp from 'sharp';
import QRCode from 'qrcode';
import {
  PDFDocument, PDFPage, PDFImage, PDFString,
  pushGraphicsState, popGraphicsState, moveTo, lineTo, appendBezierCurve, closePath, clip, endPath,
} from 'pdf-lib';
import { BrandFonts, NAVY, TEAL_DARK, GRAY_TEXT, WHITE, VERDE, LINEA_MARCA } from './pdfBranding';
import {
  MetaFoto, agruparParaPdf, proporcionEstandar, altoObjetivo, filasJustificadas, textoEtapa, fechaHoraFoto,
} from './evidencias';
import { MARCA } from './marca';

// Galería de evidencias de los PDF (reporte, levantamiento, visita): fotos
// recortadas a una proporción estándar con esquinas redondeadas, en filas que
// llenan el ancho, con su número, fecha y comentario debajo. Las marcadas
// «antes» y «después» de una misma área salen lado a lado.

export type ItemPdf = MetaFoto & {
  bytes: Uint8Array;
  caption?: string;
  // Con `video`, `bytes` es su portada. `url` es el enlace público para verlo
  // (sale como QR y como zona tocable); sin él solo se marca como video.
  video?: { dur?: number | null; url?: string | null } | null;
};

// Dónde se dibuja. El generador de cada PDF lleva su propia hoja y cursor;
// aquí solo se le pide espacio y se le devuelve el cursor al terminar.
export type LienzoPdf = {
  pdfDoc: PDFDocument;
  fuentes: BrandFonts;
  x: number;
  ancho: number;
  pagina: () => PDFPage;
  y: () => number;
  fijarY: (y: number) => void;
  // Deja al menos `alto` libre (pasa de hoja si hace falta).
  espacio: (alto: number) => void;
  // Alto aprovechable de una hoja recién abierta.
  altoHoja: number;
};

export type OpcionesGaleria = {
  // Número de la primera foto («Foto 1»). Sin número si es 0.
  desde?: number;
  // Fuerza el alto de fila (si no, se elige según cuántas fotos hay).
  alto?: number;
};

const HUECO = 10;
const RADIO = 5;
const K = 0.5523;

type Lista = { item: ItemPdf; ancho: number; alto: number };
type Preparada = { item: ItemPdf; img: PDFImage; prop: number; qr: PDFImage | null };

async function medir(item: ItemPdf): Promise<Lista | null> {
  try {
    const m = await sharp(item.bytes).metadata();
    if (!m.width || !m.height) return null;
    // La orientación EXIF 5–8 es una foto girada: ancho y alto van al revés.
    const girada = (m.orientation || 1) >= 5;
    return { item, ancho: girada ? m.height : m.width, alto: girada ? m.width : m.height };
  } catch {
    return null;
  }
}

// Recorta la foto a `prop` buscando la zona con más detalle y la deja en JPEG
// ligero. Si sharp falla con una imagen rara se usa tal cual.
async function preparar(pdfDoc: PDFDocument, l: Lista, prop: number, lado: number): Promise<Preparada | null> {
  let img: PDFImage | null = null;
  try {
    const w = prop >= 1 ? lado : Math.round(lado * prop);
    const h = prop >= 1 ? Math.round(lado / prop) : lado;
    const buf = await sharp(l.item.bytes)
      .rotate()
      .resize({ width: w, height: h, fit: 'cover', position: sharp.strategy.attention })
      .jpeg({ quality: 80 })
      .toBuffer();
    img = await pdfDoc.embedJpg(new Uint8Array(buf));
  } catch {
    try {
      img = await pdfDoc.embedJpg(l.item.bytes);
    } catch {
      try {
        img = await pdfDoc.embedPng(l.item.bytes);
      } catch {
        return null;
      }
    }
    prop = img.width / img.height;
  }
  let qr: PDFImage | null = null;
  if (l.item.video?.url) {
    try {
      qr = await pdfDoc.embedPng(await QRCode.toDataURL(l.item.video.url, { margin: 0, width: 300, errorCorrectionLevel: 'L' }));
    } catch {
      qr = null;
    }
  }
  return { item: l.item, img, prop, qr };
}

// Rectángulo redondeado como operadores de trazo (coordenadas del PDF).
function trazoRedondo(x: number, y: number, w: number, h: number, r: number) {
  const c = r * K;
  return [
    moveTo(x + r, y),
    lineTo(x + w - r, y),
    appendBezierCurve(x + w - r + c, y, x + w, y + r - c, x + w, y + r),
    lineTo(x + w, y + h - r),
    appendBezierCurve(x + w, y + h - r + c, x + w - r + c, y + h, x + w - r, y + h),
    lineTo(x + r, y + h),
    appendBezierCurve(x + r - c, y + h, x, y + h - r + c, x, y + h - r),
    lineTo(x, y + r),
    appendBezierCurve(x, y + r - c, x + r - c, y, x + r, y),
    closePath(),
  ];
}

// El mismo rectángulo como path SVG, para rellenarlo con drawSvgPath
// (anclado en su esquina superior izquierda).
function svgRedondo(w: number, h: number, r: number): string {
  return `M${r},0 h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(w - 2 * r)} a${r},${r} 0 0 1 ${-r},${-r} v${-(h - 2 * r)} a${r},${r} 0 0 1 ${r},${-r} Z`;
}

function partir(texto: string, fuente: BrandFonts['font'], tam: number, ancho: number, maxLineas: number): string[] {
  const lineas: string[] = [];
  let linea = '';
  for (const p of (texto || '').split(/\s+/).filter(Boolean)) {
    const prueba = linea ? `${linea} ${p}` : p;
    if (fuente.widthOfTextAtSize(prueba, tam) > ancho && linea) {
      lineas.push(linea);
      linea = p;
    } else linea = prueba;
  }
  if (linea) lineas.push(linea);
  if (lineas.length <= maxLineas) return lineas;
  const corte = lineas.slice(0, maxLineas);
  let ultima = corte[maxLineas - 1];
  while (ultima.length > 1 && fuente.widthOfTextAtSize(`${ultima}…`, tam) > ancho) ultima = ultima.slice(0, -1);
  corte[maxLineas - 1] = `${ultima}…`;
  return corte;
}

function duracion(seg: number | null | undefined): string {
  const s = Math.max(0, Math.round(seg || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

type Pie = { rotulo: string; fecha: string; fechaAparte: boolean; lineas: string[]; nota: string; alto: number };

export async function dibujarEvidencias(l: LienzoPdf, items: ItemPdf[], opciones: OpcionesGaleria = {}): Promise<{ dibujadas: number; siguiente: number }> {
  const { font, bold } = l.fuentes;
  let numero = opciones.desde ?? 1;
  const numerar = numero > 0;

  const medidas = (await Promise.all(items.filter((i) => !i.interna).map(medir))).filter((m): m is Lista => !!m);
  const deItem = new Map(medidas.map((m) => [m.item, m]));
  const grupos = agruparParaPdf(medidas.map((m) => m.item));
  const total = medidas.length;
  if (total === 0) return { dibujadas: 0, siguiente: numero };

  const objetivo = opciones.alto ?? altoObjetivo(total);
  const lado = total <= 2 ? 1500 : total <= 8 ? 1150 : 900;
  const conTitulos = grupos.some((g) => g.area);
  let dibujadas = 0;

  function pieDe(p: Preparada, ancho: number): Pie {
    const rotulo = numerar ? `${p.item.video ? 'VIDEO' : 'FOTO'} ${numero++}` : p.item.video ? 'VIDEO' : '';
    const fecha = fechaHoraFoto(p.item.ts, MARCA.zonaHoraria);
    const anchoRotulo = rotulo ? bold.widthOfTextAtSize(rotulo, 6.5) : 0;
    const fechaAparte = !!fecha && !!rotulo && anchoRotulo + 8 + font.widthOfTextAtSize(fecha, 6.5) > ancho;
    const lineas = p.item.caption?.trim() ? partir(p.item.caption.trim(), font, 7.5, ancho, 5) : [];
    const nota = p.qr ? 'Escanea o toca para ver el video' : p.item.video ? 'Video disponible en la plataforma' : '';
    const cabecera = rotulo || fecha ? 9 + (fechaAparte ? 8 : 0) : 0;
    const alto = 4 + cabecera + lineas.length * 9.5 + (nota ? 8.5 : 0) + 6;
    return { rotulo, fecha, fechaAparte, lineas, nota, alto };
  }

  function celda(p: Preparada, x: number, yTop: number, w: number, h: number, pie: Pie) {
    const pg = l.pagina();
    const yBase = yTop - h;
    pg.pushOperators(pushGraphicsState(), ...trazoRedondo(x, yBase, w, h, RADIO), clip(), endPath());
    pg.drawImage(p.img, { x, y: yBase, width: w, height: h });
    pg.pushOperators(popGraphicsState());

    const etapa = textoEtapa(p.item.etapa).toUpperCase();
    if (etapa) {
      const tw = bold.widthOfTextAtSize(etapa, 6.5);
      const color = p.item.etapa === 'despues' ? VERDE : p.item.etapa === 'antes' ? NAVY : GRAY_TEXT;
      pg.drawSvgPath(svgRedondo(tw + 12, 13, 6.5), { x: x + 6, y: yTop - 6, color, opacity: 0.92 });
      pg.drawText(etapa, { x: x + 12, y: yTop - 15.2, size: 6.5, font: bold, color: WHITE });
    }

    if (p.item.video) {
      const r = Math.max(9, Math.min(20, h * 0.13));
      const cx = x + w / 2;
      const cy = yBase + h / 2;
      pg.drawCircle({ x: cx, y: cy, size: r, color: WHITE, opacity: 0.9 });
      pg.drawSvgPath(`M${-r * 0.3},${-r * 0.48} L${r * 0.52},0 L${-r * 0.3},${r * 0.48} Z`, { x: cx, y: cy, color: NAVY });
      const txt = `VIDEO ${duracion(p.item.video.dur)}`;
      const tw = bold.widthOfTextAtSize(txt, 6.5);
      pg.drawSvgPath(svgRedondo(tw + 12, 13, 6.5), { x: x + 6, y: yBase + 19, color: NAVY, opacity: 0.85 });
      pg.drawText(txt, { x: x + 12, y: yBase + 9.8, size: 6.5, font: bold, color: WHITE });
      if (p.qr) {
        const q = Math.min(44, w * 0.34, h * 0.42);
        pg.drawSvgPath(svgRedondo(q + 6, q + 6, 3), { x: x + w - q - 11, y: yBase + q + 11, color: WHITE });
        pg.drawImage(p.qr, { x: x + w - q - 8, y: yBase + 8, width: q, height: q });
      }
      if (p.item.video.url) {
        const ctx = l.pdfDoc.context;
        pg.node.addAnnot(ctx.register(ctx.obj({
          Type: 'Annot', Subtype: 'Link', Rect: [x, yBase, x + w, yTop], Border: [0, 0, 0],
          A: { Type: 'Action', S: 'URI', URI: PDFString.of(p.item.video.url) },
        })));
      }
    }

    let cy = yBase - 4;
    if (pie.rotulo || pie.fecha) {
      cy -= 7;
      let cx = x;
      if (pie.rotulo) {
        pg.drawText(pie.rotulo, { x: cx, y: cy, size: 6.5, font: bold, color: TEAL_DARK });
        cx += bold.widthOfTextAtSize(pie.rotulo, 6.5) + 8;
      }
      if (pie.fecha) {
        if (pie.fechaAparte) {
          cy -= 8;
          cx = x;
        }
        pg.drawText(pie.fecha, { x: cx, y: cy, size: 6.5, font, color: GRAY_TEXT });
      }
      cy -= 2;
    }
    for (const linea of pie.lineas) {
      cy -= 9.5;
      pg.drawText(linea, { x, y: cy, size: 7.5, font, color: NAVY });
    }
    if (pie.nota) {
      cy -= 8.5;
      pg.drawText(pie.nota, { x, y: cy, size: 6, font, color: GRAY_TEXT });
    }
  }

  for (const g of grupos) {
    let tituloPendiente = conTitulos ? (g.area || 'General').toUpperCase() : '';
    const n = g.pares.length * 2 + g.sueltas.length;

    // El título de área se dibuja junto con su primera fila, para que nunca
    // quede solo al pie de una hoja.
    const abrir = (altoFila: number) => {
      const extra = tituloPendiente ? 20 : 0;
      l.espacio(Math.min(l.altoHoja, altoFila + extra));
      if (!tituloPendiente) return;
      const pg = l.pagina();
      const y = l.y() - 9;
      pg.drawRectangle({ x: l.x, y: y - 2, width: 2.5, height: 10, color: LINEA_MARCA });
      pg.drawText(tituloPendiente, { x: l.x + 8, y, size: 8.5, font: bold, color: NAVY, maxWidth: l.ancho - 80 });
      const cuenta = `${n} ${n === 1 ? 'evidencia' : 'evidencias'}`;
      pg.drawText(cuenta, { x: l.x + l.ancho - font.widthOfTextAtSize(cuenta, 7), y, size: 7, font, color: GRAY_TEXT });
      l.fijarY(y - 11);
      tituloPendiente = '';
    };

    // Antes / después, lado a lado y del mismo tamaño.
    for (const [a, d] of g.pares) {
      const ma = deItem.get(a)!;
      const md = deItem.get(d)!;
      const pa = proporcionEstandar(ma.ancho, ma.alto);
      const pd = proporcionEstandar(md.ancho, md.alto);
      const prop = pa === pd ? pa : pa < 1 && pd < 1 ? 3 / 4 : 4 / 3;
      const [A, D] = await Promise.all([preparar(l.pdfDoc, ma, prop, lado), preparar(l.pdfDoc, md, prop, lado)]);
      const col = (l.ancho - HUECO) / 2;
      const h = Math.min(col / prop, 240);
      const w = h * prop;
      const par = [A, D].filter((p): p is Preparada => !!p);
      const pies = par.map((p) => pieDe(p, w));
      abrir(h + Math.max(0, ...pies.map((p) => p.alto)));
      const yTop = l.y();
      par.forEach((p, j) => {
        // Cada foto pegada al centro de la hoja, para que el par se lea junto.
        const x = j === 0 ? l.x + col - w : l.x + col + HUECO;
        celda(p, par.length === 2 ? x : l.x, yTop, w, h, pies[j]);
        dibujadas++;
      });
      l.fijarY(yTop - h - Math.max(0, ...pies.map((p) => p.alto)));
    }

    const sueltas = g.sueltas.map((s) => deItem.get(s)!);
    const props = sueltas.map((m) => proporcionEstandar(m.ancho, m.alto));
    for (const fila of filasJustificadas(props, l.ancho, HUECO, objetivo)) {
      const listas = (await Promise.all(fila.indices.map((i) => preparar(l.pdfDoc, sueltas[i], props[i], lado)))).filter((p): p is Preparada => !!p);
      if (listas.length === 0) continue;
      // Si alguna no se pudo incrustar, la fila se recalcula con las que sí.
      const suma = listas.reduce((s, p) => s + p.prop, 0);
      const justo = (l.ancho - HUECO * (listas.length - 1)) / suma;
      let h = fila.completa && listas.length === fila.indices.length ? justo : Math.min(fila.alto, justo);
      h = Math.min(h, l.altoHoja - 70);
      const pies = listas.map((p) => pieDe(p, h * p.prop));
      const altoPie = Math.max(0, ...pies.map((p) => p.alto));
      abrir(h + altoPie);
      const yTop = l.y();
      const anchoFila = listas.reduce((s, p) => s + h * p.prop, 0) + HUECO * (listas.length - 1);
      // Una sola foto en todo el documento va centrada; el resto, a la izquierda.
      let x = total === 1 ? l.x + (l.ancho - anchoFila) / 2 : l.x;
      listas.forEach((p, j) => {
        celda(p, x, yTop, h * p.prop, h, pies[j]);
        x += h * p.prop + HUECO;
        dibujadas++;
      });
      l.fijarY(yTop - h - altoPie);
    }
    if (conTitulos) l.fijarY(l.y() - 4);
  }

  return { dibujadas, siguiente: numero };
}
