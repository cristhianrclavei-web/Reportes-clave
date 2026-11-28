import ExcelJS from 'exceljs';
import { MARCA } from './marca';
import { encabezadoDeMarca, marcaDeAgua } from './logoParaExcel';
import {
  Cotizacion,
  LineaCotizacion,
  agruparPorSistema,
  leyendaIva,
  modoIvaDe,
  opcionesDeCotizacion,
  tituloDeSistema,
} from './cotizaciones';

// La cotización en Excel: mismo contenido y mismo orden que el PDF (datos del
// cliente, una tabla por sistema con su numeración, totales, opciones y
// condiciones), para quien la quiera ajustar o pegar en otro documento.
// Nunca lleva costo ni ganancia: es lo mismo que ve el cliente.

const NAVY = 'FF1F2A44';
const GRIS_LINEA = 'FFBFC5CF';
const GRIS_FONDO = 'FFF1F3F6';
const FORMATO_DINERO = '"$"#,##0.00';

const borde: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: GRIS_LINEA } },
  left: { style: 'thin', color: { argb: GRIS_LINEA } },
  bottom: { style: 'thin', color: { argb: GRIS_LINEA } },
  right: { style: 'thin', color: { argb: GRIS_LINEA } },
};

function fechaLarga(fechaISO: string): string {
  const fecha = new Date(`${fechaISO}T12:00:00`);
  return `${MARCA.ciudad} a ${fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}`;
}

// Renglón de texto que ocupa las seis columnas (títulos, condiciones…).
function renglonCompleto(hoja: ExcelJS.Worksheet, texto: string, opciones: { negrita?: boolean; centrado?: boolean; tamano?: number; fondo?: string } = {}) {
  const fila = hoja.addRow([texto]);
  hoja.mergeCells(fila.number, 1, fila.number, 6);
  const celda = fila.getCell(1);
  celda.font = { bold: Boolean(opciones.negrita), size: opciones.tamano || 10, color: { argb: NAVY } };
  celda.alignment = { wrapText: true, vertical: 'middle', horizontal: opciones.centrado ? 'center' : 'left' };
  if (opciones.fondo) {
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opciones.fondo } };
    celda.border = borde;
  }
  // Excel no ajusta solo la altura de celdas combinadas: se calcula con un
  // aproximado de 95 letras por renglón a lo ancho de la hoja.
  const renglones = texto.split(/\r?\n/).reduce((n, p) => n + Math.max(1, Math.ceil(p.length / 95)), 0);
  if (renglones > 1) fila.height = renglones * 14;
  return fila;
}

// Renglón de etiqueta + monto alineado a la derecha (importe, totales).
function renglonMonto(hoja: ExcelJS.Worksheet, etiqueta: string, monto: number, formato = FORMATO_DINERO) {
  const fila = hoja.addRow(['', '', '', '', etiqueta, monto]);
  const celdaEtiqueta = fila.getCell(5);
  celdaEtiqueta.font = { bold: true, color: { argb: NAVY } };
  celdaEtiqueta.alignment = { horizontal: 'right' };
  const celdaMonto = fila.getCell(6);
  celdaMonto.font = { bold: true, color: { argb: NAVY } };
  celdaMonto.numFmt = formato;
  celdaMonto.border = borde;
  return fila;
}

// Totales con la misma lógica del PDF según cómo se maneja el IVA.
function totalesDe(cot: Cotizacion): [string, number][] {
  const modoIva = modoIvaDe(cot);
  const totalNeto = modoIva === 'incluido' && Boolean(cot.total_neto);
  if (modoIva === 'sin') return [['TOTAL', cot.total]];
  if (totalNeto) return [['IMPORTE TOTAL NETO', cot.total]];
  if (modoIva === 'incluido') {
    return [
      [`IVA INCLUIDO (${cot.iva_pct}%)`, cot.iva],
      ['TOTAL', cot.total],
    ];
  }
  return [
    ['SUBTOTAL', cot.subtotal],
    [`IVA (${cot.iva_pct}%)`, cot.iva],
    ['TOTAL', cot.total],
  ];
}

