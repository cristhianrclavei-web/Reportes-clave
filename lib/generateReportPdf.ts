import { PDFDocument, rgb } from 'pdf-lib';
import { comprimirFoto } from './pdfFotos';
import {
  NAVY, TEAL_DARK, GRAY_LINE, GRAY_TEXT, WHITE, VERDE, ROJO,
  MARGIN, PAGE_W, PAGE_H,
  embedBrandFonts, drawBadge, drawIconStrip, drawWatermark,
} from './pdfBranding';
import { MARCA, MARCA_MAYUS } from './marca';
import { FormatoLlenado, ETIQUETA_FRECUENCIA, ETIQUETA_RESULTADO, resumenFormato } from './formatosMantenimiento';

type ReportRow = {
  id: string;
  created_at: string;
  empresa_cliente: string;
  fecha: string;
  tipo_servicio: string | null;
  sub_tipo_servicio: string | null;
  data: any;
  profiles?: any;
};

function techNames(profiles: any): string[] {
  if (!profiles) return [];
  const arr = Array.isArray(profiles) ? profiles : [profiles];
  return arr.map((p) => p?.full_name).filter(Boolean);
}

const SIGNATURE_ZONE_H = 150;

const SEG_OPTIONS = ['CCTV', 'Automatización', 'Alarma & Det.', 'Control de acceso', 'Alarma intrusión', 'Red contra incendio', 'Supresión', 'Inst. eléctricas', 'Paneles solares', 'Otra'];
const CASO_FIELDS: [string, string][] = [
  ['definicion', 'Definición del problema'],
  ['descripcion', 'Descripción del problema'],
  ['analisis', 'Análisis del problema'],
  ['plan', 'Plan de implementación'],
  ['resultados', 'Resultados'],
  ['pasosFuturos', 'Pasos futuros'],
];

