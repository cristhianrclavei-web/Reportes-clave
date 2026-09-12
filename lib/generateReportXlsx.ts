import ExcelJS from 'exceljs';
import { REPORT_TEMPLATE_XLSX_BASE64 } from './reportTemplateBase64';

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

const SEG_XLSX_CELL: Record<string, string> = {
  'CCTV': 'F23',
  'Automatización': 'G23',
  'Alarma&Det': 'F24',
  'Control de acceso': 'G24',
  'Alarma intrusión': 'F25',
  'Red contra incendio': 'G25',
  'Supresión': 'F26',
  'Inst. eléctricas': 'G26',
  'Paneles solares': 'F27',
  'Otra': 'G27',
};

function setValueShrinkToFit(
  cell: ExcelJS.Cell,
  value: string,
  approxCharWidth: number,
  baseSize = 10,
  minSize = 6
) {
  cell.value = value;
  cell.alignment = { ...(cell.alignment || {}), wrapText: false, shrinkToFit: true, vertical: 'middle' };
  const len = (value || '').length;
  let size = baseSize;
  if (len > approxCharWidth) {
    const ratio = approxCharWidth / len;
    size = Math.max(minSize, Math.round(baseSize * ratio));
  }
  cell.font = { ...(cell.font || {}), size, name: cell.font?.name || 'Calibri' };
}

