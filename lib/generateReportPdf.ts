import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { LOGO_BADGE_BASE64, ICON_STRIP_BASE64 } from './brandAssets';

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

const NAVY = rgb(0.06, 0.15, 0.23);
const TEAL_DARK = rgb(0.07, 0.25, 0.21);
const GRAY_LINE = rgb(0.55, 0.55, 0.55);
const GRAY_TEXT = rgb(0.42, 0.48, 0.5);
const WHITE = rgb(1, 1, 1);

const MARGIN = 34;
const PAGE_W = 612;
const PAGE_H = 792;
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
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let logoImg = null as Awaited<ReturnType<typeof pdfDoc.embedPng>> | null;
  try {
    logoImg = await pdfDoc.embedPng(Buffer.from(LOGO_BADGE_BASE64, 'base64'));
  } catch {
    logoImg = null;
  }
  let stripImg = null as Awaited<ReturnType<typeof pdfDoc.embedPng>> | null;
  try {
    stripImg = await pdfDoc.embedPng(Buffer.from(ICON_STRIP_BASE64, 'base64'));
  } catch {
    stripImg = null;
  }

  const data = report.data || {};
  const contentW = PAGE_W - MARGIN * 2;
  let y = PAGE_H - MARGIN;

  function newPage() {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
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
  const headerH = 52;
  if (logoImg) {
    const logoH = 46;
    const scale = logoH / logoImg.height;
    page.drawImage(logoImg, { x: MARGIN, y: y - logoH, width: logoImg.width * scale, height: logoH });
  } else {
    page.drawText('CLAVE INTELIGENTE', { x: MARGIN, y: y - 20, size: 14, font: bold, color: NAVY });
  }
  page.drawText('REPORTE DE SERVICIO', { x: PAGE_W - MARGIN - 210, y: y - 4, size: 13, font: bold, color: NAVY });
  page.drawText(`Clave de formato: ${data.claveFormato || 'CRM0851'}`, { x: PAGE_W - MARGIN - 210, y: y - 19, size: 8, font, color: GRAY_TEXT });
  page.drawText(`Folio: ${report.id.slice(0, 8).toUpperCase()}`, { x: PAGE_W - MARGIN - 210, y: y - 30, size: 8, font, color: GRAY_TEXT });
  y -= headerH;
  if (stripImg) {
    const stripH = 18;
    const scale = stripH / stripImg.height;
    page.drawImage(stripImg, { x: MARGIN, y: y - stripH, width: stripImg.width * scale, height: stripH });
    y -= stripH + 8;
  } else {
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: GRAY_LINE });
    y -= 12;
  }

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

  async function embedPhoto(bytes: Uint8Array) {
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

  const revY = y - 18 - sigBoxH - 14;
  page.drawText('REVISIÓN FINAL', { x: MARGIN, y: revY, size: 6.5, font: bold, color: GRAY_TEXT });
  if (data.firmaRevisionData) {
    page.drawText(`Aprobado por ${data.firmaRevisionNombre || 'Ing. Everardo Sánchez'} · ${data.firmaRevisionFecha || ''}`, {
      x: MARGIN + 100, y: revY, size: 8.5, font: bold, color: TEAL_DARK,
    });
  } else {
    page.drawText('PENDIENTE DE FIRMA — ING. EVERARDO SÁNCHEZ', {
      x: MARGIN + 100, y: revY, size: 8.5, font: bold, color: rgb(0.75, 0.42, 0.15),
    });
  }

  page.drawText(`Generado el ${new Date().toLocaleString('es-MX')} · Clave Inteligente · Folio ${report.id.slice(0, 8).toUpperCase()}`, {
    x: MARGIN, y: MARGIN / 2, size: 6.5, font, color: GRAY_TEXT,
  });

  return pdfDoc.save();
}
