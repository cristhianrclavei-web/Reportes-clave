import { PDFDocument } from 'pdf-lib';
import QRCode from 'qrcode';
import { NAVY, GRAY_TEXT, GRAY_LINE, TEAL_DARK, PAGE_W, PAGE_H, embedBrandFonts, drawBadge } from './pdfBranding';
import { MARCA } from './marca';

// Hoja carta de etiquetas con QR para el almacén: ubicaciones (gabinete,
// rack) o artículos (herramienta, equipo). El QR abre el almacén en la app
// en esa ubicación o ese artículo. 2 columnas × 5 renglones (≈ 9.5 × 5 cm),
// para imprimir en hoja adhesiva y recortar.

export type Etiqueta = { titulo: string; subtitulo?: string; detalle?: string; url: string };

export async function generateEtiquetasAlmacen(etiquetas: Etiqueta[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const { font, bold, display } = await embedBrandFonts(pdf);
  const cols = 2, filas = 5, margen = 22, gap = 10;
  const w = (PAGE_W - margen * 2 - gap) / cols;
  const h = (PAGE_H - margen * 2 - gap * (filas - 1)) / filas;

  for (let i = 0; i < etiquetas.length; i++) {
    if (i % (cols * filas) === 0) pdf.addPage([PAGE_W, PAGE_H]);
    const page = pdf.getPages()[pdf.getPageCount() - 1];
    const k = i % (cols * filas);
    const x = margen + (k % cols) * (w + gap);
    const yTop = PAGE_H - margen - Math.floor(k / cols) * (h + gap);
    const e = etiquetas[i];

    page.drawRectangle({ x, y: yTop - h, width: w, height: h, borderColor: GRAY_LINE, borderWidth: 0.6, borderDashArray: [3, 3] });
    const qrSize = h - 24;
    const png = await QRCode.toBuffer(e.url, { margin: 0, width: 300, errorCorrectionLevel: 'M' });
    const img = await pdf.embedPng(png);
    page.drawImage(img, { x: x + 12, y: yTop - 12 - qrSize, width: qrSize, height: qrSize });

    const tx = x + 12 + qrSize + 12;
    const tw = w - (tx - x) - 10;
    drawBadge(page, display, tx, yTop - 10, 16);
    page.drawText(MARCA.nombre.toUpperCase(), { x: tx + 20, y: yTop - 21, size: 7, font: display, color: GRAY_TEXT });
    // Título en hasta 2 renglones, achicando si es largo.
    let size = 17;
    while (size > 10 && display.widthOfTextAtSize(e.titulo, size) > tw * 2) size -= 1;
    const palabras = e.titulo.split(' ');
    const renglones: string[] = [];
    let actual = '';
    for (const p of palabras) {
      const prueba = actual ? `${actual} ${p}` : p;
      if (display.widthOfTextAtSize(prueba, size) > tw && actual) { renglones.push(actual); actual = p; } else actual = prueba;
    }
    if (actual) renglones.push(actual);
    let ty = yTop - 44;
    renglones.slice(0, 3).forEach((r) => { page.drawText(r, { x: tx, y: ty, size, font: display, color: NAVY }); ty -= size + 2; });
    if (e.subtitulo) { page.drawText(e.subtitulo, { x: tx, y: ty - 4, size: 9, font: bold, color: TEAL_DARK, maxWidth: tw }); ty -= 16; }
    if (e.detalle) page.drawText(e.detalle, { x: tx, y: ty - 4, size: 8, font, color: GRAY_TEXT, maxWidth: tw });
  }
  if (etiquetas.length === 0) pdf.addPage([PAGE_W, PAGE_H]);
  return pdf.save();
}
