import { PDFDocument, PDFPage, PDFFont, rgb } from 'pdf-lib';
import {
  NAVY, GRAY_LINE, GRAY_TEXT, VERDE, ROJO, MARGIN, PAGE_W, PAGE_H,
  embedBrandFonts, drawBadge,
} from './pdfBranding';
import { MARCA, MARCA_MAYUS } from './marca';
import type { Solicitud } from './solicitudesPersonal';

// Solicitud de horas extra o de vacaciones/permiso en PDF, para archivar:
// datos, actividades, evidencias (hasta 4 fotos), firma del solicitante y
// de quien autoriza. Mismo formato que el vale de almacén.

const TITULO: Record<string, string> = { horas_extra: 'SOLICITUD DE HORAS EXTRA', vacaciones: 'SOLICITUD DE VACACIONES', permiso: 'SOLICITUD DE PERMISO' };
const ESTADO: Record<string, string> = { pendiente: 'Por autorizar', correccion: 'Corrección pedida', aprobada: 'AUTORIZADA', rechazada: 'RECHAZADA', cancelada: 'Cancelada' };
const MOTIVO: Record<string, string> = { personal: 'Asunto personal', medico: 'Cita o incapacidad médica', familiar: 'Asunto familiar', tramite: 'Trámite', otro: 'Otro' };

function fechaHora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' });
}
function fechaLarga(f: string | null): string {
  if (!f) return '—';
  const [y, m, d] = f.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-MX', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function horasTexto(h: number | null): string {
  const min = Math.round((h || 0) * 60);
  const hh = Math.floor(min / 60), mm = min % 60;
  return mm ? `${hh} h ${mm} min` : `${hh} h`;
}

// Texto en varios renglones dentro de un ancho.
function parrafo(page: PDFPage, texto: string, x: number, y: number, ancho: number, font: PDFFont, size: number): number {
  const palabras = texto.split(/\s+/);
  let linea = '';
  for (const p of palabras) {
    const prueba = linea ? `${linea} ${p}` : p;
    if (font.widthOfTextAtSize(prueba, size) > ancho && linea) {
      page.drawText(linea, { x, y, size, font, color: NAVY });
      y -= size + 3.5;
      linea = p;
    } else linea = prueba;
  }
  if (linea) { page.drawText(linea, { x, y, size, font, color: NAVY }); y -= size + 3.5; }
  return y;
}

