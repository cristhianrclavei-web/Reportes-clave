import { PDFDocument, PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import sharp from 'sharp';
import {
  NAVY, GRAY_LINE, GRAY_TEXT, ROJO, LINEA_MARCA,
  MARGIN, PAGE_W, PAGE_H,
  embedBrandFonts, drawBadge, drawWordmark, drawIconStrip, drawWatermark,
} from './pdfBranding';
import { Cotizacion, LineaCotizacion, agruparPorSistema, urlFotoConcepto } from './cotizaciones';
import { MARCA, MARCA_MAYUS } from './marca';

// Mismo formato que las cotizaciones que ya se le mandan a los clientes
// (ver ~/Documents/Formatos_ClaveI, ejemplo Torre Classiqa): encabezado de
// marca, datos del cliente, una tabla por sistema con su propio subtotal,
// SUBTOTAL/IVA/TOTAL, y una segunda página con condiciones comerciales y
// firma.
const DIRECCION_EMPRESA = MARCA.pieCotizacion;
const TELS_CONTACTO = `Tels: ${MARCA.telefonos}`;
const SITIO_WEB = MARCA.sitioWeb;

function money(n: number, moneda: 'MXN' | 'USD' = 'MXN'): string {
  const prefijo = moneda === 'USD' ? 'USD $ ' : '$ ';
  return prefijo + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Sin el prefijo "USD": repetido en cada precio se veía saturado. La divisa
// queda clara una sola vez, en el TOTAL general — solo ahí se usa money().
function moneySinDivisa(n: number): string {
  return '$ ' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cantidadTexto(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function fechaLarga(fechaISO: string): string {
  const [y, m, d] = (fechaISO || '').split('-').map(Number);
  if (!y) return '';
  const fecha = new Date(y, (m || 1) - 1, d || 1);
  return `${MARCA.ciudad} a ${fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}`;
}

// Descarga la foto de un concepto y la deja como JPEG chico (lado mayor
// 400 px) para que el PDF no pese de más. Si falla, el concepto sale sin
// foto en vez de tumbar todo el PDF.
async function descargarFoto(foto: string): Promise<Uint8Array | null> {
  try {
    const respuesta = await fetch(urlFotoConcepto(foto), { signal: AbortSignal.timeout(8000) });
    if (!respuesta.ok) return null;
    const original = Buffer.from(await respuesta.arrayBuffer());
    // Tope de 10 MB: una foto de concepto nunca debería pesar más.
    if (original.length > 10 * 1048576) return null;
    const reducida = await sharp(original)
      .rotate()
      .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 80 })
      .toBuffer();
    return new Uint8Array(reducida);
  } catch (err: any) {
    console.error('[cotizacion-pdf] No se pudo incluir una foto:', foto, err?.message);
    return null;
  }
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

  // Como wrapText, pero respetando los saltos de línea que la persona
  // escribió en la descripción (wrapText los trata como un espacio más y
  // junta todo en un solo párrafo). Un renglón vacío se conserva como
  // separación; los del principio y del final se descartan.
  function wrapConSaltos(text: string, fnt: PDFFont, size: number, maxWidth: number): string[] {
    const parrafos = (text || '').replace(/\r\n?/g, '\n').split('\n');
    while (parrafos.length && !parrafos[0].trim()) parrafos.shift();
    while (parrafos.length && !parrafos[parrafos.length - 1].trim()) parrafos.pop();
    const lines = parrafos.flatMap((p) => (p.trim() ? wrapText(p, fnt, size, maxWidth) : ['']));
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
    const wordmarkW = drawWordmark(pg, display, wordX, topY - 15, wordSize);
    const lineY = topY - 24;
    pg.drawLine({ start: { x: wordX, y: lineY }, end: { x: wordX + wordmarkW, y: lineY }, thickness: 1, color: LINEA_MARCA });
    drawIconStrip(pg, wordX, lineY - 8, 14, GRAY_TEXT);
    // Título y folio a la derecha, como en el reporte de servicio.
    const titulo = 'COTIZACIÓN';
    pg.drawText(titulo, { x: PAGE_W - MARGIN - display.widthOfTextAtSize(titulo, 14), y: topY - 13, size: 14, font: display, color: NAVY });
    if (cot.folio) {
      const fol = `Folio: ${cot.folio}`;
      pg.drawText(fol, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(fol, 8.5), y: topY - 27, size: 8.5, font, color: GRAY_TEXT });
    }
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

  // Título del proyecto: solo en la primera página, centrado entre los datos
  // del cliente y la primera tabla, con una línea corta del color de la marca.
  const tituloProyecto = (cot.titulo_proyecto || '').trim();
  if (tituloProyecto) {
    const tamano = 17;
    const renglones = wrapText(tituloProyecto.toUpperCase(), display, tamano, contentW - 80);
    y -= 6;
    for (const renglon of renglones) {
      centrado(page, renglon, MARGIN, contentW, y - tamano, tamano, display);
      y -= tamano + 5;
    }
    const anchoLinea = 56;
    page.drawLine({
      start: { x: (PAGE_W - anchoLinea) / 2, y: y - 4 },
      end: { x: (PAGE_W + anchoLinea) / 2, y: y - 4 },
      thickness: 1.5, color: LINEA_MARCA,
    });
    y -= 22;
  }

  // ================= Fotos de los conceptos =================
  // Con la casilla activa, cada concepto lleva una columna de foto entre
  // Partida y Descripción. Se descargan todas antes de dibujar.
  const conFotos = Boolean(cot.mostrar_fotos);
  const fotosPdf = new Map<string, PDFImage>();
  if (conFotos) {
    const unicas = [...new Set(lineas.map((l) => l.foto).filter((f): f is string => Boolean(f)))];
    const descargadas = await Promise.all(unicas.map(descargarFoto));
    for (let i = 0; i < unicas.length; i++) {
      const bytes = descargadas[i];
      if (bytes) fotosPdf.set(unicas[i], await pdfDoc.embedJpg(bytes));
    }
  }

  // ================= Columnas de la tabla =================
  const colPartidaW = 30;
  const colFotoW = conFotos ? 84 : 0;
  const altoFilaConFoto = 66;
  const colUnidW = 34;
  const colCantW = 34;
  const colPUnitW = 72;
  const colImporteW = 80;
  const colDescW = contentW - colPartidaW - colFotoW - colUnidW - colCantW - colPUnitW - colImporteW;
  const xPartida = MARGIN;
  const xFoto = xPartida + colPartidaW;
  const xDesc = xFoto + colFotoW;
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
      // Con fotos, «Descripción» abarca también la columna de la foto.
      ['Descripción', xFoto, colFotoW + colDescW],
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

    // En modo "kit" la sección se vende como una sola pieza: Unidad,
    // Cantidad, Precio Unitario e Importe no se desglosan por partida — esas
    // cuatro columnas se combinan en una sola celda por sección (sin líneas
    // divisorias entre filas), mostrando "Kit" / "1" / el total / el total.
    // Solo Partida y Descripción siguen mostrándose por fila.
    //
    // Un rectángulo de PDF no puede cruzar de una página a otra, así que si
    // la sección se parte a media tabla, la celda combinada no puede ser
    // una sola: hay que dibujar un segmento por cada página que toque. Sin
    // esto, las filas que quedan en la página vieja no reciben nada en esas
    // columnas — se ven en blanco.
    const esKit = cot.presentacion_precios === 'kit';
    const anchoBloqueIzq = xUnid - MARGIN;
    const segmentosKit: { pagina: PDFPage; top: number; bottom: number }[] = esKit ? [{ pagina: page, top: y, bottom: y }] : [];

    let importeGrupo = 0;
    grupo.lineas.forEach((l, i) => {
      importeGrupo += l.importe;
      const descLines = wrapConSaltos(l.descripcion, font, 8, colDescW - 8);
      const fotoPdf = l.foto ? fotosPdf.get(l.foto) : undefined;
      const altoTexto = Math.max(18, descLines.length * 10 + 8);
      const rowH = fotoPdf ? Math.max(altoTexto, altoFilaConFoto) : altoTexto;
      const paginaAntesDeLaFila = page;
      ensureSpace(rowH);
      if (esKit && page !== paginaAntesDeLaFila) {
        segmentosKit.push({ pagina: page, top: y, bottom: y });
      }

      if (esKit) {
        page.drawRectangle({ x: MARGIN, y: y - rowH, width: anchoBloqueIzq, height: rowH, borderColor: GRAY_LINE, borderWidth: 0.75 });
        page.drawLine({ start: { x: xDesc, y }, end: { x: xDesc, y: y - rowH }, thickness: 0.5, color: GRAY_LINE });
        if (conFotos) page.drawLine({ start: { x: xFoto, y }, end: { x: xFoto, y: y - rowH }, thickness: 0.5, color: GRAY_LINE });
      } else {
        page.drawRectangle({ x: MARGIN, y: y - rowH, width: contentW, height: rowH, borderColor: GRAY_LINE, borderWidth: 0.75 });
        const divisiones = conFotos ? [xFoto, xDesc, xUnid, xCant, xPUnit, xImporte] : [xDesc, xUnid, xCant, xPUnit, xImporte];
        divisiones.forEach((x) => {
          page.drawLine({ start: { x, y }, end: { x, y: y - rowH }, thickness: 0.5, color: GRAY_LINE });
        });
      }

      const centroVertical = y - rowH / 2 - 3;
      const numTxt = String(i + 1).padStart(2, '0');
      centrado(page, numTxt, xPartida, colPartidaW, centroVertical, 8, font);
      if (fotoPdf) {
        // La foto se ajusta dentro de la celda sin deformarse, centrada.
        const margenFoto = 4;
        const escala = Math.min((colFotoW - margenFoto * 2) / fotoPdf.width, (rowH - margenFoto * 2) / fotoPdf.height);
        const anchoFoto = fotoPdf.width * escala;
        const altoFoto = fotoPdf.height * escala;
        page.drawImage(fotoPdf, {
          x: xFoto + (colFotoW - anchoFoto) / 2,
          y: y - rowH + (rowH - altoFoto) / 2,
          width: anchoFoto,
          height: altoFoto,
        });
      }
      // En filas altas por la foto, el texto se centra en la altura de la fila.
      const desfaseTexto = (rowH - altoTexto) / 2;
      descLines.forEach((dl, li) => {
        page.drawText(dl, { x: xDesc + 4, y: y - 11 - desfaseTexto - li * 10, size: 8, font, color: NAVY });
      });
      if (!esKit) {
        centrado(page, l.unidad, xUnid, colUnidW, centroVertical, 8, font);
        centrado(page, cantidadTexto(l.cantidad), xCant, colCantW, centroVertical, 8, font);
        centrado(page, moneySinDivisa(l.precio_unitario), xPUnit, colPUnitW, centroVertical, 8, font);
        centrado(page, moneySinDivisa(l.importe), xImporte, colImporteW, centroVertical, 8, font);
      }

      y -= rowH;
      if (esKit) segmentosKit[segmentosKit.length - 1].bottom = y;
    });

    // Un segmento por página tocada — el total que se muestra es el mismo
    // en todos (es el total de la sección completa, no de ese pedazo).
    if (esKit) {
      for (const seg of segmentosKit) {
        const alturaSeg = seg.top - seg.bottom;
        if (alturaSeg <= 0) continue;
        const centroSegY = (seg.top + seg.bottom) / 2 - 3;
        const celdas: [number, number, string, PDFFont][] = [
          [xUnid, colUnidW, 'Kit', font],
          [xCant, colCantW, '1', font],
          [xPUnit, colPUnitW, moneySinDivisa(importeGrupo), bold],
          [xImporte, colImporteW, moneySinDivisa(importeGrupo), bold],
        ];
        for (const [x, w, texto, fnt] of celdas) {
          seg.pagina.drawRectangle({ x, y: seg.bottom, width: w, height: alturaSeg, borderColor: GRAY_LINE, borderWidth: 0.75 });
          centrado(seg.pagina, texto, x, w, centroSegY, 8, fnt);
        }
      }
    }

    ensureSpace(16);
    page.drawRectangle({ x: xPUnit, y: y - 16, width: colPUnitW, height: 16, borderColor: GRAY_LINE, borderWidth: 0.75 });
    page.drawRectangle({ x: xImporte, y: y - 16, width: colImporteW, height: 16, borderColor: GRAY_LINE, borderWidth: 0.75 });
    page.drawText('Importe', { x: xPUnit + 6, y: y - 11, size: 8, font: bold, color: NAVY });
    centrado(page, moneySinDivisa(importeGrupo), xImporte, colImporteW, y - 11, 8, bold);
    y -= 16 + 14;
  }

  // ================= Totales =================
  ensureSpace(60);
  // Con IVA incluido no se muestra subtotal: la suma de los conceptos ya es
  // el total, y un subtotal menor que esa suma confundiría al cliente.
  const totales: [string, number][] = cot.iva_incluido
    ? [
        [`IVA INCLUIDO (${cot.iva_pct}%)`, cot.iva],
        ['TOTAL', cot.total],
      ]
    : [
        ['SUBTOTAL', cot.subtotal],
        [`IVA (${cot.iva_pct}%)`, cot.iva],
        ['TOTAL', cot.total],
      ];
  for (const [label, val] of totales) {
    // Solo el TOTAL lleva la divisa; subtotal e IVA van como los demás precios.
    const vt = label === 'TOTAL' ? money(val, cot.moneda) : moneySinDivisa(val);
    const xValor = xImporte + colImporteW - font.widthOfTextAtSize(vt, 9.5);
    // Una etiqueta larga («IVA INCLUIDO (16%)») con un monto grande no cabe
    // desde xPUnit: se recorre a la izquierda para no encimarse con la cifra.
    const xEtiqueta = Math.min(xPUnit, xValor - 10 - bold.widthOfTextAtSize(label, 9.5));
    page.drawText(label, { x: xEtiqueta, y, size: 9.5, font: bold, color: NAVY });
    page.drawText(vt, { x: xValor, y, size: 9.5, font: bold, color: NAVY });
    y -= 16;
  }

  const nombreMoneda = cot.moneda === 'USD' ? 'Dólares Americanos (USD)' : 'Moneda Nacional';
  const condiciones = [
    cot.iva_incluido
      ? `Los precios se expresan en ${nombreMoneda}, con IVA incluido.`
      : `Los precios se expresan en ${nombreMoneda}, más IVA.`,
    `Forma de Pago: ${cot.forma_pago}`,
    'Esta cotización ampara unicamente lo descrito anteriormente.',
    `Tiempo de Entrega: ${cot.tiempo_entrega}`,
    `Garantía: ${cot.garantia}`,
    `Vigencia de cotización: ${cot.vigencia_dias} días naturales una vez presentada al cliente.`,
  ];
  if (cot.notas) condiciones.push(cot.notas);

  // ================= Condiciones comerciales y firma =================
  // Si caben completas debajo de los totales se quedan en la misma hoja
  // (una cotización corta ya no deja media página en blanco); si no, van
  // en hoja aparte como siempre.
  const lineasCondiciones = condiciones.reduce((n, c) => n + c.split(/\r?\n/).reduce((m, p) => m + (p.trim() ? wrapText(p, font, 9.5, contentW).length : 0.5), 0), 0);
  const altoCierre = 24 + 16 + lineasCondiciones * 14 + 60 + 5 * 14;
  if (y - altoCierre < 46) startPage();
  else y -= 16;

  y -= 8;
  page.drawText('Condiciones comerciales de venta:', { x: MARGIN, y, size: 10, font: bold, color: NAVY });
  y -= 16;
  // Los campos de texto largo (garantía, tiempo de entrega, notas) pueden
  // traer varios párrafos: cada salto de línea se respeta y una línea vacía
  // deja un espacio entre párrafos.
  for (const condicion of condiciones) {
    for (const parrafo of condicion.split(/\r?\n/)) {
      if (!parrafo.trim()) { y -= 7; continue; }
      for (const wl of wrapText(parrafo, font, 9.5, contentW)) {
        ensureSpace(15);
        page.drawText(wl, { x: MARGIN, y, size: 9.5, font, color: NAVY });
        y -= 14;
      }
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
