import { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import {
  NAVY, GRAY_LINE, GRAY_TEXT, ROJO,
  MARGIN, PAGE_W, PAGE_H,
  embedBrandFonts, drawBadge, drawIconStrip, drawWatermark,
} from './pdfBranding';
import { Cotizacion, LineaCotizacion, agruparPorSistema } from './cotizaciones';

// Mismo formato que las cotizaciones que ya se le mandan a los clientes
// (ver ~/Documents/Formatos_ClaveI, ejemplo Torre Classiqa): encabezado de
// marca, datos del cliente, una tabla por sistema con su propio subtotal,
// SUBTOTAL/IVA/TOTAL, y una segunda página con condiciones comerciales y
// firma.
const DIRECCION_EMPRESA = 'Tejedores 578 Col. La Paz Guadalajara Jalisco 44860 Tel: 3315781794';
const TELS_CONTACTO = 'Tels: 3315672378, 3315672377';
const SITIO_WEB = 'www.clave-i.mx';

function money(n: number, moneda: 'MXN' | 'USD' = 'MXN'): string {
  const prefijo = moneda === 'USD' ? 'USD $ ' : '$ ';
  return prefijo + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cantidadTexto(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function fechaLarga(fechaISO: string): string {
  const [y, m, d] = (fechaISO || '').split('-').map(Number);
  if (!y) return '';
  const fecha = new Date(y, (m || 1) - 1, d || 1);
  return `Guadalajara, Jal. a ${fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}`;
}

export async function generateCotizacionPdf(cot: Cotizacion, lineas: LineaCotizacion[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const { font, bold, display } = await embedBrandFonts(pdfDoc);
  const contentW = PAGE_W - MARGIN * 2;

  let page!: PDFPage;
  let y = 0;

  function wrapText(text: string, fnt: PDFFont, size: number, maxWidth: number): string[] {
    const words = (text || '').split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (fnt.widthOfTextAtSize(test, size) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  function centrado(pg: PDFPage, texto: string, x: number, w: number, y0: number, size: number, fnt: PDFFont) {
    const tw = fnt.widthOfTextAtSize(texto, size);
    pg.drawText(texto, { x: x + w / 2 - tw / 2, y: y0, size, font: fnt, color: NAVY });
  }

  function drawFooter(pg: PDFPage) {
    const w = font.widthOfTextAtSize(DIRECCION_EMPRESA, 8);
    pg.drawText(DIRECCION_EMPRESA, { x: (PAGE_W - w) / 2, y: 20, size: 8, font, color: GRAY_TEXT });
  }

  function drawHeaderBar(pg: PDFPage, topY: number): number {
    const badgeSize = 40;
    drawBadge(pg, display, MARGIN, topY, badgeSize);
    const wordX = MARGIN + badgeSize + 12;
    const wordSize = 15;
    pg.drawText('CLAVE INTELIGENTE', { x: wordX, y: topY - 15, size: wordSize, font: display, color: NAVY });
    const wordmarkW = display.widthOfTextAtSize('CLAVE INTELIGENTE', wordSize);
    const lineY = topY - 24;
    pg.drawLine({ start: { x: wordX, y: lineY }, end: { x: wordX + wordmarkW, y: lineY }, thickness: 1, color: ROJO });
    drawIconStrip(pg, wordX, lineY - 8, 14, GRAY_TEXT);
    return topY - badgeSize - 20;
  }

  function drawClienteBlock(pg: PDFPage, topY: number): number {
    const fechaTxt = fechaLarga(cot.fecha);
    const fechaSize = 9.5;
    const fechaW = font.widthOfTextAtSize(fechaTxt, fechaSize);
    pg.drawText(fechaTxt, { x: PAGE_W - MARGIN - fechaW, y: topY, size: fechaSize, font, color: NAVY });

    let ly = topY;
    const filas: [string, string | null][] = [
      ["At'n", cot.atencion],
      ['Empresa', cot.empresa],
      ['Tel', cot.telefono],
      ['Correo', cot.correo],
    ];
    for (const [label, valor] of filas) {
      if (!valor) continue;
      pg.drawText(`${label}: ${valor}`, { x: MARGIN, y: ly, size: 9.5, font, color: NAVY, maxWidth: contentW - 200 });
      ly -= 14;
    }
    return ly - 10;
  }

  function startPage() {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
    drawWatermark(page, display);
    drawFooter(page);
    y = drawHeaderBar(page, y);
    y = drawClienteBlock(page, y);
  }

  startPage();

  // ================= Columnas de la tabla =================
  const colPartidaW = 30;
  const colUnidW = 34;
  const colCantW = 34;
  const colPUnitW = 72;
  const colImporteW = 80;
  const colDescW = contentW - colPartidaW - colUnidW - colCantW - colPUnitW - colImporteW;
  const xPartida = MARGIN;
  const xDesc = xPartida + colPartidaW;
  const xUnid = xDesc + colDescW;
  const xCant = xUnid + colUnidW;
  const xPUnit = xCant + colCantW;
  const xImporte = xPUnit + colPUnitW;

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN + 30) startPage();
  }

  function drawTableHeader() {
    ensureSpace(20);
    const rowH = 16;
    page.drawRectangle({ x: MARGIN, y: y - rowH, width: contentW, height: rowH, borderColor: GRAY_LINE, borderWidth: 0.75 });
    const cols: [string, number, number][] = [
      ['Partida', xPartida, colPartidaW],
      ['Descripción', xDesc, colDescW],
      ['Unid', xUnid, colUnidW],
      ['Cant.', xCant, colCantW],
      ['P.Unit', xPUnit, colPUnitW],
      ['Importe', xImporte, colImporteW],
    ];
    for (const [label, x, w] of cols) centrado(page, label, x, w, y - rowH + 5, 8, bold);
    y -= rowH;
  }

  const grupos = agruparPorSistema(lineas);

  for (const grupo of grupos) {
    ensureSpace(38);
    const tituloTxt = `COTIZACIÓN: ${grupo.sistema.toUpperCase()}`;
    page.drawRectangle({ x: MARGIN, y: y - 18, width: contentW, height: 18, borderColor: GRAY_LINE, borderWidth: 0.75 });
    centrado(page, tituloTxt, MARGIN, contentW, y - 13, 9.5, bold);
    y -= 18;

    drawTableHeader();

    let importeGrupo = 0;
    grupo.lineas.forEach((l, i) => {
      importeGrupo += l.importe;
      const descLines = wrapText(l.descripcion, font, 8, colDescW - 8);
      const rowH = Math.max(18, descLines.length * 10 + 8);
      ensureSpace(rowH);

      page.drawRectangle({ x: MARGIN, y: y - rowH, width: contentW, height: rowH, borderColor: GRAY_LINE, borderWidth: 0.75 });
      [xDesc, xUnid, xCant, xPUnit, xImporte].forEach((x) => {
        page.drawLine({ start: { x, y }, end: { x, y: y - rowH }, thickness: 0.5, color: GRAY_LINE });
      });

      const centroVertical = y - rowH / 2 - 3;
      const numTxt = String(i + 1).padStart(2, '0');
      centrado(page, numTxt, xPartida, colPartidaW, centroVertical, 8, font);
      descLines.forEach((dl, li) => {
        page.drawText(dl, { x: xDesc + 4, y: y - 11 - li * 10, size: 8, font, color: NAVY });
      });
      centrado(page, l.unidad, xUnid, colUnidW, centroVertical, 8, font);
      centrado(page, cantidadTexto(l.cantidad), xCant, colCantW, centroVertical, 8, font);
      centrado(page, money(l.precio_unitario, cot.moneda), xPUnit, colPUnitW, centroVertical, 8, font);
      centrado(page, money(l.importe, cot.moneda), xImporte, colImporteW, centroVertical, 8, font);

      y -= rowH;
    });

    ensureSpace(16);
    page.drawRectangle({ x: xPUnit, y: y - 16, width: colPUnitW, height: 16, borderColor: GRAY_LINE, borderWidth: 0.75 });
    page.drawRectangle({ x: xImporte, y: y - 16, width: colImporteW, height: 16, borderColor: GRAY_LINE, borderWidth: 0.75 });
    page.drawText('Importe', { x: xPUnit + 6, y: y - 11, size: 8, font: bold, color: NAVY });
    centrado(page, money(importeGrupo, cot.moneda), xImporte, colImporteW, y - 11, 8, bold);
    y -= 16 + 14;
  }

  // ================= Totales =================
  ensureSpace(60);
  const totales: [string, number][] = [
    ['SUBTOTAL', cot.subtotal],
    [`IVA (${cot.iva_pct}%)`, cot.iva],
    ['TOTAL', cot.total],
  ];
  for (const [label, val] of totales) {
    page.drawText(label, { x: xPUnit, y, size: 9.5, font: bold, color: NAVY });
    const vt = money(val, cot.moneda);
    page.drawText(vt, { x: xImporte + colImporteW - font.widthOfTextAtSize(vt, 9.5), y, size: 9.5, font: bold, color: NAVY });
    y -= 16;
  }

  if (cot.moneda === 'USD' && cot.tipo_cambio > 0) {
    const label = `Aprox. en MXN (T.C. $${cot.tipo_cambio.toFixed(2)})`;
    page.drawText(label, { x: MARGIN, y, size: 8.5, font, color: GRAY_TEXT });
    const vt = money(cot.total * cot.tipo_cambio, 'MXN');
    page.drawText(vt, { x: xImporte + colImporteW - font.widthOfTextAtSize(vt, 8.5), y, size: 8.5, font, color: GRAY_TEXT });
    y -= 16;
  }

  // ================= Página de condiciones comerciales y firma =================
  startPage();

  y -= 8;
  page.drawText('Condiciones comerciales de venta:', { x: MARGIN, y, size: 10, font: bold, color: NAVY });
  y -= 16;

  const condiciones = [
    cot.moneda === 'USD'
      ? `Los precios se expresan en Dólares Americanos (USD), más IVA. Tipo de cambio de referencia: $${cot.tipo_cambio.toFixed(2)} MXN por dólar.`
      : 'Los precios se expresan en Moneda Nacional, más IVA',
    `Forma de Pago: ${cot.forma_pago}`,
    'Esta cotización ampara unicamente lo descrito anteriormente.',
    `Tiempo de Entrega: ${cot.tiempo_entrega}`,
    `Garantía: ${cot.garantia}`,
    `Vigencia de cotización: ${cot.vigencia_dias} días naturales una vez presentada al cliente.`,
  ];
  if (cot.notas) condiciones.push(cot.notas);

  for (const linea of condiciones) {
    for (const wl of wrapText(linea, font, 9.5, contentW)) {
      ensureSpace(15);
      page.drawText(wl, { x: MARGIN, y, size: 9.5, font, color: NAVY });
      y -= 14;
    }
  }

  y -= 60;
  const firmaLineas: [string, boolean][] = [
    ['Atentamente:', true],
    [cot.firmante_nombre || '', false],
    [cot.firmante_correo || '', false],
    [TELS_CONTACTO, false],
    [SITIO_WEB, false],
  ];
  for (const [texto, destacado] of firmaLineas) {
    if (!texto) continue;
    ensureSpace(15);
    centrado(page, texto, MARGIN, contentW, y, destacado ? 9.5 : 9, destacado ? bold : font);
    y -= 14;
  }

  return pdfDoc.save();
}