async function dibujarFirma(pdf: PDFDocument, page: PDFPage, dataUrl: string | null, x: number, y: number, w: number, h: number, font: PDFFont) {
  page.drawRectangle({ x, y, width: w, height: h, borderColor: GRAY_LINE, borderWidth: 0.75 });
  if (dataUrl?.startsWith('data:image')) {
    try {
      const bytes = Uint8Array.from(Buffer.from(dataUrl.split(',')[1], 'base64'));
      const img = dataUrl.startsWith('data:image/png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const s = Math.min((w - 10) / img.width, (h - 10) / img.height);
      page.drawImage(img, { x: x + (w - img.width * s) / 2, y: y + (h - img.height * s) / 2, width: img.width * s, height: img.height * s });
      return;
    } catch { /* sin firma si falla */ }
  }
  page.drawText('Pendiente', { x: x + 8, y: y + h / 2 - 3, size: 8, font, color: GRAY_TEXT });
}

export async function generateSolicitudPdf(s: Solicitud, fotos: Uint8Array[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  const { font, bold, display } = await embedBrandFonts(pdf);
  const w = PAGE_W - MARGIN * 2;
  let y = PAGE_H - MARGIN;

  drawBadge(page, display, MARGIN, y, 38);
  page.drawText(MARCA_MAYUS, { x: MARGIN + 48, y: y - 15, size: 13, font: display, color: NAVY });
  const titulo = `${TITULO[s.tipo]} ${s.folio}`;
  page.drawText(titulo, { x: PAGE_W - MARGIN - display.widthOfTextAtSize(titulo, 13), y: y - 12, size: 13, font: display, color: NAVY });
  const est = ESTADO[s.estado] || s.estado;
  const colorEst = s.estado === 'aprobada' ? VERDE : s.estado === 'rechazada' ? ROJO : GRAY_TEXT;
  page.drawText(est, { x: PAGE_W - MARGIN - bold.widthOfTextAtSize(est, 9), y: y - 27, size: 9, font: bold, color: colorEst });
  y -= 56;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1.5, color: NAVY });
  y -= 18;

  const datos: [string, string][] = [['Solicita', s.solicitante?.full_name || '—'], ['Fecha de solicitud', fechaHora(s.created_at)]];
  if (s.tipo === 'horas_extra') {
    datos.push(
      ['Día trabajado', fechaLarga(s.fecha)],
      ['Horario', `${s.hora_inicio?.slice(0, 5)} a ${s.hora_fin?.slice(0, 5)}${s.hora_fin && s.hora_inicio && s.hora_fin <= s.hora_inicio ? ' (día siguiente)' : ''}`],
      ['Total de horas extra', horasTexto(s.horas)],
      ['Corte de pago', fechaLarga(s.corte_pago)],
      ['Cliente', s.cliente_nombre || '—'],
      ['Proyecto / trabajo', s.proyecto || '—'],
    );
  } else {
    datos.push(
      ['Desde', fechaLarga(s.fecha_inicio)],
      ['Hasta', fechaLarga(s.fecha_fin)],
      ['Días', `${Number(s.dias)}${s.medio_dia ? ' (medio día)' : ''}`],
      ['Regresa', fechaLarga(s.fecha_regreso)],
    );
    if (s.tipo === 'permiso') {
      datos.push(['Tipo de permiso', MOTIVO[s.motivo_tipo || ''] || '—'], ['Goce de sueldo', s.goce_sueldo === true ? 'Con goce' : s.goce_sueldo === false ? 'Sin goce' : 'A decidir']);
    }
    if (s.cubre_nombre) datos.push(['Cubre pendientes', s.cubre_nombre]);
  }
  for (let i = 0; i < datos.length; i += 2) {
    datos.slice(i, i + 2).forEach(([k, val], j) => {
      const x = MARGIN + j * (w / 2);
      page.drawText(k.toUpperCase(), { x, y, size: 6.5, font: bold, color: GRAY_TEXT });
      page.drawText(val, { x, y: y - 11, size: 9, font: k.startsWith('Total') ? bold : font, color: NAVY, maxWidth: w / 2 - 10 });
    });
    y -= 28;
  }

  const bloque = (titulo: string, texto: string) => {
    page.drawText(titulo, { x: MARGIN, y, size: 6.5, font: bold, color: GRAY_TEXT });
    y -= 12;
    y = parrafo(page, texto, MARGIN, y, w, font, 9);
    y -= 8;
  };
  if (s.tipo === 'horas_extra' && s.actividades) {
    page.drawText('ACTIVIDADES REALIZADAS', { x: MARGIN, y, size: 6.5, font: bold, color: GRAY_TEXT });
    y -= 12;
    s.actividades.split('\n').filter(Boolean).forEach((a, i) => { y = parrafo(page, `${i + 1}. ${a}`, MARGIN, y, w, font, 9); });
    y -= 8;
  }
  if (s.motivo) bloque(s.tipo === 'permiso' ? 'MOTIVO' : 'COMENTARIO', s.motivo);
  if (s.nota) bloque('NOTA', s.nota);
  if (s.comentario_revision) bloque(`COMENTARIO DE ${s.revisado_nombre?.toUpperCase() || 'QUIEN AUTORIZA'}`, s.comentario_revision);

  // Evidencias (hasta 4)
  if (fotos.length) {
    if (y < MARGIN + 260) { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
    page.drawText(`EVIDENCIAS (${s.fotos.length})`, { x: MARGIN, y, size: 6.5, font: bold, color: GRAY_TEXT });
    y -= 8;
    const lado = (w - 3 * 8) / 4;
    for (let i = 0; i < Math.min(4, fotos.length); i++) {
      try {
        const b = fotos[i];
        const esPng = b[0] === 0x89 && b[1] === 0x50;
        const img = esPng ? await pdf.embedPng(b) : await pdf.embedJpg(b);
        const sc = Math.min(lado / img.width, lado / img.height);
        const x = MARGIN + i * (lado + 8);
        page.drawRectangle({ x, y: y - lado, width: lado, height: lado, color: rgb(0.96, 0.97, 0.97) });
        page.drawImage(img, { x: x + (lado - img.width * sc) / 2, y: y - lado + (lado - img.height * sc) / 2, width: img.width * sc, height: img.height * sc });
      } catch { /* formato no soportado: se omite */ }
    }
    y -= lado + 16;
  }

  // Firmas
  if (y < MARGIN + 130) { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
  const boxW = (w - 20) / 2, boxH = 70;
  page.drawText('FIRMA DEL SOLICITANTE', { x: MARGIN, y, size: 6.5, font: bold, color: GRAY_TEXT });
  page.drawText('AUTORIZA', { x: MARGIN + boxW + 20, y, size: 6.5, font: bold, color: GRAY_TEXT });
  await dibujarFirma(pdf, page, s.firma_solicitante, MARGIN, y - 8 - boxH, boxW, boxH, font);
  await dibujarFirma(pdf, page, s.estado === 'aprobada' ? s.firma_autoriza : null, MARGIN + boxW + 20, y - 8 - boxH, boxW, boxH, font);
  page.drawText(s.solicitante?.full_name || '', { x: MARGIN, y: y - boxH - 20, size: 9, font, color: NAVY });
  const aut = s.estado === 'aprobada' ? `${s.revisado_nombre || ''} · ${fechaHora(s.revisado_en)}` : s.estado === 'rechazada' ? `Rechazada por ${s.revisado_nombre || ''}` : '';
  page.drawText(aut, { x: MARGIN + boxW + 20, y: y - boxH - 20, size: 9, font, color: NAVY, maxWidth: boxW });

  page.drawText(`Generado el ${fechaHora(new Date().toISOString())} · ${MARCA.nombre} · ${s.folio}`, { x: MARGIN, y: MARGIN / 2, size: 6.5, font, color: GRAY_TEXT });
  return pdf.save();
}
