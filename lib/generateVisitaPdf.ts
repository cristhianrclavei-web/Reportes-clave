import { dibujarEvidencias } from './pdfEvidencias';
import { PDFDocument, PDFPage, PDFFont, rgb } from 'pdf-lib';
import {
  NAVY, GRAY_LINE, GRAY_TEXT, VERDE, ROJO, MARGIN, PAGE_W, PAGE_H,
  embedBrandFonts, drawBadge, drawWordmark,
} from './pdfBranding';
import { MARCA } from './marca';
import { textoMotivo } from './motivosServicio';

// Hoja de visita sin trabajo: constancia de una hoja de que el personal se
// presentó y el trabajo no se pudo realizar. Sustituye al reporte de ese
// día: datos del servicio, horas registradas, motivo, fotos del sitio y la
// firma de quien atendió. Mismo formato que la solicitud y el vale.

export type DatosVisita = {
  folio: string;
  proyecto: string;
  cliente: string | null;
  descripcion: string | null;
  fecha: string;
  direccion: string | null;
  horaProgramada: string | null;
  horaLlegada: string | null;
  horaInicio: string | null;
  horaCierre: string | null;
  personal: string[];
  motivo: string | null;
  comentario: string | null;
  estado: 'pendiente' | 'liberado' | 'rechazado' | null;
  revisadoPor: string | null;
  revisadoEn: string | null;
  nota: string | null;
  firma: string | null;
  firmaNombre: string | null;
};

const ESTADO: Record<string, string> = { pendiente: 'Por revisar', liberado: 'ACEPTADA', rechazado: 'Requiere reporte' };