export async function generateReportXlsx(report: ReportRow): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const buf = Buffer.from(REPORT_TEMPLATE_XLSX_BASE64, 'base64');
  await workbook.xlsx.load(buf as any);
  const ws = workbook.getWorksheet('REPORTE');
  if (!ws) throw new Error('No se encontró la hoja REPORTE en la plantilla');
  const sheet = ws;

  const data = report.data || {};

  // ---------- Personal que realiza el servicio ----------
  // Usa la lista manual (Ing a cargo + personal adicional) si existe; si no, cae
  // al técnico detectado por la cuenta con la que se inició sesión (reportes viejos).
  const manualPersonal: string[] = data.personal && data.personal.length > 0 ? data.personal : [];
  const tecnicos = manualPersonal.length > 0 ? manualPersonal : techNames(report.profiles);
  const personalRows = [9, 10, 11, 12, 13, 14];
  personalRows.forEach((row, i) => {
    if (tecnicos[i]) {
      setValueShrinkToFit(sheet.getCell(`B${row}`), tecnicos[i], 34);
    }
  });

  // ---------- Vehículo / Placas / Manejado por (texto combinado, como en la plantilla) ----------
  if (data.vehiculo) {
    setValueShrinkToFit(sheet.getCell('A15'), `VEHICULO: ${data.vehiculo}`, 22, 10, 7);
  }
  if (data.manejadoPor) {
    setValueShrinkToFit(sheet.getCell('C15'), `MANEJADO POR: ${data.manejadoPor}`, 24, 10, 7);
  }
  if (data.placas) {
    setValueShrinkToFit(sheet.getCell('A16'), `Placas: ${data.placas}`, 22, 10, 7);
  }

  // ---------- Datos del servicio (panel derecho) ----------
  setValueShrinkToFit(sheet.getCell('G8'), data.claveFormato || 'CRM0851', 14);
  setValueShrinkToFit(sheet.getCell('G9'), data.listaConceptos || '', 22);
  setValueShrinkToFit(sheet.getCell('G10'), report.fecha || '', 14);
  setValueShrinkToFit(sheet.getCell('G11'), data.horaLlegada || '', 14);
  setValueShrinkToFit(sheet.getCell('G12'), data.horaSalida || '', 14);
  setValueShrinkToFit(sheet.getCell('G13'), report.empresa_cliente || '', 22);
  setValueShrinkToFit(sheet.getCell('G14'), data.ordCompra || '', 14);

  // ---------- Contacto / Puesto ----------
  if (data.contactoUsuario) {
    setValueShrinkToFit(sheet.getCell('A18'), `CONTACTO/USUARIO: ${data.contactoUsuario}`, 34, 10, 7);
  }
  if (data.puestoArea) {
    sheet.mergeCells('F18:G18');
    setValueShrinkToFit(sheet.getCell('F18'), `PUESTO/ÁREA: ${data.puestoArea}`, 22, 10, 7);
  }

  // ---------- Tipo de servicio (resaltar la opción elegida) ----------
  const tipoCellMap: Record<string, string> = {
    'Instalación nueva': 'B20',
    'Mantenimiento': 'D20',
    'Otro': 'F20',
  };
  const subTipoCellMap: Record<string, string> = {
    Correctivo: 'D21',
    Preventivo: 'E21',
  };
  if (report.tipo_servicio && tipoCellMap[report.tipo_servicio]) {
    const c = sheet.getCell(tipoCellMap[report.tipo_servicio]);
    c.font = { ...(c.font || {}), bold: true, color: { argb: 'FF15614F' }, size: 11 };
    if (report.tipo_servicio === 'Otro' && data.tipoServicioOtroTexto) {
      c.value = `Otro: ${data.tipoServicioOtroTexto}`;
    }
  }
  if (report.sub_tipo_servicio && subTipoCellMap[report.sub_tipo_servicio]) {
    const c = sheet.getCell(subTipoCellMap[report.sub_tipo_servicio]);
    c.font = { ...(c.font || {}), bold: true, color: { argb: 'FF15614F' }, size: 11 };
  }

  // ---------- Tubería ----------
  const tuberiaRowMap: Record<string, number> = { Roscada: 23, Ajuste: 24, Ranurada: 25, Otra: 26 };
  const tuberiaData: Record<string, { medida: string; metros: string; especifica?: string }> = data.tuberia || {};
  Object.entries(tuberiaData).forEach(([tipo, v]) => {
    const row = tuberiaRowMap[tipo];
    if (!row) return;
    if (tipo === 'Otra') {
      setValueShrinkToFit(sheet.getCell(`B${row}`), v.especifica ? `Otra: ${v.especifica}` : 'Otra', 12, 9, 6);
    }
    if (v.medida) setValueShrinkToFit(sheet.getCell(`D${row}`), v.medida, 12, 9, 6);
    if (v.metros) setValueShrinkToFit(sheet.getCell(`E${row}`), v.metros, 12, 9, 6);
  });

  // ---------- Sistema de seguridad (resaltar seleccionados + texto "Otra") ----------
  const seg: string[] = data.sistemaSeguridad || [];
  seg.forEach((s) => {
    const coord = SEG_XLSX_CELL[s];
    if (coord) {
      const c = sheet.getCell(coord);
      c.font = { ...(c.font || {}), bold: true, color: { argb: 'FF15614F' } };
    }
  });
  if (seg.includes('Otra') && data.seguridadOtraTexto) {
    const c = sheet.getCell('G27');
    setValueShrinkToFit(c, `OTRA: ${data.seguridadOtraTexto}`, 20, 9, 6);
    c.font = { ...(c.font || {}), bold: true, color: { argb: 'FF15614F' } };
  }

  // ---------- Cable instalado (hasta 2, según el espacio de la plantilla) ----------
  const cablesList: any[] = data.cables && data.cables.length > 0 ? data.cables : [data.cable1, data.cable2].filter(Boolean);
  function writeCable(cable: { tipo?: string; calibre?: string; metros?: string } | null, colStart: string) {
    if (!cable) return;
    const rowMap: [string, string | undefined][] = [
      ['29', cable.tipo],
      ['30', cable.calibre],
      ['31', cable.metros],
    ];
    const colEnd = colStart === 'B' ? 'D' : 'G';
    rowMap.forEach(([row, value]) => {
      if (!value) return;
      sheet.mergeCells(`${colStart}${row}:${colEnd}${row}`);
      setValueShrinkToFit(sheet.getCell(`${colStart}${row}`), value, 14, 9, 6);
    });
  }
  writeCable(cablesList[0] || null, 'B');
  writeCable(cablesList[1] || null, 'F');

  // ---------- Montaje de soportería y equipo (hasta 8 filas, 34-41) ----------
  const equipos: any[] = data.equipos || [];
  const eqStartRow = 34;
  const eqMaxRows = 8;
  equipos.slice(0, eqMaxRows).forEach((eq, i) => {
    const row = eqStartRow + i;
    if (eq.cant) setValueShrinkToFit(sheet.getCell(`A${row}`), String(eq.cant), 6);
    if (eq.desc) setValueShrinkToFit(sheet.getCell(`C${row}`), eq.desc, 18);
    if (eq.modelo) setValueShrinkToFit(sheet.getCell(`E${row}`), eq.modelo, 12);
    if (eq.marca) setValueShrinkToFit(sheet.getCell(`F${row}`), eq.marca, 12);
    if (eq.serie) setValueShrinkToFit(sheet.getCell(`G${row}`), eq.serie, 18);
  });

  // ---------- Descripción de actividades realizadas (filas 44-54, una por fila) ----------
  const actividades: string[] = data.actividades || [];
  const actStartRow = 44;
  const actMaxRows = 11;
  actividades.slice(0, actMaxRows).forEach((act, i) => {
    const row = actStartRow + i;
    setValueShrinkToFit(sheet.getCell(`A${row}`), `${i + 1}. ${act}`, 130, 10, 7);
  });

  // ---------- Caso de problema en equipo o instalación ----------
  // Si el reporte no tiene ningún punto, esas filas se OCULTAN por completo
  // (no solo se dejan en blanco), así no aparecen en el Excel. El resto del
  // contenido (Observaciones, Firmas) se queda en sus filas de siempre.
  const puntos: Array<{ definicion?: string; descripcion?: string; analisis?: string; plan?: string; resultados?: string; pasosFuturos?: string }> =
    data.casoPuntos || [];

  const CASO_FIRST_ROW = 55; // encabezado "CASO DE PROBLEMA EN EQUIPO O INSTALACION"
  const CASO_LAST_ROW = 67; // última fila del bloque (6 pares de subtítulo + contenido)

  if (puntos.length === 0) {
    for (let r = CASO_FIRST_ROW; r <= CASO_LAST_ROW; r++) {
      sheet.getRow(r).hidden = true;
    }
  } else {
    const casoFieldRows: Record<string, { label: number; content: number }> = {
      definicion: { label: 56, content: 57 },
      descripcion: { label: 58, content: 59 },
      analisis: { label: 60, content: 61 },
      plan: { label: 62, content: 63 },
      resultados: { label: 64, content: 65 },
      pasosFuturos: { label: 66, content: 67 },
    };
    (Object.keys(casoFieldRows) as Array<keyof typeof casoFieldRows>).forEach((field) => {
      const { label: labelRow, content: contentRow } = casoFieldRows[field];

      // Subtítulo: negrita, tamaño 10 (se deja el texto que ya trae la plantilla)
      const labelCell = sheet.getCell(`A${labelRow}`);
      labelCell.font = { name: labelCell.font?.name || 'Calibri', size: 10, bold: true };

      const lines = puntos
        .map((p, i) => ((p as any)[field] ? `${i + 1}. ${(p as any)[field]}` : ''))
        .filter(Boolean);
      if (lines.length > 0) {
        const contentCell = sheet.getCell(`A${contentRow}`);
        contentCell.value = lines.join('\n');
        contentCell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
        contentCell.font = { name: 'Calibri', size: 8 };
        // Alto de fila suficiente para mostrar cada punto en su propia línea
        const row = sheet.getRow(contentRow);
        row.height = Math.max(15, lines.length * 12 + 4);
      }
    });
  }

  // ---------- Observaciones ----------
  if (data.observaciones) {
    sheet.mergeCells('C70:G72');
    const cell = sheet.getCell('C70');
    cell.value = data.observaciones;
    cell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
    cell.font = { name: 'Calibri', size: 10 };
  }

  // ---------- Firmas (nombre + imagen) ----------
  async function addSignature(dataUrl: string | null | undefined, imgRange: { tl: { col: number; row: number }; br: { col: number; row: number } }) {
    if (dataUrl && dataUrl.startsWith('data:image')) {
      try {
        const base64 = dataUrl.split(',')[1];
        const imgId = workbook.addImage({ base64, extension: 'png' });
        sheet.addImage(imgId, imgRange as any);
      } catch {
        // si falla la imagen, se deja el espacio en blanco
      }
    }
  }
  if (data.firmaIngNombre) {
    setValueShrinkToFit(sheet.getCell('B77'), data.firmaIngNombre, 26, 9, 7);
  }
  await addSignature(data.firmaIngData, { tl: { col: 1, row: 73 }, br: { col: 4, row: 76 } });

  if (data.firmaClienteNombre) {
    setValueShrinkToFit(sheet.getCell('F77'), data.firmaClienteNombre, 18, 9, 7);
  }
  await addSignature(data.firmaClienteData, { tl: { col: 5, row: 73 }, br: { col: 7, row: 76 } });

  // Nota: esta plantilla ya no incluye una casilla de "Firma de revisión" —
  // ese dato se sigue guardando y mostrando en la app y el PDF.

  const outBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(outBuffer as any);
}
