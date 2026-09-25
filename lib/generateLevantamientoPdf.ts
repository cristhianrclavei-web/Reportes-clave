import { PDFDocument } from 'pdf-lib';
import { comprimirFoto } from './pdfFotos';
import {
  NAVY, GRAY_LINE, GRAY_TEXT,
  MARGIN, PAGE_W, PAGE_H,
  embedBrandFonts, drawBadge, drawIconStrip, drawWatermark,
} from './pdfBranding';
import { Levantamiento, SistemaLevantamiento } from './levantamientos';

// Mismo formato de cajas con título que generateReportPdf.ts — un
// levantamiento es, para efectos de quien lo revisa (el supervisor), el
// mismo tipo de documento que un reporte de servicio: encabezado de marca,
// datos del sitio, una caja por sistema con su estado/observaciones/fotos,
// y notas generales al final. Sin firmas: un levantamiento no las lleva.

function nombreCreador(profiles: Levantamiento['profiles']): string {
  if (!profiles) return '—';
  return Array.isArray(profiles) ? profiles[0]?.full_name || '—' : profiles.full_name || '—';
}

export async function generateLevantamientoPdf(
  levantamiento: Levantamiento,
  sistemas: SistemaLevantamiento[],
  supabase?: any
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);

  const { font, bold, display } = await embedBrandFonts(pdfDoc);

  const contentW = PAGE_W - MARGIN * 2;
  let y = PAGE_H - MARGIN;

  drawWatermark(page, display);

  function newPage() {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
    drawWatermark(page, display);
  }
  function ensureSpace(needed: number) {
    if (y - needed < MARGIN + 30) newPage();
  }
  function wrapText(text: string, fnt: typeof font, size: number, maxWidth: number): string[] {
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
  // Respeta los saltos de línea que escribió la persona: en un levantamiento
  // cada renglón suele ser un equipo o un punto distinto, y juntarlos en un
  // solo párrafo los vuelve ilegibles para quien revisa.
  function wrapParrafos(text: string, fnt: typeof font, size: number, maxWidth: number): string[] {
    const out: string[] = [];
    for (const linea of (text || '').split(/\r?\n/)) {
      if (!linea.trim()) continue;
      out.push(...wrapText(linea, fnt, size, maxWidth));
    }
    return out;
  }
  function boxTitle(x: number, w: number, yTop: number, h: number, title: string) {
    page.drawText(title.toUpperCase(), { x: x + 4, y: yTop - h + h / 2 - 3, size: 8, font: bold, color: NAVY, maxWidth: w - 8 });
    page.drawLine({ start: { x, y: yTop - h }, end: { x: x + w, y: yTop - h }, thickness: 0.75, color: GRAY_LINE });
  }
  function boxBorder(x: number, yTop: number, w: number, h: number) {
    page.drawRectangle({ x, y: yTop - h, width: w, height: h, borderColor: GRAY_LINE, borderWidth: 0.75 });
  }

  // ================= HEADER =================
  const headerTop = y;
  const badgeSize = 46;
  drawBadge(page, display, MARGIN, headerTop, badgeSize);

  const wordX = MARGIN + badgeSize + 12;
  const wordSize = 15;
  page.drawText('CLAVE INTELIGENTE', { x: wordX, y: headerTop - 15, size: wordSize, font: display, color: NAVY });
  const wordmarkW = display.widthOfTextAtSize('CLAVE INTELIGENTE', wordSize);
  const lineY = headerTop - 24;
  page.drawLine({ start: { x: wordX, y: lineY }, end: { x: wordX + wordmarkW, y: lineY }, thickness: 1, color: NAVY });
  drawIconStrip(page, wordX, lineY - 8, 14, GRAY_TEXT);

  page.drawText('LEVANTAMIENTO TÉCNICO', { x: PAGE_W - MARGIN - 220, y: headerTop - 10, size: 14, font: display, color: NAVY });
  page.drawText(`Folio: ${levantamiento.folio}`, { x: PAGE_W - MARGIN - 220, y: headerTop - 24, size: 7.5, font, color: GRAY_TEXT });

  const clienteY = headerTop - badgeSize - 20;
  page.drawText(levantamiento.empresa || 'Cliente sin especificar', {
    x: MARGIN, y: clienteY, size: 17, font: display, color: NAVY, maxWidth: contentW,
  });
  page.drawText(`Levantamiento del ${levantamiento.fecha || '—'} · Hecho por ${nombreCreador(levantamiento.profiles)}`, {
    x: MARGIN, y: clienteY - 14, size: 8.5, font, color: GRAY_TEXT,
  });

  y = clienteY - 26;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1.5, color: NAVY });
  y -= 12;

  // ================= DATOS DE CONTACTO Y SITIO =================
  const datosRows: [string, string][] = [
    ['Atención', levantamiento.atencion || '—'],
    ['Teléfono', levantamiento.telefono || '—'],
    ['Correo', levantamiento.correo || '—'],
    ['Dirección', levantamiento.direccion || '—'],
  ];
  const datosH = 18 + datosRows.length * 13 + 8;
  ensureSpace(datosH + 10);
  const datosTop = y;
  boxBorder(MARGIN, datosTop, contentW, datosH);
  boxTitle(MARGIN, contentW, datosTop, 18, 'Datos de contacto y sitio');
  let dy = datosTop - 18 - 11;
  datosRows.forEach(([label, value]) => {
    page.drawText(label.toUpperCase(), { x: MARGIN + 8, y: dy, size: 6.5, font: bold, color: GRAY_TEXT });
    page.drawText(value, { x: MARGIN + 95, y: dy, size: 8.5, font, color: NAVY, maxWidth: contentW - 105 });
    dy -= 13;
  });
  y = datosTop - datosH - 10;

  // ================= FOTOS (helper compartido) =================
  async function embedPhoto(bytes: Uint8Array) {
    const reducida = await comprimirFoto(bytes);
    try {
      return await pdfDoc.embedJpg(reducida);
    } catch {
      try {
        return await pdfDoc.embedPng(reducida);
      } catch {
        return null;
      }
    }
  }

  async function drawFotos(paths: string[]) {
    if (paths.length === 0 || !supabase) return;
    const gap = 10;
    const colW = (contentW - gap) / 2;
    const photoH = 120;

    const downloaded: any[] = [];
    for (const path of paths) {
      try {
        const { data: blob, error: dlErr } = await supabase.storage.from('evidencias').download(path);
        if (dlErr || !blob) continue;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const img = await embedPhoto(bytes);
        if (img) downloaded.push(img);
      } catch {
        // si una foto falla, se omite y se sigue con las demás
      }
    }

    for (let i = 0; i < downloaded.length; i += 2) {
      const par = downloaded.slice(i, i + 2);
      ensureSpace(photoH + 10);
      const rowTop = y;
      par.forEach((img, j) => {
        const x = MARGIN + j * (colW + gap);
        const scale = Math.min((colW - 8) / img.width, (photoH - 8) / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        boxBorder(x, rowTop, colW, photoH);
        page.drawImage(img, { x: x + (colW - w) / 2, y: rowTop - photoH + (photoH - h) / 2, width: w, height: h });
      });
      y = rowTop - photoH - 8;
    }

    if (paths.length > 0 && downloaded.length < paths.length) {
      page.drawText(
        `(${paths.length - downloaded.length} foto(s) no se pudieron incluir en el PDF — disponibles en la plataforma)`,
        { x: MARGIN, y, size: 7, font, color: GRAY_TEXT }
      );
      y -= 12;
    }
  }

  // ================= UNA CAJA POR SISTEMA =================
  for (let idx = 0; idx < sistemas.length; idx++) {
    const s = sistemas[idx];
    const estadoLines = s.estado_actual ? wrapParrafos(s.estado_actual, font, 9, contentW - 16) : [];
    const obsLines = s.observaciones ? wrapParrafos(s.observaciones, font, 9, contentW - 16) : [];

    let bodyH = 0;
    if (estadoLines.length) bodyH += 11 + estadoLines.length * 12 + 4;
    if (obsLines.length) bodyH += 11 + obsLines.length * 12 + 4;
    if (bodyH === 0) bodyH = 16;
    const sisH = 18 + bodyH + 6;

    ensureSpace(sisH + 10);
    const sisTop = y;
    boxBorder(MARGIN, sisTop, contentW, sisH);
    boxTitle(MARGIN, contentW, sisTop, 18, `Sistema ${idx + 1}: ${s.sistema}`);
    let sy = sisTop - 18 - 11;

    if (estadoLines.length) {
      page.drawText('ESTADO ACTUAL', { x: MARGIN + 8, y: sy, size: 6.5, font: bold, color: GRAY_TEXT });
      sy -= 11;
      estadoLines.forEach((l) => { page.drawText(l, { x: MARGIN + 8, y: sy, size: 9, font, color: NAVY }); sy -= 12; });
      sy -= 4;
    }
    if (obsLines.length) {
      page.drawText('OBSERVACIONES / RECOMENDACIÓN', { x: MARGIN + 8, y: sy, size: 6.5, font: bold, color: GRAY_TEXT });
      sy -= 11;
      obsLines.forEach((l) => { page.drawText(l, { x: MARGIN + 8, y: sy, size: 9, font, color: NAVY }); sy -= 12; });
    }
    if (!estadoLines.length && !obsLines.length) {
      page.drawText('Sin estado ni observaciones capturadas.', { x: MARGIN + 8, y: sy, size: 8.5, font, color: GRAY_TEXT });
    }
    y = sisTop - sisH - 10;

    if (s.fotos?.length > 0) {
      ensureSpace(16);
      page.drawText(`FOTOS DEL SISTEMA (${s.fotos.length})`, { x: MARGIN, y, size: 7.5, font: bold, color: GRAY_TEXT });
      y -= 10;
      await drawFotos(s.fotos.map((f) => f.path));
    }
  }

  // ================= NOTAS GENERALES DEL SITIO =================
  if (levantamiento.notas) {
    const notasLines = wrapParrafos(levantamiento.notas, font, 9, contentW - 16);
    const notasH = 18 + notasLines.length * 13 + 10;
    ensureSpace(notasH + 10);
    const notasTop = y;
    boxBorder(MARGIN, notasTop, contentW, notasH);
    boxTitle(MARGIN, contentW, notasTop, 18, 'Notas generales del sitio');
    let ny = notasTop - 18 - 11;
    notasLines.forEach((l) => { page.drawText(l, { x: MARGIN + 8, y: ny, size: 9, font, color: NAVY }); ny -= 13; });
    y = notasTop - notasH - 10;
  }

  if (levantamiento.fotos?.length > 0) {
    ensureSpace(16);
    page.drawText(`FOTOS GENERALES DEL SITIO (${levantamiento.fotos.length})`, { x: MARGIN, y, size: 7.5, font: bold, color: GRAY_TEXT });
    y -= 10;
    await drawFotos(levantamiento.fotos.map((f) => f.path));
  }

  if (!supabase) {
    ensureSpace(14);
    page.drawText('Fotos disponibles en la plataforma.', { x: MARGIN, y, size: 8, font, color: GRAY_TEXT });
    y -= 12;
  }

  page.drawText(`Generado el ${new Date().toLocaleString('es-MX')} · Clave Inteligente · Folio ${levantamiento.folio}`, {
    x: MARGIN, y: MARGIN / 2, size: 6.5, font, color: GRAY_TEXT,
  });

  return pdfDoc.save();
}
