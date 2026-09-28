import { PDFDocument, PDFFont, PDFPage, rgb, degrees } from 'pdf-lib';
import {
  NAVY, TEAL_DARK, GRAY_LINE, GRAY_TEXT, WHITE, ROJO,
  MARGIN, PAGE_W, PAGE_H,
  embedBrandFonts, drawBadge,
} from './pdfBranding';
import { EMISOR, MARCA } from './marca';
import {
  Factura, FORMAS_PAGO, METODOS_PAGO, REGIMENES, USOS_CFDI, calcularTotalesFactura, nombreOpcion,
} from './facturas';
import { importeConLetra } from './numeroALetras';

// Prefactura con el mismo acomodo del CFDI que timbra el PAC (emisor,
// receptor, datos de pago, conceptos con su IVA, totales e importe con
// letra), pero marcada como SIN VALIDEZ FISCAL: no lleva UUID, sellos ni
// certificado. Los reportes y la cotización ligados NO salen aquí.

function money(n: number): string {
  return '$ ' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cantidadTexto(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export async function generateFacturaPdf(f: Factura): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const { font, bold, display } = await embedBrandFonts(pdfDoc);
  const contentW = PAGE_W - MARGIN * 2;
  let page!: PDFPage;
  let y = 0;
  let hoja = 0;

  function wrap(text: string, fnt: PDFFont, size: number, maxWidth: number): string[] {
    const words = (text || '').split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (fnt.widthOfTextAtSize(test, size) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  function derecha(pg: PDFPage, texto: string, xDer: number, y0: number, size: number, fnt: PDFFont, color = NAVY) {
    pg.drawText(texto, { x: xDer - fnt.widthOfTextAtSize(texto, size), y: y0, size, font: fnt, color });
  }

  function marcaAgua(pg: PDFPage) {
    const t = 'PREFACTURA · SIN VALIDEZ FISCAL';
    const size = 38;
    const w = bold.widthOfTextAtSize(t, size);
    pg.drawText(t, {
      x: PAGE_W / 2 - (w / 2) * Math.cos(Math.PI / 6),
      y: PAGE_H / 2 - (w / 2) * Math.sin(Math.PI / 6),
      size,
      font: bold,
      color: rgb(0.88, 0.2, 0.2),
      opacity: 0.08,
      rotate: degrees(30),
    });
  }

  function pie(pg: PDFPage) {
    const t = 'Este documento es una PREFACTURA sin validez fiscal. El comprobante fiscal digital (CFDI) se emite por separado.';
    const w = font.widthOfTextAtSize(t, 7.5);
    pg.drawText(t, { x: (PAGE_W - w) / 2, y: 30, size: 7.5, font: bold, color: ROJO });
    pg.drawText(`Página ${hoja}`, { x: MARGIN, y: 16, size: 7, font, color: GRAY_TEXT });
  }

  function nuevaHoja() {
    if (page) pie(page);
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    hoja++;
    marcaAgua(page);
    y = PAGE_H - MARGIN;
  }

  // ---------- Encabezado ----------
  nuevaHoja();
  const top = y;
  drawBadge(page, display, MARGIN, top, 58);

  // Emisor al centro
  const cx = MARGIN + 190;
  const emisor = [
    [EMISOR.razonSocial, bold, 11],
    [EMISOR.rfc, font, 8],
    [EMISOR.regimen, font, 8],
    [EMISOR.telefono, font, 8],
    [EMISOR.correo, font, 8],
    [EMISOR.web, font, 8],
  ] as const;
  let ey = top - 10;
  emisor.forEach(([t, fnt, size]) => {
    const w = fnt.widthOfTextAtSize(t, size);
    page.drawText(t, { x: cx - w / 2, y: ey, size, font: fnt, color: NAVY });
    ey -= size === 11 ? 13 : 10.5;
  });

  // Datos del comprobante a la derecha
  const xr = PAGE_W - MARGIN;
  derecha(page, 'PREFACTURA', xr, top - 12, 15, display);
  const datosComp: [string, string][] = [
    ['Folio:', f.folio],
    ['Versión CFDI:', '4.0'],
    ['Tipo de comprobante:', '(I) Ingreso'],
    ['Lugar de expedición:', EMISOR.lugarExpedicion],
  ];
  let dy = top - 26;
  datosComp.forEach(([k, v]) => {
    const vw = font.widthOfTextAtSize(v, 8);
    page.drawText(v, { x: xr - vw, y: dy, size: 8, font, color: NAVY });
    derecha(page, k, xr - vw - 4, dy, 8, bold);
    dy -= 11;
  });
  const sello = 'SIN VALIDEZ FISCAL';
  const sw = bold.widthOfTextAtSize(sello, 7.5) + 12;
  page.drawRectangle({ x: xr - sw, y: dy - 6, width: sw, height: 13, color: ROJO });
  page.drawText(sello, { x: xr - sw + 6, y: dy - 2, size: 7.5, font: bold, color: WHITE });

  y = top - 92;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: xr, y }, thickness: 1.2, color: NAVY });
  y -= 16;

  // ---------- Receptor / pago / total ----------
  const col1 = MARGIN;
  const col2 = MARGIN + contentW * 0.4;
  page.drawText('Receptor', { x: col1, y, size: 9, font: bold, color: TEAL_DARK });
  const receptor: string[] = [
    f.receptor_nombre,
    f.receptor_rfc || 'RFC: —',
    `Domicilio fiscal: ${f.receptor_cp || '—'}`,
    `Régimen fiscal: ${nombreOpcion(REGIMENES, f.receptor_regimen) || '—'}`,
    `Uso CFDI: ${nombreOpcion(USOS_CFDI, f.uso_cfdi) || '—'}`,
  ];
  let ry = y - 13;
  receptor.forEach((t, i) => {
    wrap(t, i === 0 ? bold : font, i === 0 ? 9 : 8, contentW * 0.38).forEach((l) => {
      page.drawText(l, { x: col1, y: ry, size: i === 0 ? 9 : 8, font: i === 0 ? bold : font, color: NAVY });
      ry -= 11;
    });
  });

  const pago: [string, string][] = [
    ['Fecha de emisión:', f.fecha],
    ['Moneda:', f.moneda === 'USD' ? '(USD) Dólar americano' : '(MXN) Peso Mexicano'],
    ['Tipo de cambio:', f.moneda === 'USD' ? String(f.tipo_cambio) : '1'],
    ['Forma de pago:', nombreOpcion(FORMAS_PAGO, f.forma_pago) || '—'],
    ['Método de pago:', nombreOpcion(METODOS_PAGO, f.metodo_pago) || '—'],
    ['Exportación:', '(01) No aplica'],
    ['Condiciones de pago:', f.condiciones_pago || '—'],
  ];
  let py = y - 13;
  pago.forEach(([k, v]) => {
    page.drawText(k, { x: col2, y: py, size: 8, font: bold, color: NAVY });
    page.drawText(v, { x: col2 + bold.widthOfTextAtSize(k, 8) + 4, y: py, size: 8, font, color: NAVY, maxWidth: contentW * 0.36 });
    py -= 11;
  });

  derecha(page, 'Total:', xr, y, 9, bold, TEAL_DARK);
  derecha(page, `${f.moneda === 'USD' ? 'USD ' : ''}${money(f.total)}`, xr, y - 17, 14, display);

  y = Math.min(ry, py) - 10;

  // ---------- Conceptos ----------
  const cDesc = MARGIN;
  const xCant = MARGIN + contentW * 0.62;
  const xVU = MARGIN + contentW * 0.8;
  function encabezadoConceptos() {
    page.drawRectangle({ x: MARGIN, y: y - 15, width: contentW, height: 17, color: NAVY });
    page.drawText('Descripción', { x: cDesc + 5, y: y - 10, size: 8, font: bold, color: WHITE });
    derecha(page, 'Cantidad', xCant, y - 10, 8, bold, WHITE);
    derecha(page, 'Valor unitario', xVU, y - 10, 8, bold, WHITE);
    derecha(page, 'Importe', xr - 5, y - 10, 8, bold, WHITE);
    y -= 26;
  }
  encabezadoConceptos();

  for (const c of f.conceptos || []) {
    const descL = wrap(c.descripcion, font, 8.5, contentW * 0.55);
    const claves = `Clave de producto o servicio: ${c.clave_prod_serv || '—'}   Clave de unidad: ${c.unidad_clave}   Unidad: ${c.unidad_nombre}   ObjetoImp: ${c.objeto_imp === '02' ? '(02) Sí objeto de impuesto' : '(01) No objeto de impuesto'}`;
    const clavesL = wrap(claves, font, 7, contentW - 10);
    const conIva = c.objeto_imp === '02' && f.iva_pct > 0;
    const alto = descL.length * 11 + clavesL.length * 9 + (conIva ? 30 : 0) + 12;
    if (y - alto < 70) {
      nuevaHoja();
      encabezadoConceptos();
    }
    let cy = y;
    descL.forEach((l, i) => {
      page.drawText(l, { x: cDesc + 5, y: cy, size: 8.5, font, color: NAVY });
      if (i === 0) {
        derecha(page, cantidadTexto(c.cantidad), xCant, cy, 8.5, font);
        derecha(page, money(c.valor_unitario), xVU, cy, 8.5, font);
        derecha(page, money(c.importe), xr - 5, cy, 8.5, font);
      }
      cy -= 11;
    });
    clavesL.forEach((l) => {
      page.drawText(l, { x: cDesc + 5, y: cy, size: 7, font, color: GRAY_TEXT });
      cy -= 9;
    });
    if (conIva) {
      const xi = MARGIN + contentW * 0.5;
      cy -= 3;
      page.drawText('Impuestos trasladados del concepto', { x: xi, y: cy, size: 7, font: bold, color: TEAL_DARK });
      derecha(page, 'Base', xVU, cy, 7, bold, TEAL_DARK);
      derecha(page, 'Importe', xr - 5, cy, 7, bold, TEAL_DARK);
      cy -= 10;
      const tasa = (f.iva_pct / 100).toFixed(6);
      page.drawText(`(002) IVA - Tasa ${tasa}`, { x: xi, y: cy, size: 7, font, color: NAVY });
      derecha(page, money(c.importe), xVU, cy, 7, font);
      derecha(page, money(Math.round(c.importe * f.iva_pct) / 100), xr - 5, cy, 7, font);
      cy -= 8;
    }
    y = cy - 6;
    page.drawLine({ start: { x: MARGIN, y: y + 3 }, end: { x: xr, y: y + 3 }, thickness: 0.4, color: GRAY_LINE });
    y -= 6;
  }

  // ---------- Totales ----------
  const t = calcularTotalesFactura(f.conceptos || [], f.iva_pct);
  if (y < 170) nuevaHoja();
  y -= 6;
  const xt = MARGIN + contentW * 0.58;
  if (t.iva > 0) {
    page.drawText('Impuestos trasladados del comprobante', { x: xt, y, size: 7.5, font: bold, color: TEAL_DARK });
    y -= 11;
    page.drawText(`(002) IVA - Tasa ${(f.iva_pct / 100).toFixed(6)}`, { x: xt, y, size: 7.5, font, color: NAVY });
    derecha(page, money(t.iva), xr, y, 7.5, font);
    y -= 18;
  }

  const letraY = y;
  page.drawText('Importe con letra:', { x: MARGIN, y: letraY, size: 8, font: bold, color: NAVY });
  wrap(importeConLetra(t.total, f.moneda), font, 8, contentW * 0.5).forEach((l, i) => {
    page.drawText(l, { x: MARGIN, y: letraY - 11 - i * 10, size: 8, font, color: NAVY });
  });

  const filas: [string, string, boolean][] = [
    ['SubTotal', money(t.subtotal), false],
    ['Total impuestos trasladados', money(t.iva), false],
    ['Total', `${f.moneda === 'USD' ? 'USD ' : ''}${money(t.total)}`, true],
  ];
  filas.forEach(([k, v, fuerte]) => {
    page.drawLine({ start: { x: xt, y: y + 9 }, end: { x: xr, y: y + 9 }, thickness: 0.4, color: GRAY_LINE });
    page.drawText(k, { x: xt, y, size: fuerte ? 9.5 : 8, font: bold, color: NAVY });
    derecha(page, v, xr, y, fuerte ? 9.5 : 8, fuerte ? bold : font);
    y -= 15;
  });

  y -= 14;
  const aviso = [
    'Prefactura para revisión y captura. Al timbrarse, el CFDI incluirá el UUID, el sello digital del emisor y del SAT y el',
    `certificado. Dudas: ${EMISOR.correo} · ${MARCA.telefonos}.`,
  ];
  aviso.forEach((l) => {
    page.drawText(l, { x: MARGIN, y, size: 7, font, color: GRAY_TEXT });
    y -= 9;
  });

  pie(page);
  return pdfDoc.save();
}
