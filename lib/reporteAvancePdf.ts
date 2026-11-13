// Reporte de avance de la instalación de un cliente: resumen por etapa, por
// plano y por tipo de equipo, cada plano con sus equipos pintados según su
// estado, y la lista de lo que falta con el motivo de lo que no se puede
// instalar. Se arma en el navegador, igual que el PDF del plano.

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import {
  COLOR_BLOQUEADO, ESTADOS_AVANCE, colorDeAvance, contar, cuentaVacia, datosDeEstado, equiposQueCuentan, estadoDe,
  instalados, nombreEtapa, porcentaje, resumenPorEtapa, resumenPorTipo, sumar,
  type AvancePlano, type Cuenta,
} from './avancePlano';
import { exportarPlanoPdf } from './exportarPlanoPdf';
import { tipoDispositivo } from './lazos';
import type { EquipoPlano, Plano } from './planos';

export type PlanoParaReporte = {
  plano: Plano;
  avance: AvancePlano;
  // El fondo del plano, como en exportarPlanoPdf. Sin fondo, el plano no se dibuja.
  pdfOriginal: ArrayBuffer | Uint8Array | null;
  fondoPng: Uint8Array | null;
  // Dirección de cada equipo ligado a un dispositivo del lazo (id del dispositivo → texto).
  etiquetas: Map<string, string>;
};

const ANCHO = 612;
const ALTO = 792;
const MARGEN = 40;
const TINTA = rgb(0.06, 0.15, 0.23);
const GRIS = rgb(0.42, 0.46, 0.5);
const LINEA = rgb(0.78, 0.8, 0.82);

function color(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// Helvetica solo trae letras latinas: lo demás se cambia para que no truene.
function limpio(valor: string): string {
  return valor.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/→/g, '>').replace(/[^\x20-\xFF]/g, '?');
}

// Corta el texto para que quepa en el ancho.
function recortar(valor: string, fuente: PDFFont, tam: number, ancho: number): string {
  let t = limpio(valor);
  if (fuente.widthOfTextAtSize(t, tam) <= ancho) return t;
  while (t.length > 1 && fuente.widthOfTextAtSize(`${t}...`, tam) > ancho) t = t.slice(0, -1);
  return `${t}...`;
}

function rotuloDe(equipo: EquipoPlano, etiquetas: Map<string, string>): string {
  return (equipo.elementoId && etiquetas.get(equipo.elementoId)) || equipo.etiqueta || 'Sin dirección';
}

