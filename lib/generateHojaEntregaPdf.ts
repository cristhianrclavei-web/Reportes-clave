import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import {
  NAVY, GRAY_LINE, GRAY_TEXT, WHITE, MARGIN, PAGE_W, PAGE_H,
  embedBrandFonts, drawBadge, drawWordmark,
} from './pdfBranding';

// Hoja de entrega que va al frente de «Imprimir varios»: la lista de los
// reportes que se imprimieron (en el mismo orden que el archivo) y un espacio
// para que quien los recibe firme. Así supervisión tiene acuse de lo que entregó.

export type RenglonEntrega = {
  folio: string;
  cliente: string;
  fecha: string; // YYYY-MM-DD
  tecnico: string;
  tipo: string;
  hojas: number;
};

// Un renglón de la tabla es de una sola línea: lo que no cabe se corta con «…».
function recortar(texto: string, fuente: PDFFont, tamano: number, ancho: number): string {
  if (fuente.widthOfTextAtSize(texto, tamano) <= ancho) return texto;
  let corto = texto;
  while (corto.length > 1 && fuente.widthOfTextAtSize(`${corto}…`, tamano) > ancho) corto = corto.slice(0, -1);
  return `${corto.trimEnd()}…`;
}

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export async function generateHojaEntregaPdf(renglones: RenglonEntrega[], preparadoPor: string, generadoEn: Date): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const { font, bold, display } = await embedBrandFonts(pdf);
  const ancho = PAGE_W - MARGIN * 2;
  const totalHojas = renglones.reduce((suma, r) => suma + r.hojas, 0);
  const clientes = new Set(renglones.map((r) => r.cliente)).size;
  const generado = generadoEn.toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'long', timeStyle: 'short' });

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function encabezado(continuacion: boolean) {
    drawBadge(page, display, MARGIN, y, 38);
    drawWordmark(page, display, MARGIN + 48, y - 15, 13);
    const titulo = continuacion ? 'HOJA DE ENTREGA (CONTINÚA)' : 'HOJA DE ENTREGA';
    const anchoTitulo = display.widthOfTextAtSize(titulo, 15);
    page.drawText(titulo, { x: PAGE_W - MARGIN - anchoTitulo, y: y - 12, size: 15, font: display, color: NAVY });
    const sub = 'Reportes de servicio impresos';
    page.drawText(sub, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(sub, 8.5), y: y - 26, size: 8.5, font, color: GRAY_TEXT });
    y -= 56;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1.5, color: NAVY });
    y -= 20;
  }
  encabezado(false);

  // Resumen en cuatro datos.
  const resumen: [string, string][] = [
    ['Reportes', String(renglones.length)],
    ['Clientes', String(clientes)],
    ['Hojas', String(totalHojas)],
    ['Preparó', preparadoPor],
  ];
  const anchoDato = ancho / resumen.length;
  resumen.forEach(([etiqueta, valor], i) => {
    const x = MARGIN + i * anchoDato;
    page.drawText(etiqueta.toUpperCase(), { x, y, size: 6.5, font: bold, color: GRAY_TEXT });
    page.drawText(valor, { x, y: y - 16, size: i < 3 ? 16 : 10, font: i < 3 ? display : font, color: NAVY, maxWidth: anchoDato - 10 });
  });
  y -= 30;
  page.drawText(`Generado el ${generado}`, { x: MARGIN, y, size: 8, font, color: GRAY_TEXT });
  y -= 18;

  const columnas = [
    { t: '#', w: 0.05 }, { t: 'FOLIO', w: 0.14 }, { t: 'CLIENTE', w: 0.33 }, { t: 'FECHA', w: 0.11 },
    { t: 'PERSONAL TÉCNICO', w: 0.21 }, { t: 'TIPO', w: 0.1 }, { t: 'HOJAS', w: 0.06 },
  ];
  function cabeceraTabla() {
    page.drawRectangle({ x: MARGIN, y: y - 16, width: ancho, height: 16, color: NAVY });
    let cx = MARGIN;
    columnas.forEach((c) => { page.drawText(c.t, { x: cx + 4, y: y - 11, size: 6.5, font: bold, color: WHITE }); cx += ancho * c.w; });
    y -= 16;
  }
  cabeceraTabla();

  // Si ya no cabe un renglón, sigue en otra hoja con el mismo encabezado.
  const ALTO_RENGLON = 18;
  renglones.forEach((r, i) => {
    if (y - ALTO_RENGLON < MARGIN + 20) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      encabezado(true);
      cabeceraTabla();
    }
    if (i % 2) page.drawRectangle({ x: MARGIN, y: y - ALTO_RENGLON, width: ancho, height: ALTO_RENGLON, color: rgb(0.96, 0.97, 0.97) });
    const valores = [String(i + 1), r.folio, r.cliente, fechaCorta(r.fecha), r.tecnico, r.tipo, String(r.hojas)];
    let cx = MARGIN;
    valores.forEach((t, k) => {
      const fuente = k === 1 || k === 2 ? bold : font;
      const texto = recortar(t, fuente, 8, ancho * columnas[k].w - 8);
      page.drawText(texto, { x: cx + 4, y: y - 12, size: 8, font: fuente, color: NAVY });
      cx += ancho * columnas[k].w;
    });
    page.drawLine({ start: { x: MARGIN, y: y - ALTO_RENGLON }, end: { x: MARGIN + ancho, y: y - ALTO_RENGLON }, thickness: 0.4, color: GRAY_LINE });
    y -= ALTO_RENGLON;
  });

  // Acuse de recibido.
  if (y - 150 < MARGIN) {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
    encabezado(true);
  }
  y -= 34;
  page.drawText('RECIBÍ LOS REPORTES DE ESTA LISTA', { x: MARGIN, y, size: 7.5, font: bold, color: GRAY_TEXT });
  y -= 14;
  const anchoCampo = (ancho - 24) / 3;
  ['Nombre', 'Firma', 'Fecha'].forEach((etiqueta, i) => {
    const x = MARGIN + i * (anchoCampo + 12);
    page.drawRectangle({ x, y: y - 64, width: anchoCampo, height: 64, borderColor: GRAY_LINE, borderWidth: 0.75 });
    page.drawText(etiqueta.toUpperCase(), { x: x + 6, y: y - 58, size: 6.5, font: bold, color: GRAY_TEXT });
  });

  // Pie con número de hoja.
  const paginas = pdf.getPages();
  paginas.forEach((p, i) => {
    const texto = `Hoja de entrega · ${i + 1} de ${paginas.length}`;
    p.drawText(texto, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(texto, 7), y: MARGIN - 14, size: 7, font, color: GRAY_TEXT });
  });

  return pdf.save();
}