function hora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false });
}
function fechaHora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' });
}
function fechaLarga(f: string): string {
  const [y, m, d] = f.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-MX', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Texto en varios renglones dentro de un ancho.
function parrafo(page: PDFPage, texto: string, x: number, y: number, ancho: number, font: PDFFont, size: number): number {
  for (const renglon of texto.split('\n')) {
    let linea = '';
    for (const p of renglon.split(/\s+/)) {
      const prueba = linea ? `${linea} ${p}` : p;
      if (font.widthOfTextAtSize(prueba, size) > ancho && linea) {
        page.drawText(linea, { x, y, size, font, color: NAVY });
        y -= size + 3.5;
        linea = p;
      } else linea = prueba;
    }
    if (linea) { page.drawText(linea, { x, y, size, font, color: NAVY }); y -= size + 3.5; }
  }
  return y;
}

export async function generateVisitaPdf(v: DatosVisita, fotos: Uint8Array[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  const { font, bold, display } = await embedBrandFonts(pdf);
  const w = PAGE_W - MARGIN * 2;
  let y = PAGE_H - MARGIN;

  drawBadge(page, display, MARGIN, y, 38);
  drawWordmark(page, display, MARGIN + 48, y - 15, 13);
  const titulo = `VISITA SIN TRABAJO ${v.folio}`;
  page.drawText(titulo, { x: PAGE_W - MARGIN - display.widthOfTextAtSize(titulo, 13), y: y - 12, size: 13, font: display, color: NAVY });
  if (v.estado) {
    const est = ESTADO[v.estado];
    const color = v.estado === 'liberado' ? VERDE : v.estado === 'rechazado' ? ROJO : GRAY_TEXT;
    page.drawText(est, { x: PAGE_W - MARGIN - bold.widthOfTextAtSize(est, 9), y: y - 27, size: 9, font: bold, color });
  }
  y -= 56;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1.5, color: NAVY });
  y -= 18;

  const datos: [string, string][] = [
    ['Cliente', v.cliente || v.proyecto],
    ['Servicio', v.proyecto],
    ['Fecha', fechaLarga(v.fecha)],
    ['Hora acordada', v.horaProgramada ? v.horaProgramada.slice(0, 5) : '—'],
    ['Llegada al sitio', hora(v.horaLlegada)],
    ['Cierre de la visita', hora(v.horaCierre)],
  ];
  for (let i = 0; i < datos.length; i += 2) {
    datos.slice(i, i + 2).forEach(([k, val], j) => {
      const x = MARGIN + j * (w / 2);
      page.drawText(k.toUpperCase(), { x, y, size: 6.5, font: bold, color: GRAY_TEXT });
      page.drawText(val, { x, y: y - 11, size: 9, font, color: NAVY, maxWidth: w / 2 - 10 });
    });
    y -= 28;
  }

  const bloque = (rotulo: string, texto: string, negrita = false) => {
    page.drawText(rotulo, { x: MARGIN, y, size: 6.5, font: bold, color: GRAY_TEXT });
    y -= 12;
    y = parrafo(page, texto, MARGIN, y, w, negrita ? bold : font, negrita ? 10 : 9);
    y -= 8;
  };
  if (v.direccion) bloque('DOMICILIO', v.direccion);
  if (v.personal.length) bloque('PERSONAL QUE SE PRESENTÓ', v.personal.join(', '));
  if (v.descripcion) bloque('TRABAJO PROGRAMADO', v.descripcion);

  y -= 4;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: GRAY_LINE });
  y -= 16;
  bloque('MOTIVO POR EL QUE NO SE REALIZÓ EL TRABAJO', v.motivo ? textoMotivo(v.motivo) : 'No especificado', true);
  if (v.comentario) bloque('DETALLE', v.comentario);
  if (v.nota && v.estado !== 'pendiente') bloque('NOTA DE SUPERVISIÓN', v.nota);

  // Fotos del sitio (hasta 4)
  if (fotos.length) {
    if (y < MARGIN + 260) { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
    page.drawText('EVIDENCIA', { x: MARGIN, y, size: 6.5, font: bold, color: GRAY_TEXT });
    y -= 8;
    await dibujarEvidencias({
      pdfDoc: pdf, fuentes: { font, bold, display }, x: MARGIN, ancho: w,
      pagina: () => page, y: () => y, fijarY: (v) => { y = v; },
      espacio: (alto) => { if (y - alto < MARGIN) { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; } },
      altoHoja: PAGE_H - MARGIN * 2,
    }, fotos.slice(0, 4).map((bytes) => ({ bytes })), { desde: 0, alto: fotos.length === 1 ? 190 : 150 });
    y -= 10;
  }

  // Firmas: quien atendió por parte del cliente y el personal que acudió.
  if (y < MARGIN + 130) { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
  const boxW = (w - 20) / 2, boxH = 70;
  page.drawText('ATENDIÓ POR PARTE DEL CLIENTE', { x: MARGIN, y, size: 6.5, font: bold, color: GRAY_TEXT });
  page.drawText('PERSONAL QUE ACUDIÓ', { x: MARGIN + boxW + 20, y, size: 6.5, font: bold, color: GRAY_TEXT });
  const yCaja = y - 8 - boxH;
  page.drawRectangle({ x: MARGIN, y: yCaja, width: boxW, height: boxH, borderColor: GRAY_LINE, borderWidth: 0.75 });
  page.drawRectangle({ x: MARGIN + boxW + 20, y: yCaja, width: boxW, height: boxH, borderColor: GRAY_LINE, borderWidth: 0.75 });
  let firmada = false;
  if (v.firma?.startsWith('data:image')) {
    try {
      const bytes = Uint8Array.from(Buffer.from(v.firma.split(',')[1], 'base64'));
      const img = v.firma.startsWith('data:image/png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const s = Math.min((boxW - 10) / img.width, (boxH - 10) / img.height);
      page.drawImage(img, { x: MARGIN + (boxW - img.width * s) / 2, y: yCaja + (boxH - img.height * s) / 2, width: img.width * s, height: img.height * s });
      firmada = true;
    } catch { /* sin firma si falla */ }
  }
  if (!firmada) page.drawText('Sin firma', { x: MARGIN + 8, y: yCaja + boxH / 2 - 3, size: 8, font, color: GRAY_TEXT });
  parrafo(page, v.personal.join(', ') || '—', MARGIN + boxW + 28, yCaja + boxH - 16, boxW - 16, font, 9);
  page.drawText(v.firmaNombre || '', { x: MARGIN, y: yCaja - 12, size: 9, font, color: NAVY, maxWidth: boxW });
  if (v.revisadoPor && v.estado === 'liberado') {
    page.drawText(`Revisó: ${v.revisadoPor} · ${fechaHora(v.revisadoEn)}`, { x: MARGIN + boxW + 20, y: yCaja - 12, size: 8, font, color: GRAY_TEXT, maxWidth: boxW });
  }

  page.drawText(`Generado el ${fechaHora(new Date().toISOString())} · ${MARCA.nombre} · ${v.folio}`, { x: MARGIN, y: MARGIN / 2, size: 6.5, font, color: GRAY_TEXT });
  return pdf.save();
}