export async function generateReportPdf(report: ReportRow, supabase?: any): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);

  const { font, bold, display } = await embedBrandFonts(pdfDoc);

  const data = report.data || {};
  const contentW = PAGE_W - MARGIN * 2;
  let y = PAGE_H - MARGIN;

  drawWatermark(page, display);

  function newPage() {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
    drawWatermark(page, display);
  }
  function ensureSpace(needed: number) {
    if (y - needed < MARGIN + SIGNATURE_ZONE_H) newPage();
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
  function boxTitle(x: number, w: number, yTop: number, h: number, title: string) {
    page.drawText(title.toUpperCase(), { x: x + 4, y: yTop - h + h / 2 - 3, size: 8, font: bold, color: NAVY });
    page.drawLine({ start: { x, y: yTop - h }, end: { x: x + w, y: yTop - h }, thickness: 0.75, color: GRAY_LINE });
  }
  function boxBorder(x: number, yTop: number, w: number, h: number) {
    page.drawRectangle({ x, y: yTop - h, width: w, height: h, borderColor: GRAY_LINE, borderWidth: 0.75 });
  }
  function checkbox(x: number, yBase: number, checked: boolean, label: string, fnt = font) {
    page.drawRectangle({ x, y: yBase, width: 8, height: 8, borderColor: TEAL_DARK, borderWidth: 0.75, color: checked ? TEAL_DARK : WHITE });
    if (checked) page.drawText('X', { x: x + 1.3, y: yBase + 0.3, size: 7, font: bold, color: WHITE });
    page.drawText(label, { x: x + 13, y: yBase + 0.7, size: 8.5, font: fnt, color: NAVY });
  }

  // ================= HEADER =================
  // Encabezado limpio: sin bloques de color de fondo, solo el logo completo
  // (escudo + nombre + íconos de servicio, igual que en la app) y una línea
  // de acento — se lee como un documento serio, no como una tarjeta de app.
  const headerTop = y;
  const badgeSize = 46;
  drawBadge(page, display, MARGIN, headerTop, badgeSize);

  const wordX = MARGIN + badgeSize + 12;
  const wordSize = 15;
  page.drawText(MARCA_MAYUS, { x: wordX, y: headerTop - 15, size: wordSize, font: display, color: NAVY });
  const wordmarkW = display.widthOfTextAtSize(MARCA_MAYUS, wordSize);
  const lineY = headerTop - 24;
  page.drawLine({ start: { x: wordX, y: lineY }, end: { x: wordX + wordmarkW, y: lineY }, thickness: 1, color: ROJO });
  drawIconStrip(page, wordX, lineY - 8, 14, GRAY_TEXT);

  page.drawText('REPORTE DE SERVICIO', { x: PAGE_W - MARGIN - 210, y: headerTop - 10, size: 14, font: display, color: NAVY });
  page.drawText(`Clave: ${data.claveFormato || MARCA.claveFormato}  ·  Folio: ${report.id.slice(0, 8).toUpperCase()}`, {
    x: PAGE_W - MARGIN - 210,
    y: headerTop - 24,
    size: 7.5,
    font,
    color: GRAY_TEXT,
  });

  // Cliente como dato protagonista — el detalle (horas, orden de compra,
  // técnicos) sigue abajo en "Personal / Datos del servicio", esto es solo
  // el resumen.
  const clienteY = headerTop - badgeSize - 20;
  page.drawText(report.empresa_cliente || 'Cliente sin especificar', {
    x: MARGIN,
    y: clienteY,
    size: 17,
    font: display,
    color: NAVY,
    maxWidth: contentW,
  });
  page.drawText(`Servicio del ${report.fecha || '—'}`, { x: MARGIN, y: clienteY - 14, size: 8.5, font, color: GRAY_TEXT });

  y = clienteY - 26;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1.5, color: NAVY });
  y -= 12;

  // ================= PERSONAL / DATOS DEL SERVICIO =================
  const colGap = 12;
  const leftW = contentW * 0.42;
  const rightW = contentW - leftW - colGap;
  const rightX = MARGIN + leftW + colGap;

  const manualPersonal: string[] = data.personal && data.personal.length > 0 ? data.personal : [];
  const tecnicos = manualPersonal.length > 0 ? manualPersonal : techNames(report.profiles);
  const personalLines = tecnicos.length ? tecnicos : ['—'];
  const personalBoxH = 18 + personalLines.length * 13 + 10;
  const datosRows: [string, string][] = [
    ['Lista de conceptos', data.listaConceptos || '—'],
    ['Fecha', report.fecha || '—'],
    ['Hora llegada', data.horaLlegada || '—'],
    ['Hora salida', data.horaSalida || '—'],
    ['Empresa / Cliente', report.empresa_cliente || '—'],
    ['Ord. de compra', data.ordCompra || '—'],
  ];
  const datosBoxH = 18 + datosRows.length * 13 + 6;
  const topBoxH = Math.max(personalBoxH, datosBoxH);

  ensureSpace(topBoxH + 10);
  const sectionTop = y;
  boxBorder(MARGIN, sectionTop, leftW, topBoxH);
  boxTitle(MARGIN, leftW, sectionTop, 18, 'Personal que realiza el servicio');
  let ly = sectionTop - 18 - 11;
  personalLines.forEach((name) => {
    page.drawText(`•  ${name}`, { x: MARGIN + 8, y: ly, size: 9, font, color: NAVY, maxWidth: leftW - 16 });
    ly -= 13;
  });

  boxBorder(rightX, sectionTop, rightW, topBoxH);
  boxTitle(rightX, rightW, sectionTop, 18, 'Datos del servicio');
  let ry = sectionTop - 18 - 11;
  datosRows.forEach(([label, value]) => {
    page.drawText(label.toUpperCase(), { x: rightX + 8, y: ry, size: 6.5, font: bold, color: GRAY_TEXT });
    page.drawText(value, { x: rightX + 95, y: ry, size: 8.5, font, color: NAVY, maxWidth: rightW - 100 });
    ry -= 13;
  });
  y = sectionTop - topBoxH - 10;

  // ================= VEHÍCULO / PLACAS / MANEJADO POR =================
  if (data.vehiculo || data.placas || data.manejadoPor) {
    const vH = 30;
    ensureSpace(vH + 8);
    const vTop = y;
    boxBorder(MARGIN, vTop, contentW / 2, vH);
    boxBorder(MARGIN + contentW / 2, vTop, contentW / 2, vH);
    page.drawText('VEHÍCULO', { x: MARGIN + 8, y: vTop - 12, size: 6.5, font: bold, color: GRAY_TEXT });
    page.drawText(data.vehiculo || '—', { x: MARGIN + 8, y: vTop - 24, size: 8.5, font, color: NAVY });
    page.drawText('PLACAS', { x: MARGIN + 150, y: vTop - 12, size: 6.5, font: bold, color: GRAY_TEXT });
    page.drawText(data.placas || '—', { x: MARGIN + 150, y: vTop - 24, size: 8.5, font, color: NAVY });
    page.drawText('MANEJADO POR', { x: MARGIN + contentW / 2 + 8, y: vTop - 12, size: 6.5, font: bold, color: GRAY_TEXT });
    page.drawText(data.manejadoPor || '—', { x: MARGIN + contentW / 2 + 8, y: vTop - 24, size: 8.5, font, color: NAVY });
    y = vTop - vH - 8;
  }

  // ================= CONTACTO / PUESTO =================
  const contactoH = 30;
  ensureSpace(contactoH + 8);
  const cTop = y;
  boxBorder(MARGIN, cTop, contentW / 2, contactoH);
  boxBorder(MARGIN + contentW / 2, cTop, contentW / 2, contactoH);
  page.drawText('CONTACTO / USUARIO', { x: MARGIN + 8, y: cTop - 12, size: 6.5, font: bold, color: GRAY_TEXT });
  page.drawText(data.contactoUsuario || '—', { x: MARGIN + 8, y: cTop - 24, size: 8.5, font, color: NAVY });
  page.drawText('PUESTO / ÁREA', { x: MARGIN + contentW / 2 + 8, y: cTop - 12, size: 6.5, font: bold, color: GRAY_TEXT });
  page.drawText(data.puestoArea || '—', { x: MARGIN + contentW / 2 + 8, y: cTop - 24, size: 8.5, font, color: NAVY });
  y = cTop - contactoH - 10;

  // ================= TIPO DE SERVICIO =================
  ensureSpace(24);
  const tipos = ['Instalación nueva', 'Mantenimiento', 'Otro'];
  const subtipos = ['Correctivo', 'Preventivo'];
  let tx = MARGIN;
  [...tipos, ...subtipos].forEach((t) => {
    const active = t === report.tipo_servicio || t === report.sub_tipo_servicio;
    checkbox(tx, y - 16, active, t, active ? bold : font);
    tx += bold.widthOfTextAtSize(t, 8.5) + 30;
  });
  y -= 24;
  if (report.tipo_servicio === 'Otro' && data.tipoServicioOtroTexto) {
    page.drawText(`Especifica: ${data.tipoServicioOtroTexto}`, { x: MARGIN, y, size: 8.5, font, color: NAVY });
    y -= 16;
  }

  // ================= TUBERÍA + SISTEMA DE SEGURIDAD =================
  const tuberiaData: Record<string, { medida: string; metros: string; especifica?: string }> = data.tuberia || {};
  const tuberiaTypes = ['Roscada', 'Ajuste', 'Ranurada', 'Otra'];
  const segSelected: string[] = (data.sistemaSeguridad || []).map((s: string) => s.replace('Alarma&Det', 'Alarma & Det.'));

  const tsLeftW = contentW * 0.4;
  const tsRightW = contentW - tsLeftW - 12;
  const tsRightX = MARGIN + tsLeftW + 12;
  const tubH = 18 + tuberiaTypes.length * 13 + 10;
  const segH = 18 + SEG_OPTIONS.length * 14 + 8 + (segSelected.includes('Otra') && data.seguridadOtraTexto ? 13 : 0);
  const tsRowH = Math.max(tubH, segH);

  ensureSpace(tsRowH + 10);
  const tsTop = y;
  boxBorder(MARGIN, tsTop, tsLeftW, tsRowH);
  boxTitle(MARGIN, tsLeftW, tsTop, 18, 'Tubería');
  let ty = tsTop - 18 - 11;
  tuberiaTypes.forEach((t) => {
    const v = tuberiaData[t];
    const label = t === 'Otra' && v?.especifica ? `Otra (${v.especifica})` : t;
    checkbox(MARGIN + 8, ty - 6, !!v, v ? `${label}: Medida ${v.medida || '—'} · Metros ${v.metros || '—'}` : label);
    ty -= 13;
  });

  boxBorder(tsRightX, tsTop, tsRightW, tsRowH);
  boxTitle(tsRightX, tsRightW, tsTop, 18, 'Sistema de seguridad');
  SEG_OPTIONS.forEach((opt, i) => {
    const cy = tsTop - 18 - 12 - i * 14;
    checkbox(tsRightX + 8, cy - 6, segSelected.includes(opt), opt);
  });
  if (segSelected.includes('Otra') && data.seguridadOtraTexto) {
    const otraY = tsTop - 18 - 12 - SEG_OPTIONS.length * 14;
    page.drawText(`Otra: ${data.seguridadOtraTexto}`, { x: tsRightX + 8, y: otraY, size: 8, font, color: NAVY, maxWidth: tsRightW - 16 });
  }
  y = tsTop - tsRowH - 10;

  // ================= CABLE INSTALADO =================
  const cablesList: any[] = data.cables && data.cables.length > 0 ? data.cables : [data.cable1, data.cable2].filter(Boolean);
  if (cablesList.length > 0) {
    const halfW = (contentW - 10) / 2;
    const cableRowH = 18 + 13 * 3 + 8;
    for (let i = 0; i < cablesList.length; i += 2) {
      const pair = cablesList.slice(i, i + 2);
      ensureSpace(cableRowH + 10);
      const cableTop = y;
      pair.forEach((d, j) => {
        const x = MARGIN + j * (halfW + 10);
        boxBorder(x, cableTop, halfW, cableRowH);
        boxTitle(x, halfW, cableTop, 18, `Cable ${i + j + 1}`);
        let cy = cableTop - 18 - 11;
        [['Tipo', d?.tipo], ['Calibre', d?.calibre], ['Metros', d?.metros]].forEach(([label, value]) => {
          page.drawText(`${label}: ${value || '—'}`, { x: x + 8, y: cy, size: 8.5, font, color: NAVY });
          cy -= 13;
        });
      });
      y = cableTop - cableRowH - 10;
    }
  }

  // ================= MONTAJE DE SOPORTERÍA Y EQUIPO =================
  const equipos: any[] = data.equipos || [];
  const eqCols = [
    { label: 'CANT.', key: 'cant', w: 0.09 },
    { label: 'DESCRIPCIÓN', key: 'desc', w: 0.34 },
    { label: 'MODELO', key: 'modelo', w: 0.2 },
    { label: 'MARCA', key: 'marca', w: 0.17 },
    { label: 'NO. SERIE', key: 'serie', w: 0.2 },
  ];
  const rowH = 16;
  const eqBodyRows = Math.max(equipos.length, 1);
  const eqH = 18 + rowH + eqBodyRows * rowH;
  ensureSpace(eqH + 10);
  const eqTop = y;
  boxBorder(MARGIN, eqTop, contentW, eqH);
  boxTitle(MARGIN, contentW, eqTop, 18, 'Montaje de soportería y equipo');
  let cx = MARGIN;
  const headerRowY = eqTop - 18;
  eqCols.forEach((c) => {
    page.drawText(c.label, { x: cx + 6, y: headerRowY - rowH + 5, size: 7, font: bold, color: GRAY_TEXT });
    cx += contentW * c.w;
    page.drawLine({ start: { x: cx, y: headerRowY }, end: { x: cx, y: eqTop - eqH }, thickness: 0.5, color: GRAY_LINE });
  });
  page.drawLine({ start: { x: MARGIN, y: headerRowY - rowH }, end: { x: MARGIN + contentW, y: headerRowY - rowH }, thickness: 0.5, color: GRAY_LINE });

  if (equipos.length === 0) {
    page.drawText('Sin equipo registrado', { x: MARGIN + 8, y: headerRowY - rowH - 11, size: 8.5, font, color: GRAY_TEXT });
  } else {
    equipos.forEach((eq, i) => {
      const rowY = headerRowY - rowH - i * rowH;
      let vx = MARGIN;
      eqCols.forEach((c) => {
        page.drawText(String((eq as any)[c.key] || ''), { x: vx + 6, y: rowY - rowH + 5, size: 8, font, color: NAVY, maxWidth: contentW * c.w - 10 });
        vx += contentW * c.w;
      });
      if (i < equipos.length - 1) {
        page.drawLine({ start: { x: MARGIN, y: rowY - rowH }, end: { x: MARGIN + contentW, y: rowY - rowH }, thickness: 0.5, color: GRAY_LINE });
      }
    });
  }
  y = eqTop - eqH - 10;

  // ================= DESCRIPCIÓN DE ACTIVIDADES REALIZADAS =================
  const actividades: string[] = data.actividades || [];
  if (actividades.length > 0) {
    const actLineData = actividades.map((a) => wrapText(`${actividades.indexOf(a) + 1}. ${a}`, font, 9, contentW - 16));
    const totalLines = actLineData.reduce((s, l) => s + l.length, 0);
    const actH = 18 + totalLines * 13 + 8;
    ensureSpace(actH + 10);
    const actTop = y;
    boxBorder(MARGIN, actTop, contentW, actH);
    boxTitle(MARGIN, contentW, actTop, 18, 'Descripción de actividades realizadas');
    let ay = actTop - 18 - 11;
    actLineData.forEach((lines) => {
      lines.forEach((l) => {
        page.drawText(l, { x: MARGIN + 8, y: ay, size: 9, font, color: NAVY });
        ay -= 13;
      });
    });
    y = actTop - actH - 10;
  }

  // ================= CASO DE PROBLEMA (correlacionado por punto) =================
  const casoPuntos: any[] = data.casoPuntos || [];
  if (casoPuntos.length > 0) {
    const rowsData = CASO_FIELDS.map(([key, label]) => {
      const values = casoPuntos.map((p, i) => (p[key] ? `${i + 1}. ${p[key]}` : '')).filter(Boolean);
      if (values.length === 0) return null;
      const lines = wrapText(`${label}: ${values.join('  ·  ')}`, font, 8.5, contentW - 16);
      return { lines };
    }).filter(Boolean) as { lines: string[] }[];

    const totalLines = rowsData.reduce((s, r) => s + r.lines.length, 0);
    const casoH = 18 + totalLines * 12 + rowsData.length * 3 + 6;
    ensureSpace(casoH + 10);
    const casoTop = y;
    boxBorder(MARGIN, casoTop, contentW, casoH);
    boxTitle(MARGIN, contentW, casoTop, 18, 'Caso de problema en equipo o instalación');
    let py = casoTop - 18 - 11;
    rowsData.forEach((r) => {
      r.lines.forEach((l) => {
        page.drawText(l, { x: MARGIN + 8, y: py, size: 8.5, font, color: NAVY });
        py -= 12;
      });
      py -= 3;
    });
    y = casoTop - casoH - 10;
  }

  // ================= OBSERVACIONES =================
  if (data.observaciones) {
    const obsLines = wrapText(data.observaciones, font, 9, contentW - 16);
    const obsH = 18 + obsLines.length * 13 + 10;
    ensureSpace(obsH + 10);
    const obsTop = y;
    boxBorder(MARGIN, obsTop, contentW, obsH);
    boxTitle(MARGIN, contentW, obsTop, 18, 'Observaciones');
    let oy = obsTop - 18 - 11;
    obsLines.forEach((l) => {
      page.drawText(l, { x: MARGIN + 8, y: oy, size: 9, font, color: NAVY });
      oy -= 13;
    });
    y = obsTop - obsH - 10;
  }

  // ================= FOTOS DE EVIDENCIA =================
  const fotosRaw: any[] = data.fotos || [];
  const fotos = fotosRaw.map((f) => (typeof f === 'string' ? { path: f, caption: '' } : { path: f.path, caption: f.caption || '' }));

  async function embedPhoto(original: Uint8Array) {
    const bytes = await comprimirFoto(original);
    try {
      return await pdfDoc.embedJpg(bytes);
    } catch {
      try {
        return await pdfDoc.embedPng(bytes);
      } catch {
        return null;
      }
    }
  }

  if (fotos.length > 0) {
    ensureSpace(20);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + contentW, y }, thickness: 0.75, color: GRAY_LINE });
    y -= 14;
    page.drawText(`FOTOS DE EVIDENCIA (${fotos.length})`, { x: MARGIN, y, size: 8.5, font: bold, color: NAVY });
    y -= 12;

    const gap = 10;
    const colW = (contentW - gap) / 2;
    const photoH = 130;

    let downloaded: { img: any; caption: string }[] = [];
    if (supabase) {
      for (const f of fotos) {
        try {
          const { data: blob, error: dlErr } = await supabase.storage.from('evidencias').download(f.path);
          if (dlErr || !blob) continue;
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const img = await embedPhoto(bytes);
          if (img) downloaded.push({ img, caption: f.caption });
        } catch {
          // si una foto falla, se omite y se sigue con las demás
        }
      }
    }

    for (let i = 0; i < downloaded.length; i += 2) {
      const par = downloaded.slice(i, i + 2);
      const capLines = par.map((p) => wrapText(p.caption || '(sin comentario)', font, 7.5, colW - 8));
      const maxCapLines = Math.max(...capLines.map((l) => l.length));
      const rowH = photoH + 6 + maxCapLines * 10 + 8;

      ensureSpace(rowH);
      const rowTop = y;

      par.forEach((p, j) => {
        const x = MARGIN + j * (colW + gap);
        const scale = Math.min((colW - 8) / p.img.width, (photoH - 8) / p.img.height);
        const w = p.img.width * scale;
        const h = p.img.height * scale;
        boxBorder(x, rowTop, colW, photoH);
        page.drawImage(p.img, { x: x + (colW - w) / 2, y: rowTop - photoH + (photoH - h) / 2, width: w, height: h });
        let cy = rowTop - photoH - 12;
        (capLines[j] || []).forEach((line) => {
          page.drawText(line, { x: x + 4, y: cy, size: 7.5, font, color: NAVY });
          cy -= 10;
        });
      });

      y = rowTop - rowH;
    }

    if (supabase && downloaded.length < fotos.length) {
      page.drawText(
        `(${fotos.length - downloaded.length} foto(s) no se pudieron incluir en el PDF — disponibles en la plataforma)`,
        { x: MARGIN, y, size: 7, font, color: GRAY_TEXT }
      );
      y -= 12;
    }
    if (!supabase) {
      page.drawText('Fotos disponibles en la plataforma.', { x: MARGIN, y, size: 8, font, color: GRAY_TEXT });
      y -= 12;
    }
    y -= 6;
  }

  // ================= FIRMAS =================
  if (y > MARGIN + SIGNATURE_ZONE_H + 40) {
    y = MARGIN + SIGNATURE_ZONE_H;
  } else if (y < MARGIN + SIGNATURE_ZONE_H) {
    newPage();
    y = MARGIN + SIGNATURE_ZONE_H;
  }
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + contentW, y }, thickness: 0.75, color: GRAY_LINE });
  y -= 14;
  page.drawText('FIRMAS', { x: MARGIN, y, size: 8.5, font: bold, color: NAVY });
  y -= 12;

  const sigW = (contentW - 16) / 2;
  const sigBoxH = 60;

  async function drawSignature(x: number, label: string, name: string, dataUrl: string | null | undefined) {
    page.drawText(label.toUpperCase(), { x, y, size: 6.5, font: bold, color: GRAY_TEXT });
    page.drawText(name || '—', { x, y: y - 10, size: 8.5, font, color: NAVY, maxWidth: sigW });
    boxBorder(x, y - 18, sigW, sigBoxH);
    if (dataUrl && dataUrl.startsWith('data:image')) {
      try {
        const base64 = dataUrl.split(',')[1];
        const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
        const img = await pdfDoc.embedPng(bytes);
        const scale = Math.min((sigW - 10) / img.width, (sigBoxH - 10) / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        page.drawImage(img, { x: x + (sigW - w) / 2, y: y - 18 - sigBoxH + (sigBoxH - h) / 2, width: w, height: h });
      } catch {
        // dejar el espacio en blanco si falla
      }
    } else {
      page.drawText('Sin firma', { x: x + 8, y: y - 18 - sigBoxH / 2 - 3, size: 8, font, color: GRAY_TEXT });
    }
  }

  await drawSignature(MARGIN, 'Ing. responsable de ejecución', data.firmaIngNombre, data.firmaIngData);
  await drawSignature(MARGIN + sigW + 16, 'Nombre, fecha y firma cliente', `${data.firmaClienteNombre || '—'}${data.firmaClienteFecha ? ' · ' + data.firmaClienteFecha : ''}`, data.firmaClienteData);

  // La revisión interna solo se muestra cuando ya está aprobada — es un
  // paso de control de calidad propio, no algo que el cliente necesite ver
  // como "pendiente" en su copia del reporte.
  if (data.firmaRevisionData) {
    const revY = y - 18 - sigBoxH - 14;
    page.drawText('REVISIÓN FINAL', { x: MARGIN, y: revY, size: 6.5, font: bold, color: GRAY_TEXT });
    page.drawText(`Aprobado por ${data.firmaRevisionNombre || MARCA.revisor} · ${data.firmaRevisionFecha || ''}`, {
      x: MARGIN + 100, y: revY, size: 8.5, font: bold, color: TEAL_DARK,
    });
  }

  page.drawText(`Generado el ${new Date().toLocaleString('es-MX')} · ${MARCA.nombre} · Folio ${report.id.slice(0, 8).toUpperCase()}`, {
    x: MARGIN, y: MARGIN / 2, size: 6.5, font, color: GRAY_TEXT,
  });

  // ================= ANEXO: FORMATOS DE MANTENIMIENTO =================
  // Cada formato empieza en hoja nueva, después del reporte y sus firmas.
  const formatosMtto: FormatoLlenado[] = Array.isArray(data.formatosMtto) ? data.formatosMtto : [];
  const folio = report.id.slice(0, 8).toUpperCase();
  for (const f of formatosMtto) {
    await drawAnexo(f);
  }

  async function drawAnexo(f: FormatoLlenado) {
    const BOTTOM = MARGIN + 24;
    let hoja = 1;
    function pie() {
      page.drawText(`Anexo al reporte de servicio · Folio ${folio} · ${f.titulo} · Hoja ${hoja}`, {
        x: MARGIN, y: MARGIN / 2, size: 6.5, font, color: GRAY_TEXT,
      });
    }
    function hojaNueva() {
      pie();
      hoja++;
      newPage();
    }
    function espacio(needed: number): boolean {
      if (y - needed < BOTTOM) {
        hojaNueva();
        return true;
      }
      return false;
    }

    newPage();
    // Encabezado del anexo
    const top = y;
    drawBadge(page, display, MARGIN, top, 34);
    page.drawText(MARCA_MAYUS, { x: MARGIN + 44, y: top - 13, size: 12, font: display, color: NAVY });
    page.drawText('FORMATO DE MANTENIMIENTO PREVENTIVO', { x: PAGE_W - MARGIN - 250, y: top - 10, size: 12.5, font: display, color: NAVY });
    page.drawText(`Anexo al reporte · Folio ${folio}`, { x: PAGE_W - MARGIN - 250, y: top - 23, size: 7.5, font, color: GRAY_TEXT });
    y = top - 48;
    page.drawText(f.titulo, { x: MARGIN, y, size: 15, font: display, color: NAVY, maxWidth: contentW });
    y -= 14;
    page.drawText(`${report.empresa_cliente || '—'}  ·  Servicio del ${report.fecha || '—'}  ·  Visita ${ETIQUETA_FRECUENCIA[f.visita] || f.visita}`, {
      x: MARGIN, y, size: 8.5, font, color: GRAY_TEXT, maxWidth: contentW,
    });
    y -= 10;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1.5, color: NAVY });
    y -= 12;

    // Normas de referencia + resumen
    const r = resumenFormato(f);
    const normasLines = f.normas.flatMap((n) => wrapText(`${n.clave}: ${n.nombre}`, font, 8, contentW * 0.62 - 16));
    const nH = 18 + normasLines.length * 11 + 8;
    const resH = 18 + 4 * 12 + 8;
    const boxH = Math.max(nH, resH);
    const nW = contentW * 0.62;
    const rX = MARGIN + nW + 10;
    const rW = contentW - nW - 10;
    boxBorder(MARGIN, y, nW, boxH);
    boxTitle(MARGIN, nW, y, 18, 'Normas de referencia');
    let ny = y - 18 - 11;
    normasLines.forEach((l) => {
      page.drawText(l, { x: MARGIN + 8, y: ny, size: 8, font, color: NAVY });
      ny -= 11;
    });
    boxBorder(rX, y, rW, boxH);
    boxTitle(rX, rW, y, 18, 'Resultado');
    const filasRes: [string, number, typeof VERDE][] = [
      ['Cumple', r.cumple, VERDE],
      ['No cumple', r.noCumple, ROJO],
      ['No aplica', r.na, GRAY_TEXT],
      ['Puntos revisados', r.total, NAVY],
    ];
    let ry2 = y - 18 - 12;
    filasRes.forEach(([label, n, color]) => {
      page.drawText(label, { x: rX + 8, y: ry2, size: 8.5, font, color: NAVY });
      page.drawText(String(n), { x: rX + rW - 8 - bold.widthOfTextAtSize(String(n), 9), y: ry2, size: 9, font: bold, color: n === 0 ? GRAY_TEXT : color });
      ry2 -= 12;
    });
    y -= boxH + 16;

    if (f.areas) {
      const aL = wrapText(`Áreas revisadas: ${f.areas}`, font, 8.5, contentW);
      aL.forEach((l) => {
        page.drawText(l, { x: MARGIN, y, size: 8.5, font, color: NAVY });
        y -= 12;
      });
      y -= 4;
    }

    // Lista de cotejo
    const cols = [
      { label: '#', w: 0.05 },
      { label: 'COMPONENTE / ACTIVIDAD / CRITERIO', w: 0.6 },
      { label: 'FREC.', w: 0.1 },
      { label: 'MEDICIÓN', w: 0.12 },
      { label: 'RESULTADO', w: 0.13 },
    ];
    function encabezadoTabla() {
      const h = 16;
      page.drawRectangle({ x: MARGIN, y: y - h, width: contentW, height: h, color: NAVY });
      let cx = MARGIN;
      cols.forEach((c) => {
        page.drawText(c.label, { x: cx + 5, y: y - 11, size: 6.8, font: bold, color: WHITE });
        cx += contentW * c.w;
      });
      y -= h;
    }
    espacio(40);
    encabezadoTabla();
    const textW = contentW * cols[1].w - 10;
    f.puntos.forEach((p, i) => {
      const compL = wrapText(p.componente.toUpperCase(), bold, 7, textW);
      const actL = wrapText(p.actividad, font, 8, textW);
      const critL = wrapText(`Criterio: ${p.criterio}${p.ref ? ` (${p.ref})` : ''}`, font, 7, textW);
      const notaL = p.resultado === 'no_cumple' && p.nota ? wrapText(`Hallazgo: ${p.nota}`, bold, 7.5, textW) : [];
      const valL = wrapText(p.valor || '—', font, 8, contentW * cols[3].w - 10);
      const h = 6 + compL.length * 9 + actL.length * 10 + critL.length * 9 + notaL.length * 10 + 5;
      if (espacio(h)) encabezadoTabla();
      const rowTop = y;
      if (i % 2 === 1) page.drawRectangle({ x: MARGIN, y: rowTop - h, width: contentW, height: h, color: rgb(0.96, 0.97, 0.97) });
      let tx = MARGIN;
      page.drawText(String(i + 1), { x: tx + 5, y: rowTop - 13, size: 8, font: bold, color: NAVY });
      tx += contentW * cols[0].w;
      let ty = rowTop - 12;
      compL.forEach((l) => { page.drawText(l, { x: tx + 5, y: ty, size: 7, font: bold, color: TEAL_DARK }); ty -= 9; });
      ty -= 1;
      actL.forEach((l) => { page.drawText(l, { x: tx + 5, y: ty, size: 8, font, color: NAVY }); ty -= 10; });
      critL.forEach((l) => { page.drawText(l, { x: tx + 5, y: ty, size: 7, font, color: GRAY_TEXT }); ty -= 9; });
      notaL.forEach((l) => { page.drawText(l, { x: tx + 5, y: ty - 1, size: 7.5, font: bold, color: ROJO }); ty -= 10; });
      tx += contentW * cols[1].w;
      page.drawText(ETIQUETA_FRECUENCIA[p.frecuencia] || p.frecuencia, { x: tx + 5, y: rowTop - 13, size: 7.5, font, color: NAVY });
      tx += contentW * cols[2].w;
      let vy = rowTop - 13;
      valL.forEach((l) => { page.drawText(l, { x: tx + 5, y: vy, size: 8, font, color: NAVY }); vy -= 10; });
      tx += contentW * cols[3].w;
      const res = p.resultado ? ETIQUETA_RESULTADO[p.resultado] : 'Sin marcar';
      const color = p.resultado === 'cumple' ? VERDE : p.resultado === 'no_cumple' ? ROJO : GRAY_TEXT;
      const bw = bold.widthOfTextAtSize(res, 7.5) + 10;
      page.drawRectangle({ x: tx + 4, y: rowTop - 17, width: bw, height: 13, color, opacity: p.resultado ? 1 : 0.15 });
      page.drawText(res, { x: tx + 9, y: rowTop - 13, size: 7.5, font: bold, color: p.resultado ? WHITE : GRAY_TEXT });
      page.drawLine({ start: { x: MARGIN, y: rowTop - h }, end: { x: MARGIN + contentW, y: rowTop - h }, thickness: 0.4, color: GRAY_LINE });
      y = rowTop - h;
    });
    y -= 12;

    // Recomendaciones
    if (f.recomendaciones) {
      const recL = wrapText(f.recomendaciones, font, 9, contentW - 16);
      const h = 18 + recL.length * 13 + 8;
      espacio(h + 6);
      boxBorder(MARGIN, y, contentW, h);
      boxTitle(MARGIN, contentW, y, 18, 'Acciones correctivas recomendadas');
      let ry = y - 18 - 11;
      recL.forEach((l) => { page.drawText(l, { x: MARGIN + 8, y: ry, size: 9, font, color: NAVY }); ry -= 13; });
      y -= h + 10;
    }

    // Nota de alcance y firmas
    const notaL = wrapText(
      `${f.nota} Este formato registra la inspección y pruebas realizadas en la fecha indicada; no constituye un dictamen ni una certificación de cumplimiento normativo.`,
      font, 7, contentW,
    );
    const firmasH = 14 + 10 + 60 + 8;
    espacio(notaL.length * 9 + 8 + firmasH);
    notaL.forEach((l) => { page.drawText(l, { x: MARGIN, y, size: 7, font, color: GRAY_TEXT }); y -= 9; });
    y -= 14;
    await drawSignature(MARGIN, 'Técnico responsable', data.firmaIngNombre, data.firmaIngData);
    await drawSignature(MARGIN + sigW + 16, 'Cliente / responsable del sitio', `${data.firmaClienteNombre || '—'}${data.firmaClienteFecha ? ' · ' + data.firmaClienteFecha : ''}`, data.firmaClienteData);
    y -= 18 + 60;
    pie();
  }

  return pdfDoc.save();
}