function escribirEncabezado(hoja: ExcelJS.Worksheet, cot: Cotizacion) {
  // A la izquierda va la imagen del logo (ver agregarLogos); aquí solo el
  // título, folio y fecha a la derecha, como en el PDF.
  const filaMarca = hoja.addRow(['', '', '', '', '', 'COTIZACIÓN']);
  filaMarca.getCell(6).font = { bold: true, size: 14, color: { argb: NAVY } };
  filaMarca.getCell(6).alignment = { horizontal: 'right' };
  filaMarca.height = 22;

  const filaFolio = hoja.addRow(['', '', '', '', '', cot.folio ? `Folio: ${cot.folio}` : '']);
  filaFolio.getCell(6).alignment = { horizontal: 'right' };
  const filaFecha = hoja.addRow(['', '', '', '', '', fechaLarga(cot.fecha)]);
  filaFecha.getCell(6).alignment = { horizontal: 'right' };
  // Espacio para la tira de íconos del logo.
  hoja.addRow([]);

  const datosCliente: [string, string | null][] = [
    ["At'n", cot.atencion],
    ['Empresa', cot.empresa],
    ['Tel', cot.telefono],
    ['Correo', cot.correo],
  ];
  for (const [etiqueta, valor] of datosCliente) {
    if (!valor) continue;
    const fila = hoja.addRow([`${etiqueta}:`, valor]);
    hoja.mergeCells(fila.number, 2, fila.number, 6);
    fila.getCell(1).font = { bold: true, color: { argb: NAVY } };
  }
  hoja.addRow([]);
  // Título del proyecto, centrado antes de la primera tabla como en el PDF.
  const tituloProyecto = (cot.titulo_proyecto || '').trim();
  if (tituloProyecto) {
    renglonCompleto(hoja, tituloProyecto.toUpperCase(), { negrita: true, centrado: true, tamano: 15 });
    hoja.addRow([]);
  }
}

function escribirGrupo(hoja: ExcelJS.Worksheet, cot: Cotizacion, grupo: ReturnType<typeof agruparPorSistema<LineaCotizacion>>[number], mostrarImporte: boolean) {
  const titulo = tituloDeSistema(grupo.lineas);
  if (titulo) renglonCompleto(hoja, titulo.toUpperCase(), { negrita: true, centrado: true, tamano: 12 });
  const barra = `${grupo.opcional ? 'COTIZACIÓN OPCIONAL' : 'COTIZACIÓN'}: ${grupo.sistema.toUpperCase()}`;
  renglonCompleto(hoja, barra, { negrita: true, centrado: true, fondo: GRIS_FONDO });

  const encabezado = hoja.addRow(['Partida', 'Descripción', 'Unid', 'Cant.', 'P.Unit', 'Importe']);
  encabezado.eachCell((celda) => {
    celda.font = { bold: true, color: { argb: NAVY } };
    celda.alignment = { horizontal: 'center', vertical: 'middle' };
    celda.border = borde;
  });

  // En modo «kit» el sistema se vende como una sola pieza: Unid, Cant.,
  // P.Unit e Importe van en una celda combinada para todo el grupo.
  const esKit = cot.presentacion_precios === 'kit';
  const importeGrupo = grupo.lineas.reduce((suma, l) => suma + l.importe, 0);
  const primeraFila = hoja.rowCount + 1;

  grupo.lineas.forEach((l, i) => {
    const numero = String(i + 1).padStart(2, '0');
    const valores = esKit
      ? [numero, l.descripcion, '', '', '', '']
      : [numero, l.descripcion, l.unidad, l.cantidad, l.precio_unitario, l.importe];
    const fila = hoja.addRow(valores);
    fila.eachCell({ includeEmpty: true }, (celda, columna) => {
      celda.border = borde;
      celda.alignment = { vertical: 'middle', horizontal: columna === 2 ? 'left' : 'center', wrapText: columna === 2 };
    });
    fila.getCell(5).numFmt = FORMATO_DINERO;
    fila.getCell(6).numFmt = FORMATO_DINERO;
    // Altura aproximada: ~60 letras por renglón en la columna de descripción.
    const renglones = l.descripcion.split(/\r?\n/).reduce((n, p) => n + Math.max(1, Math.ceil(p.length / 60)), 0);
    if (renglones > 1) fila.height = renglones * 14;
  });

  if (esKit && grupo.lineas.length > 0) {
    const ultimaFila = hoja.rowCount;
    const valoresKit: [number, string | number][] = [[3, 'Kit'], [4, 1], [5, importeGrupo], [6, importeGrupo]];
    for (const [columna, valor] of valoresKit) {
      if (ultimaFila > primeraFila) hoja.mergeCells(primeraFila, columna, ultimaFila, columna);
      const celda = hoja.getCell(primeraFila, columna);
      celda.value = valor;
      celda.alignment = { horizontal: 'center', vertical: 'middle' };
      if (columna >= 5) celda.numFmt = FORMATO_DINERO;
    }
  }

  if (mostrarImporte) {
    const etiqueta = grupo.opcional ? 'Importe opcional (no incluido en el total)' : 'Importe';
    renglonMonto(hoja, etiqueta, importeGrupo);
  }
  hoja.addRow([]);
}

function escribirOpciones(hoja: ExcelJS.Worksheet, cot: Cotizacion, lineas: LineaCotizacion[]) {
  const opciones = opcionesDeCotizacion(lineas, cot);
  if (opciones.length === 0) return;
  const modoIva = modoIvaDe(cot);
  let sufijoIva = '';
  if (modoIva === 'sumar') sufijoIva = ' + IVA';
  if (modoIva === 'incluido') sufijoIva = ' (IVA incluido)';

  hoja.addRow([]);
  renglonCompleto(hoja, 'Opciones (no incluidas en el total)', { negrita: true });
  for (const opcion of opciones) {
    renglonCompleto(hoja, opcion.nombre, { negrita: true });
    renglonMonto(hoja, `Importe${sufijoIva}`, opcion.importe);
    renglonMonto(hoja, 'Total con esta opción', opcion.totalConOpcion);
  }
}