export async function reporteAvancePdf({ cliente, empresa, planos }: { cliente: string; empresa: string; planos: PlanoParaReporte[] }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(limpio(`Reporte de avance - ${cliente}`));
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fecha = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });

  let hoja: PDFPage = pdf.addPage([ANCHO, ALTO]);
  let y = ALTO - MARGEN;

  function pie(p: PDFPage) {
    p.drawText(limpio(`${empresa} · Reporte de avance · ${cliente} · Corte al ${fecha}`), { x: MARGEN, y: 22, size: 7.5, font: fuente, color: GRIS });
  }
  function hojaNueva() {
    pie(hoja);
    hoja = pdf.addPage([ANCHO, ALTO]);
    y = ALTO - MARGEN;
  }
  function espacio(alto: number) {
    if (y - alto < MARGEN + 10) hojaNueva();
  }
  function titulo(t: string) {
    espacio(40);
    y -= 8;
    hoja.drawText(limpio(t.toUpperCase()), { x: MARGEN, y, size: 10, font: negrita, color: TINTA });
    y -= 5;
    hoja.drawLine({ start: { x: MARGEN, y }, end: { x: ANCHO - MARGEN, y }, thickness: 1, color: TINTA });
    y -= 14;
  }

  // ---------- Encabezado ----------
  hoja.drawText(limpio(empresa), { x: MARGEN, y: y - 4, size: 11, font: negrita, color: GRIS });
  hoja.drawText('REPORTE DE AVANCE DE INSTALACIÓN', { x: MARGEN, y: y - 26, size: 17, font: negrita, color: TINTA });
  hoja.drawText(recortar(cliente, negrita, 14, ANCHO - MARGEN * 2), { x: MARGEN, y: y - 46, size: 14, font: negrita, color: TINTA });
  hoja.drawText(limpio(`Fecha de corte: ${fecha} · ${planos.length} ${planos.length === 1 ? 'plano' : 'planos'}`), { x: MARGEN, y: y - 61, size: 9.5, font: fuente, color: GRIS });
  y -= 74;
  hoja.drawLine({ start: { x: MARGEN, y }, end: { x: ANCHO - MARGEN, y }, thickness: 1.5, color: TINTA });
  y -= 18;

  // ---------- Totales ----------
  let total: Cuenta = cuentaVacia();
  for (const p of planos) total = sumar(total, contar(p.plano.sembrado.equipos, p.avance));

  const cuadros: [string, string][] = [
    ['Equipos en proyecto', String(total.total)],
    ['Instalados', `${instalados(total)} (${porcentaje(instalados(total), total.total)}%)`],
    ['Probados y funcionando', `${total.porEstado.probado} (${porcentaje(total.porEstado.probado, total.total)}%)`],
    ['No se pueden instalar', String(total.bloqueados)],
  ];
  const anchoCuadro = (ANCHO - MARGEN * 2 - 18) / 4;
  cuadros.forEach(([rotulo, valor], i) => {
    const x = MARGEN + i * (anchoCuadro + 6);
    hoja.drawRectangle({ x, y: y - 46, width: anchoCuadro, height: 46, borderColor: LINEA, borderWidth: 0.8 });
    hoja.drawText(limpio(rotulo.toUpperCase()), { x: x + 7, y: y - 14, size: 6.8, font: negrita, color: GRIS });
    hoja.drawText(limpio(valor), { x: x + 7, y: y - 35, size: 15, font: negrita, color: i === 3 && total.bloqueados > 0 ? color(COLOR_BLOQUEADO) : TINTA });
  });
  y -= 60;

  // Barra del total por estado y su leyenda (los mismos colores de los planos).
  if (total.total > 0) {
    let x = MARGEN;
    for (const estado of ESTADOS_AVANCE) {
      const ancho = (total.porEstado[estado.id] / total.total) * (ANCHO - MARGEN * 2);
      if (ancho > 0) hoja.drawRectangle({ x, y: y - 10, width: ancho, height: 10, color: color(estado.color) });
      x += ancho;
    }
    y -= 24;
  }
  let xLeyenda = MARGEN;
  for (const estado of [...ESTADOS_AVANCE.map((e) => ({ nombre: e.nombre, color: e.color })), { nombre: 'No se puede instalar', color: COLOR_BLOQUEADO }]) {
    hoja.drawCircle({ x: xLeyenda + 4, y: y + 3, size: 4, color: color(estado.color) });
    hoja.drawText(limpio(estado.nombre), { x: xLeyenda + 12, y, size: 7.8, font: fuente, color: TINTA });
    xLeyenda += 20 + fuente.widthOfTextAtSize(limpio(estado.nombre), 7.8);
  }
  y -= 16;

  // ---------- Tablas de resumen ----------
  const columnas = ['Equipos', 'Pendiente', 'Tub. y cable', 'Instalado', 'Direcc.', 'Probado', 'No se puede', '% probado'];
  const xPrimera = MARGEN + 150;
  const anchoColumna = (ANCHO - MARGEN - xPrimera) / columnas.length;

  function tabla(nombre: string, primera: string, filas: { rotulo: string; cuenta: Cuenta }[]) {
    if (filas.length === 0) return;
    titulo(nombre);
    const encabezado = () => {
      hoja.drawText(limpio(primera.toUpperCase()), { x: MARGEN, y, size: 7, font: negrita, color: GRIS });
      columnas.forEach((c, i) => {
        const t = limpio(c.toUpperCase());
        hoja.drawText(t, { x: xPrimera + (i + 1) * anchoColumna - negrita.widthOfTextAtSize(t, 6.5) - 2, y, size: 6.5, font: negrita, color: GRIS });
      });
      y -= 13;
    };
    encabezado();
    const renglon = (rotulo: string, c: Cuenta, fuerte: boolean) => {
      if (y - 14 < MARGEN + 10) {
        hojaNueva();
        encabezado();
      }
      const letra = fuerte ? negrita : fuente;
      hoja.drawText(recortar(rotulo, letra, 9, 145), { x: MARGEN, y, size: 9, font: letra, color: TINTA });
      const valores = [
        c.total, c.porEstado.pendiente, c.porEstado.canalizado, c.porEstado.instalado, c.porEstado.direccionado, c.porEstado.probado,
        c.bloqueados, `${porcentaje(c.porEstado.probado, c.total)}%`,
      ];
      valores.forEach((v, i) => {
        const t = String(v);
        const rojo = i === 6 && c.bloqueados > 0;
        hoja.drawText(t, { x: xPrimera + (i + 1) * anchoColumna - letra.widthOfTextAtSize(t, 9) - 2, y, size: 9, font: letra, color: rojo ? color(COLOR_BLOQUEADO) : TINTA });
      });
      y -= 4;
      hoja.drawLine({ start: { x: MARGEN, y }, end: { x: ANCHO - MARGEN, y }, thickness: 0.4, color: LINEA });
      y -= 11;
    };
    filas.forEach((f) => renglon(f.rotulo, f.cuenta, false));
    if (filas.length > 1) renglon('Total', filas.reduce((suma, f) => sumar(suma, f.cuenta), cuentaVacia()), true);
    y -= 6;
  }

  const todos = planos.flatMap((p) => p.plano.sembrado.equipos);
  const avanceJunto: AvancePlano = Object.assign({}, ...planos.map((p) => p.avance));
  tabla('Avance por etapa', 'Etapa', resumenPorEtapa(todos, avanceJunto).map((r) => ({ rotulo: nombreEtapa(r.etapa), cuenta: r.cuenta })));
  tabla('Avance por plano', 'Plano', planos.map((p) => ({ rotulo: p.plano.nombre, cuenta: contar(p.plano.sembrado.equipos, p.avance) })));
  tabla('Avance por tipo de equipo', 'Equipo', resumenPorTipo(todos, avanceJunto).map((r) => ({ rotulo: r.nombre, cuenta: r.cuenta })));

  // ---------- Lo que falta ----------
  type Faltante = { rotulo: string; tipo: string; plano: string; etapa: string; estado: string; detalle: string; bloqueado: boolean; grupo: string };
  const faltantes: Faltante[] = [];
  for (const p of planos) {
    for (const e of equiposQueCuentan(p.plano.sembrado.equipos)) {
      const marca = p.avance[e.id];
      const estado = estadoDe(p.avance, e.id);
      if (estado === 'probado' && !marca?.bloqueo) continue;
      faltantes.push({
        rotulo: rotuloDe(e, p.etiquetas),
        tipo: tipoDispositivo(e.tipo).nombre,
        plano: p.plano.nombre,
        etapa: e.etapa ? `E${e.etapa}` : '-',
        estado: datosDeEstado(estado).corto,
        detalle: marca?.bloqueo ? [marca.bloqueo.motivo, marca.bloqueo.nota].filter(Boolean).join(': ') : '',
        bloqueado: Boolean(marca?.bloqueo),
        grupo: marca?.bloqueo ? `No se puede instalar - ${marca.bloqueo.motivo}` : `Falta terminar - ${datosDeEstado(estado).nombre}`,
      });
    }
  }
  // Primero lo bloqueado (es lo que hay que explicar), luego por estado.
  faltantes.sort((a, b) => Number(b.bloqueado) - Number(a.bloqueado) || a.grupo.localeCompare(b.grupo) || a.plano.localeCompare(b.plano) || a.rotulo.localeCompare(b.rotulo, 'es', { numeric: true }));

  titulo(`Detalle de lo que falta (${faltantes.length})`);
  if (faltantes.length === 0) {
    hoja.drawText('Todos los equipos están probados y funcionando.', { x: MARGEN, y, size: 10, font: fuente, color: TINTA });
    y -= 16;
  }
  const xs = { rotulo: MARGEN, tipo: MARGEN + 78, plano: MARGEN + 205, etapa: MARGEN + 300, estado: MARGEN + 328, detalle: MARGEN + 405 };
  let grupoActual = '';
  for (const f of faltantes) {
    if (f.grupo !== grupoActual) {
      espacio(40);
      grupoActual = f.grupo;
      const cuantos = faltantes.filter((x) => x.grupo === f.grupo).length;
      y -= 4;
      hoja.drawText(limpio(`${f.grupo} (${cuantos})`), { x: MARGEN, y, size: 9.5, font: negrita, color: f.bloqueado ? color(COLOR_BLOQUEADO) : TINTA });
      y -= 13;
      (['Dirección', 'Equipo', 'Plano', 'Et.', 'Estado', f.bloqueado ? 'Qué falta' : ''] as const).forEach((c, i) => {
        hoja.drawText(limpio(c.toUpperCase()), { x: Object.values(xs)[i], y, size: 6.5, font: negrita, color: GRIS });
      });
      y -= 11;
    }
    espacio(13);
    hoja.drawText(recortar(f.rotulo, negrita, 8.5, 74), { x: xs.rotulo, y, size: 8.5, font: negrita, color: TINTA });
    hoja.drawText(recortar(f.tipo, fuente, 8.5, 122), { x: xs.tipo, y, size: 8.5, font: fuente, color: TINTA });
    hoja.drawText(recortar(f.plano, fuente, 8.5, 90), { x: xs.plano, y, size: 8.5, font: fuente, color: TINTA });
    hoja.drawText(limpio(f.etapa), { x: xs.etapa, y, size: 8.5, font: fuente, color: TINTA });
    hoja.drawText(recortar(f.estado, fuente, 8.5, 74), { x: xs.estado, y, size: 8.5, font: fuente, color: TINTA });
    if (f.detalle) hoja.drawText(recortar(f.detalle, fuente, 8.5, ANCHO - MARGEN - xs.detalle), { x: xs.detalle, y, size: 8.5, font: fuente, color: TINTA });
    y -= 12;
  }
  pie(hoja);

  // ---------- Los planos, pintados por estado ----------
  for (const p of planos) {
    if (!p.pdfOriginal && !p.fondoPng) continue;
    const idsQueCuentan = new Set(equiposQueCuentan(p.plano.sembrado.equipos).map((e) => e.id));
    const bytes = await exportarPlanoPdf({
      plano: p.plano,
      pdfOriginal: p.pdfOriginal,
      fondoPng: p.fondoPng,
      cliente,
      etiquetas: p.etiquetas,
      soloPlano: true,
      // El panel no lleva estado de obra.
      colorFondo: (equipoId) => (idsQueCuentan.has(equipoId) ? colorDeAvance(p.avance[equipoId]) : null),
    });
    const origen = await PDFDocument.load(bytes);
    const [pagina] = await pdf.copyPages(origen, [0]);
    pdf.addPage(pagina);
    // Rótulo del plano en su esquina, proporcional al tamaño de la hoja.
    const tam = Math.max(10, Math.max(p.plano.ancho, p.plano.alto) / 90);
    const rotulo = limpio(`${p.plano.nombre} · Avance al ${fecha}`);
    pagina.drawRectangle({ x: tam, y: tam, width: negrita.widthOfTextAtSize(rotulo, tam) + tam, height: tam * 1.8, color: rgb(1, 1, 1), opacity: 0.85 });
    pagina.drawText(rotulo, { x: tam * 1.5, y: tam * 1.5, size: tam, font: negrita, color: TINTA });
  }

  return pdf.save();
}
