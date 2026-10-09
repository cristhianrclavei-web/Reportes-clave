import { tuberiasDe, cablesDe, soporteriaDe, textoTuberia, textoCable, textoSoporteria } from './materialesReporte';
import { fechaDMA } from './etiquetaMantenimiento';
import { PDFDocument, rgb } from 'pdf-lib';
import { comprimirFoto } from './pdfFotos';
import {
  NAVY, TEAL_DARK, GRAY_LINE, GRAY_TEXT, WHITE, VERDE, ROJO, LINEA_MARCA,
  MARGIN, PAGE_W, PAGE_H,
  embedBrandFonts, drawBadge, drawWordmark, drawIconStrip, drawWatermark,
} from './pdfBranding';
import { MARCA, MARCA_MAYUS } from './marca';
import QRCode from 'qrcode';
import { urlVerificacion } from './etiquetaMantenimiento';
import {
  FormatoLlenado, ETIQUETA_FRECUENCIA, ETIQUETA_RESULTADO, ETIQUETA_RESULTADO_DISP, resumenFormato,
  resumenDispositivos, resumenPorTipo, tipoDispositivo,
} from './formatosMantenimiento';

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
  const wordmarkW = drawWordmark(page, display, wordX, headerTop - 15, wordSize);
  const lineY = headerTop - 24;
  page.drawLine({ start: { x: wordX, y: lineY }, end: { x: wordX + wordmarkW, y: lineY }, thickness: 1, color: LINEA_MARCA });
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
  page.drawText(`Servicio del ${fechaDMA(report.fecha)}`, { x: MARGIN, y: clienteY - 14, size: 8.5, font, color: GRAY_TEXT });

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
    ['Fecha', fechaDMA(report.fecha)],
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
  // Tubería: formato nuevo (lista) o viejo (por tipo), ver lib/materialesReporte.
  const tuberiaLineas = tuberiasDe(data).map((t) => wrapText(textoTuberia(t), font, 8.5, contentW * 0.4 - 16));
  const segSelected: string[] = (data.sistemaSeguridad || []).map((s: string) => s.replace('Alarma&Det', 'Alarma & Det.'));

  const tsLeftW = contentW * 0.4;
  const tsRightW = contentW - tsLeftW - 12;
  const tsRightX = MARGIN + tsLeftW + 12;
  const tubH = 18 + Math.max(1, tuberiaLineas.reduce((n, l) => n + l.length, 0)) * 13 + 10;
  // Las casillas van en dos columnas para no gastar media hoja.
  const segFilas = Math.ceil(SEG_OPTIONS.length / 2);
  const segH = 18 + segFilas * 14 + 8 + (segSelected.includes('Otra') && data.seguridadOtraTexto ? 13 : 0);
  const tsRowH = Math.max(tubH, segH);

  ensureSpace(tsRowH + 10);
  const tsTop = y;
  boxBorder(MARGIN, tsTop, tsLeftW, tsRowH);
  boxTitle(MARGIN, tsLeftW, tsTop, 18, 'Tubería');
  let ty = tsTop - 18 - 13;
  if (tuberiaLineas.length === 0) {
    page.drawText('Sin tubería', { x: MARGIN + 8, y: ty, size: 8.5, font, color: GRAY_TEXT });
  }
  tuberiaLineas.forEach((lineas) => {
    lineas.forEach((l, k) => {
      page.drawText(`${k === 0 ? '• ' : '  '}${l}`, { x: MARGIN + 8, y: ty, size: 8.5, font, color: NAVY });
      ty -= 13;
    });
  });

  boxBorder(tsRightX, tsTop, tsRightW, tsRowH);
  boxTitle(tsRightX, tsRightW, tsTop, 18, 'Sistema de seguridad');
  SEG_OPTIONS.forEach((opt, i) => {
    const cy = tsTop - 18 - 12 - (i % segFilas) * 14;
    checkbox(tsRightX + 8 + (i >= segFilas ? tsRightW / 2 : 0), cy - 6, segSelected.includes(opt), opt);
  });
  if (segSelected.includes('Otra') && data.seguridadOtraTexto) {
    const otraY = tsTop - 18 - 12 - segFilas * 14;
    page.drawText(`Otra: ${data.seguridadOtraTexto}`, { x: tsRightX + 8, y: otraY, size: 8, font, color: NAVY, maxWidth: tsRightW - 16 });
  }
  y = tsTop - tsRowH - 10;

  // ================= CABLE INSTALADO / SOPORTERÍA Y FIJACIÓN =================
  // Cuadro con un renglón por material (viñeta y texto ajustado al ancho).
  const cuadroLista = (titulo: string, textos: string[]) => {
    if (textos.length === 0) return;
    const lineas = textos.map((t) => wrapText(t, font, 8.5, contentW - 24));
    const h = 18 + lineas.reduce((n, l) => n + l.length, 0) * 13 + 10;
    ensureSpace(h + 10);
    const top = y;
    boxBorder(MARGIN, top, contentW, h);
    boxTitle(MARGIN, contentW, top, 18, titulo);
    let ly = top - 18 - 13;
    lineas.forEach((ls) => ls.forEach((l, k) => {
      page.drawText(`${k === 0 ? '• ' : '  '}${l}`, { x: MARGIN + 8, y: ly, size: 8.5, font, color: NAVY });
      ly -= 13;
    }));
    y = top - h - 10;
  };
  cuadroLista('Cable instalado', cablesDe(data).map(textoCable));
  cuadroLista('Montaje de soportería y fijación', soporteriaDe(data).map(textoSoporteria));

  // ================= MONTAJE DE EQUIPO =================
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
  // Reportes viejos (sin sección de soportería) traían todo junto aquí.
  boxTitle(MARGIN, contentW, eqTop, 18, Array.isArray(data.soporteria) ? 'Montaje de equipo' : 'Montaje de soportería y equipo');
  let cx = MARGIN;
  const headerRowY = eqTop - 18;
  eqCols.forEach((c) => {
    page.drawText(c.label, { x: cx + 6, y: headerRowY - rowH + 5, size: 7, font: bold, color: GRAY_TEXT });
    cx += contentW * c.w;
    page.drawLine({ start: { x: cx, y: headerRowY }, end: { x: cx, y: equipos.length === 0 ? headerRowY - rowH : eqTop - eqH }, thickness: 0.5, color: GRAY_LINE });
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
  // Un video sale con su portada y un aviso: el PDF no lo puede reproducir.
  const fotos = fotosRaw.map((f) => (typeof f === 'string'
    ? { path: f, caption: '' }
    : { path: f.path, caption: f.video ? `VIDEO${f.dur ? ` (${Math.floor(f.dur / 60)}:${String(Math.round(f.dur) % 60).padStart(2, '0')})` : ''} · disponible en la plataforma${f.caption ? ` — ${f.caption}` : ''}` : f.caption || '' }));

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
  await drawFirmaCliente(MARGIN + sigW + 16, 'Nombre, fecha y firma cliente');

  // Firma del cliente: en sitio, a distancia (enlace) o pendiente porque no
  // estaba — en ese caso se muestra quién recibió y su firma, si la dio.
  async function drawFirmaCliente(x: number, label: string) {
    const ausente = data.clienteAusente;
    if (data.firmaClienteData || !ausente) {
      await drawSignature(x, label, `${data.firmaClienteNombre || '—'}${data.firmaClienteFecha ? ' · ' + data.firmaClienteFecha : ''}`, data.firmaClienteData);
      if (data.firmaClienteData && data.firmaRemota?.firmadoEn) {
        page.drawText('Firmado a distancia mediante enlace', { x: x + 4, y: y - 18 - sigBoxH - 8, size: 6.5, font, color: GRAY_TEXT });
      }
      return;
    }
    const recibio = [ausente.recibioNombre, ausente.recibioPuesto ? `(${ausente.recibioPuesto})` : ''].filter(Boolean).join(' ');
    await drawSignature(x, 'Cliente ausente — firma pendiente', recibio ? `Recibió: ${recibio}` : 'Sin persona que recibiera', ausente.recibioFirma);
    if (!ausente.recibioFirma) {
      // Tapa el «Sin firma» genérico con el motivo.
      page.drawRectangle({ x: x + 4, y: y - 18 - sigBoxH / 2 - 8, width: sigW - 8, height: 14, color: WHITE });
    }
    const motivoL = wrapText(`Pendiente de firma del cliente${ausente.motivo ? `: ${ausente.motivo}` : ''}.`, font, 7, sigW - 12);
    motivoL.slice(0, 2).forEach((l, i) => {
      page.drawText(l, { x: x + 6, y: ausente.recibioFirma ? y - 18 - sigBoxH - 8 - i * 8 : y - 18 - sigBoxH / 2 - 3 - i * 9, size: 7, font: ausente.recibioFirma ? font : bold, color: ausente.recibioFirma ? GRAY_TEXT : ROJO });
    });
  }

  // La revisión interna solo se muestra cuando ya está aprobada — es un
  // paso de control de calidad propio, no algo que el cliente necesite ver
  // como "pendiente" en su copia del reporte.
  if (data.firmaRevisionData) {
    const revY = y - 18 - sigBoxH - 14;
    page.drawText('REVISIÓN FINAL', { x: MARGIN, y: revY, size: 6.5, font: bold, color: GRAY_TEXT });
    page.drawText(`Aprobado por ${data.firmaRevisionNombre || MARCA.revisor} · ${data.firmaRevisionFecha ? fechaDMA(String(data.firmaRevisionFecha).slice(0, 10)) : ''}`, {
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
  let qrImg: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  if (formatosMtto.length > 0 && typeof data.tokenVerificacion === 'string') {
    try {
      const url = await QRCode.toDataURL(urlVerificacion(data.tokenVerificacion), { margin: 0, width: 240, errorCorrectionLevel: 'M' });
      qrImg = await pdfDoc.embedPng(url);
    } catch {
      // sin QR si falla; el anexo sigue igual
    }
  }
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
    // Encabezado del anexo. Con token, QR a la página de verificación (el
    // mismo de la etiqueta) en la esquina.
    const top = y;
    drawBadge(page, display, MARGIN, top, 34);
    drawWordmark(page, display, MARGIN + 44, top - 13, 12);
    const qrW = qrImg ? 40 : 0;
    const tituloX = PAGE_W - MARGIN - 250 - (qrImg ? qrW + 8 : 0);
    page.drawText('FORMATO DE MANTENIMIENTO PREVENTIVO', { x: tituloX, y: top - 10, size: 12.5, font: display, color: NAVY });
    page.drawText(`Anexo al reporte · Folio ${folio}`, { x: tituloX, y: top - 23, size: 7.5, font, color: GRAY_TEXT });
    if (qrImg) {
      page.drawImage(qrImg, { x: PAGE_W - MARGIN - qrW, y: top - qrW + 4, width: qrW, height: qrW });
      page.drawText('Verificar', { x: PAGE_W - MARGIN - qrW + 6, y: top - qrW - 4, size: 6, font, color: GRAY_TEXT });
    }
    y = top - 48;
    page.drawText(f.titulo, { x: MARGIN, y, size: 15, font: display, color: NAVY, maxWidth: contentW });
    y -= 14;
    page.drawText(`${report.empresa_cliente || '—'}  ·  Servicio del ${fechaDMA(report.fecha)}  ·  Visita ${ETIQUETA_FRECUENCIA[f.visita] || f.visita}`, {
      x: MARGIN, y, size: 8.5, font, color: GRAY_TEXT, maxWidth: contentW,
    });
    y -= 10;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1.5, color: NAVY });
    y -= 12;

    // Datos generales del sistema (panel, equipo de prueba…), en dos columnas.
    const camposLlenos = (f.campos || []).filter((c) => (f.datos?.[c.key] || '').trim());
    if (camposLlenos.length > 0) {
      const colW = (contentW - 16 - 12) / 2;
      const celdas = camposLlenos.map((c) => ({ label: c.label.toUpperCase(), lines: wrapText(f.datos![c.key].trim(), font, 8.5, colW) }));
      const filas: (typeof celdas)[] = [];
      for (let k = 0; k < celdas.length; k += 2) filas.push(celdas.slice(k, k + 2));
      const altoFila = (fila: typeof celdas) => 9 + Math.max(...fila.map((c) => c.lines.length)) * 11 + 5;
      const h = 18 + 6 + filas.reduce((a, fila) => a + altoFila(fila), 0) + 2;
      boxBorder(MARGIN, y, contentW, h);
      boxTitle(MARGIN, contentW, y, 18, 'Datos del sistema');
      let dy = y - 18 - 6;
      filas.forEach((fila) => {
        fila.forEach((c, k) => {
          const cx = MARGIN + 8 + k * (colW + 12);
          page.drawText(c.label, { x: cx, y: dy - 7, size: 6.3, font: bold, color: GRAY_TEXT });
          c.lines.forEach((l, m) => page.drawText(l, { x: cx, y: dy - 18 - m * 11, size: 8.5, font, color: NAVY }));
        });
        dy -= altoFila(fila);
      });
      y -= h + 10;
    }

    // Normas de referencia + resumen
    const r = resumenFormato(f);
    const rd = f.dispositivos ? resumenDispositivos(f.dispositivos) : null;
    const normasLines = f.normas.flatMap((n) => wrapText(`${n.clave}: ${n.nombre}`, font, 8, contentW * 0.62 - 16));
    const nH = 18 + normasLines.length * 11 + 8;
    const resH = 18 + (rd ? 7 : 4) * 12 + 8;
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
      ...(rd
        ? ([
            ['Dispositivos probados', rd.pasa + rd.falla, NAVY],
            ['Dispositivos con falla', rd.falla, ROJO],
            ['Dispositivos sin probar', rd.noProbado, ROJO],
          ] as [string, number, typeof VERDE][])
        : []),
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

    if (f.dispositivos && f.dispositivos.length > 0) drawDispositivos(f);

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
    await drawSignature(MARGIN, 'Responsable técnico', data.firmaIngNombre, data.firmaIngData);
    await drawFirmaCliente(MARGIN + sigW + 16, 'Cliente / responsable del sitio');
    y -= 18 + 60;
    pie();

    // Resumen por tipo y registro de pruebas por dispositivo (NFPA 72 14.6).
    function drawDispositivos(fm: FormatoLlenado) {
      const lista = fm.dispositivos || [];
      function tituloSeccion(t: string) {
        page.drawText(t, { x: MARGIN, y: y - 10, size: 10, font: display, color: NAVY });
        y -= 16;
      }

      // --- Resumen por tipo
      const porTipo = resumenPorTipo(lista);
      const tot = resumenDispositivos(lista);
      const colsR = [
        { label: 'TIPO DE DISPOSITIVO', w: 0.4 },
        { label: 'TOTAL', w: 0.12 },
        { label: 'PASAN', w: 0.12 },
        { label: 'FALLAN', w: 0.12 },
        { label: 'SIN PROBAR', w: 0.12 },
        { label: '% PROBADO', w: 0.12 },
      ];
      espacio(16 + 16 + (porTipo.length + 1) * 14 + 10);
      tituloSeccion('Resumen de pruebas por tipo de dispositivo');
      const encR = () => {
        page.drawRectangle({ x: MARGIN, y: y - 16, width: contentW, height: 16, color: NAVY });
        let cx = MARGIN;
        colsR.forEach((c) => { page.drawText(c.label, { x: cx + 5, y: y - 11, size: 6.8, font: bold, color: WHITE }); cx += contentW * c.w; });
        y -= 16;
      };
      encR();
      const filaR = (label: string, x: { total: number; pasa: number; falla: number; noProbado: number }, negrita: boolean, k: number) => {
        const h = 14;
        if (k % 2 === 1) page.drawRectangle({ x: MARGIN, y: y - h, width: contentW, height: h, color: rgb(0.96, 0.97, 0.97) });
        const pct = x.total ? Math.round(((x.pasa + x.falla) / x.total) * 100) : 0;
        const vals = [label, String(x.total), String(x.pasa), String(x.falla), String(x.noProbado), `${pct}%`];
        let cx = MARGIN;
        vals.forEach((v, m) => {
          const color = m === 3 && x.falla ? ROJO : m === 4 && x.noProbado ? ROJO : m === 2 ? VERDE : NAVY;
          page.drawText(v, { x: cx + 5, y: y - 10, size: 8, font: negrita || (m > 0 && m < 5 && v !== '0') ? bold : font, color, maxWidth: contentW * colsR[m].w - 8 });
          cx += contentW * colsR[m].w;
        });
        page.drawLine({ start: { x: MARGIN, y: y - h }, end: { x: MARGIN + contentW, y: y - h }, thickness: 0.4, color: GRAY_LINE });
        y -= h;
      };
      porTipo.forEach((x, k) => filaR(x.tipo.label, x, false, k));
      filaR('TOTAL', tot, true, porTipo.length);
      y -= 14;

      // --- Registro por dispositivo
      const cols = [
        { label: '#', w: 0.05 },
        { label: 'TIPO', w: 0.15 },
        { label: 'DIRECCIÓN', w: 0.1 },
        { label: 'UBICACIÓN', w: 0.24 },
        { label: 'MÉTODO DE PRUEBA', w: 0.25 },
        { label: 'MEDICIÓN', w: 0.09 },
        { label: 'RESULTADO', w: 0.12 },
      ];
      const enc = () => {
        page.drawRectangle({ x: MARGIN, y: y - 16, width: contentW, height: 16, color: NAVY });
        let cx = MARGIN;
        cols.forEach((c) => { page.drawText(c.label, { x: cx + 4, y: y - 11, size: 6.5, font: bold, color: WHITE }); cx += contentW * c.w; });
        y -= 16;
      };
      espacio(16 + 16 + 30);
      tituloSeccion('Registro de pruebas por dispositivo');
      enc();
      const w = (k: number) => contentW * cols[k].w - 8;
      lista.forEach((d, i) => {
        const t = tipoDispositivo(d.tipo);
        const celdas = [
          [String(i + 1)],
          wrapText(t?.label || d.tipo, font, 7.2, w(1)),
          wrapText(d.direccion || '—', bold, 7.5, w(2)),
          wrapText(d.ubicacion || '—', font, 7.5, w(3)),
          wrapText(d.metodo || '—', font, 6.8, w(4)),
          wrapText(d.valor || '—', font, 7.2, w(5)),
        ];
        const obs = d.resultado && d.resultado !== 'pasa' && d.nota
          ? wrapText(`${d.resultado === 'falla' ? 'Falla' : 'Sin probar'}: ${d.nota}`, bold, 7, contentW - contentW * cols[0].w - 8)
          : [];
        const h = 6 + Math.max(...celdas.map((c) => c.length)) * 9 + obs.length * 9 + 5;
        if (espacio(h)) enc();
        const top = y;
        if (i % 2 === 1) page.drawRectangle({ x: MARGIN, y: top - h, width: contentW, height: h, color: rgb(0.96, 0.97, 0.97) });
        let cx = MARGIN;
        celdas.forEach((lines, k) => {
          const size = k === 4 ? 6.8 : k === 1 || k === 5 ? 7.2 : 7.5;
          const fnt = k === 0 || k === 2 ? bold : font;
          lines.forEach((l, m) => page.drawText(l, { x: cx + 4, y: top - 11 - m * 9, size, font: fnt, color: k === 4 ? GRAY_TEXT : NAVY }));
          cx += contentW * cols[k].w;
        });
        const res = d.resultado ? ETIQUETA_RESULTADO_DISP[d.resultado] : 'Sin marcar';
        const color = d.resultado === 'pasa' ? VERDE : d.resultado ? ROJO : GRAY_TEXT;
        const bw = bold.widthOfTextAtSize(res, 7) + 10;
        page.drawRectangle({ x: cx + 3, y: top - 15, width: bw, height: 12, color, opacity: d.resultado === 'no_probado' ? 0.75 : d.resultado ? 1 : 0.15 });
        page.drawText(res, { x: cx + 8, y: top - 11.5, size: 7, font: bold, color: d.resultado ? WHITE : GRAY_TEXT });
        const obsY = top - 6 - Math.max(...celdas.map((c) => c.length)) * 9 - 5;
        obs.forEach((l, m) => page.drawText(l, { x: MARGIN + contentW * cols[0].w + 4, y: obsY - m * 9, size: 7, font: bold, color: ROJO }));
        page.drawLine({ start: { x: MARGIN, y: top - h }, end: { x: MARGIN + contentW, y: top - h }, thickness: 0.4, color: GRAY_LINE });
        y = top - h;
      });
      y -= 12;
    }
  }

  return pdfDoc.save();
}