function escribirCondiciones(hoja: ExcelJS.Worksheet, cot: Cotizacion) {
  const modoIva = modoIvaDe(cot);
  const totalNeto = modoIva === 'incluido' && Boolean(cot.total_neto);
  const condiciones = [
    leyendaIva(cot.moneda, modoIva, totalNeto),
    `Forma de Pago: ${cot.forma_pago}`,
    'Esta cotización ampara unicamente lo descrito anteriormente.',
    `Tiempo de Entrega: ${cot.tiempo_entrega}`,
    `Garantía: ${cot.garantia}`,
    `Vigencia de cotización: ${cot.vigencia_dias} días naturales una vez presentada al cliente.`,
  ];
  if (cot.notas) condiciones.push(cot.notas);

  hoja.addRow([]);
  renglonCompleto(hoja, 'Condiciones comerciales de venta:', { negrita: true });
  for (const condicion of condiciones) renglonCompleto(hoja, condicion);

  hoja.addRow([]);
  const firma = ['Atentamente:', cot.firmante_nombre || '', cot.firmante_correo || '', `Tels: ${MARCA.telefonos}`, MARCA.sitioWeb];
  firma.forEach((texto, i) => {
    if (texto) renglonCompleto(hoja, texto, { centrado: true, negrita: i === 0 });
  });
}

// Excel mide las imágenes en pixeles (96 por pulgada); el logo, en puntos (72).
const PX_POR_PUNTO = 96 / 72;

// Logo arriba a la izquierda y el escudo tenue en diagonal al centro de la
// hoja, igual que en el PDF. Si no se pudieran armar las imágenes, el Excel
// sale igual sin ellas: es mejor que no poder descargarlo.
async function agregarLogos(libro: ExcelJS.Workbook, hoja: ExcelJS.Worksheet) {
  try {
    const logo = await encabezadoDeMarca();
    const idLogo = libro.addImage({ buffer: logo.png as any, extension: 'png' });
    hoja.addImage(idLogo, {
      tl: { col: 0.1, row: 0.15 },
      ext: { width: logo.ancho * PX_POR_PUNTO, height: logo.alto * PX_POR_PUNTO },
    });

    // A todo lo ancho de las seis columnas (con el escudo centrado dentro de
    // la imagen), a media altura de la primera hoja impresa. La imagen ya
    // trae la transparencia, así que no tapa las tablas.
    const anchoHojaPx = hoja.columns.reduce((suma, columna) => suma + (columna.width || 10) * 7 + 5, 0);
    const agua = await marcaDeAgua(anchoHojaPx / PX_POR_PUNTO, 260);
    const idAgua = libro.addImage({ buffer: agua.png as any, extension: 'png' });
    hoja.addImage(idAgua, {
      tl: { col: 0, row: 12 },
      ext: { width: anchoHojaPx, height: agua.alto * PX_POR_PUNTO },
    });
  } catch (e) {
    console.error('[cotizaciones-xlsx] No se pudo agregar el logo:', e);
  }
}

export async function generateCotizacionXlsx(cot: Cotizacion, lineas: LineaCotizacion[]): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = MARCA.nombre;
  const hoja = libro.addWorksheet('COTIZACIÓN', {
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  hoja.columns = [
    { width: 9 },
    { width: 58 },
    { width: 9 },
    { width: 8 },
    { width: 15 },
    { width: 17 },
  ];

  escribirEncabezado(hoja, cot);
  await agregarLogos(libro, hoja);

  const grupos = agruparPorSistema(lineas);
  const modoIva = modoIvaDe(cot);
  const totalNeto = modoIva === 'incluido' && Boolean(cot.total_neto);
  // Igual que en el PDF: con total neto y un solo sistema que suma, su
  // «Importe» repetiría el total, así que se omite.
  const gruposQueSuman = grupos.filter((g) => !g.opcional).length;
  for (const grupo of grupos) {
    const repiteElTotal = !grupo.opcional && totalNeto && gruposQueSuman === 1;
    escribirGrupo(hoja, cot, grupo, !repiteElTotal);
  }

  const totales = totalesDe(cot);
  totales.forEach(([etiqueta, monto], i) => {
    // Solo el total lleva la divisa, como en el PDF.
    const esTotal = i === totales.length - 1;
    const formato = esTotal && cot.moneda === 'USD' ? '"USD $"#,##0.00' : FORMATO_DINERO;
    renglonMonto(hoja, etiqueta, monto, formato);
  });

  escribirOpciones(hoja, cot, lineas);
  escribirCondiciones(hoja, cot);

  const datos = await libro.xlsx.writeBuffer();
  return Buffer.from(datos as ArrayBuffer);
}
