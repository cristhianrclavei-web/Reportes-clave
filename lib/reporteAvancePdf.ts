// Reporte de avance de la instalación de un cliente: resumen por etapa, por
// plano y por tipo de equipo, cada plano con sus equipos pintados según su
// estado, y la lista de lo que falta con el motivo de lo que no se puede
// instalar. Se arma en el navegador, igual que el PDF del plano.

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import {
  COLOR_BLOQUEADO, ESTADOS_AVANCE, alMenos, colorDeAvance, contar, cuentaVacia, datosDeEstado, equiposQueCuentan, estadoDe,
  nombreEtapa, porcentajes, resumenPorEtapa, resumenPorLazo, resumenPorTipo, sumar,
  type AvancePlano, type Cuenta, type EstadoAvance,
} from './avancePlano';
import { ordenarPorNivel } from './planos';
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

const FONDO_SUAVE = rgb(0.94, 0.95, 0.96);
const COLOR_PROBADO = ESTADOS_AVANCE.find((e) => e.id === 'probado')!.color;

// Lo que quiere decir cada paso, para quien no lo conoce.
const QUE_SIGNIFICA: Record<EstadoAvance, string> = {
  pendiente: 'Todavía no se trabaja en este equipo.',
  canalizado: 'Ya llegan la tubería y el cable a su lugar.',
  instalado: 'El equipo ya está colocado en su lugar.',
  direccionado: 'Ya tiene su dirección programada en el panel.',
  probado: 'Se probó y funciona: está terminado.',
};

// Lo que le toca después a un equipo según el paso en que va.
const SIGUIENTE_PASO: Record<EstadoAvance, string> = {
  pendiente: 'Meter tubería y cable',
  canalizado: 'Instalar el equipo',
  instalado: 'Direccionarlo en el panel',
  direccionado: 'Probarlo',
  probado: 'Probado y funcionando',
};

// Título de cada grupo de la lista: lo que falta, no el paso en que va.
const GRUPO_DE: Record<EstadoAvance, string> = {
  pendiente: 'Sin iniciar: falta todo',
  canalizado: 'Con tubería y cable: falta instalar, direccionar y probar',
  instalado: 'Instalados: falta direccionar y probar',
  direccionado: 'Direccionados: solo falta probarlos',
  probado: 'Probados y funcionando',
};

// Parte un texto en renglones que quepan en el ancho.
export function lineas(texto: string, fuente: PDFFont, tam: number, ancho: number): string[] {
  const renglones: string[] = [];
  let actual = '';
  for (const palabra of limpio(texto).split(' ')) {
    const conPalabra = actual ? `${actual} ${palabra}` : palabra;
    if (actual && fuente.widthOfTextAtSize(conPalabra, tam) > ancho) {
      renglones.push(actual);
      actual = palabra;
    } else {
      actual = conPalabra;
    }
  }
  if (actual) renglones.push(actual);
  return renglones;
}

// Cuántos equipos están detenidos por cada motivo, de más a menos.
function motivosDeBloqueo(planos: PlanoParaReporte[]): [string, number][] {
  const cuantos = new Map<string, number>();
  for (const p of planos) {
    for (const e of equiposQueCuentan(p.plano.sembrado.equipos)) {
      const motivo = p.avance[e.id]?.bloqueo?.motivo;
      if (motivo) cuantos.set(motivo, (cuantos.get(motivo) ?? 0) + 1);
    }
  }
  return [...cuantos.entries()].sort((a, b) => b[1] - a[1]);
}

function equipos(n: number): string {
  return n === 1 ? '1 equipo' : `${n} equipos`;
}

// El estado del proyecto dicho en palabras, para quien ve el reporte por primera vez.
export function frasesDelResumen(total: Cuenta, niveles: { nombre: string; cuenta: Cuenta }[], motivos: [string, number][]): string[] {
  if (total.total === 0) return ['Los planos todavía no tienen equipos colocados.'];
  const pct = porcentajes(total);
  const frases: string[] = [];
  const sinContar = total.bloqueados > 0 ? ` (sin contar ${equipos(total.bloqueados)} que no se pueden instalar)` : '';
  frases.push(`El proyecto tiene ${equipos(total.total)}. ${pct.probados} de ${pct.aplicables} ya están probados y funcionando${sinContar}.`);
  const enProceso = pct.conAvance - pct.probados;
  const sinIniciar = total.porEstado.pendiente;
  if (enProceso > 0 || sinIniciar > 0) {
    frases.push(`${enProceso === 1 ? '1 equipo está' : `${enProceso} equipos están`} en proceso (ya tienen trabajo, falta terminarlos) y ${sinIniciar === 1 ? '1 no se ha empezado' : `${sinIniciar} no se han empezado`}.`);
  }
  if (motivos.length > 0) {
    const lista = motivos.map(([motivo, n]) => `${motivo} (${n})`).join(', ');
    frases.push(`Detenidos por causas que hay que resolver: ${lista}.`);
  }
  const conEquipos = niveles.filter((n) => porcentajes(n.cuenta).aplicables > 0);
  if (conEquipos.length > 1) {
    const ordenados = [...conEquipos].sort((a, b) => porcentajes(b.cuenta).probado - porcentajes(a.cuenta).probado);
    const primero = ordenados[0];
    const ultimo = ordenados[ordenados.length - 1];
    if (porcentajes(primero.cuenta).probado !== porcentajes(ultimo.cuenta).probado) {
      frases.push(`Más avanzado: ${primero.nombre} (${porcentajes(primero.cuenta).probado}% terminado). Más atrasado: ${ultimo.nombre} (${porcentajes(ultimo.cuenta).probado}%).`);
    }
  }
  return frases;
}

function rotuloDe(equipo: EquipoPlano, etiquetas: Map<string, string>): string {
  return (equipo.elementoId && etiquetas.get(equipo.elementoId)) || equipo.etiqueta || 'Sin dirección';
}

export async function reporteAvancePdf({ cliente, empresa, planos: sinOrden, paneles = [], lazoDe = () => null, fotos = new Map(), ubicaciones = new Map() }: {
  cliente: string;
  empresa: string;
  planos: PlanoParaReporte[];
  // Nombres de los paneles del cliente, para la portada.
  paneles?: string[];
  // El lazo de un equipo (por su dispositivo ligado), para la tabla por lazo.
  lazoDe?: (e: EquipoPlano) => { id: string; nombre: string } | null;
  // Fotos de evidencia ya descargadas (ruta → bytes JPG o PNG).
  fotos?: Map<string, Uint8Array>;
  // Dónde está cada dispositivo del lazo (id del dispositivo → «Cocina · Planta baja»).
  ubicaciones?: Map<string, string>;
}): Promise<Uint8Array> {
  // Los planos van por nivel (-2, -1, Planta baja, 1…).
  const planos = ordenarPorNivel(sinOrden.map((p) => ({ ...p, nombre: p.plano.nombre })));
  const pdf = await PDFDocument.create();
  pdf.setTitle(limpio(`Reporte de avance - ${cliente}`));
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fecha = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });

  let hoja: PDFPage = pdf.addPage([ANCHO, ALTO]);
  const imagenes: { hoja: PDFPage; x: number; y: number; ancho: number; alto: number; bytes: Uint8Array }[] = [];
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
    y -= 16;
    hoja.drawText(limpio(t.toUpperCase()), { x: MARGEN, y, size: 10, font: negrita, color: TINTA });
    y -= 5;
    hoja.drawLine({ start: { x: MARGEN, y }, end: { x: ANCHO - MARGEN, y }, thickness: 1, color: TINTA });
    y -= 14;
  }

  // ---------- Encabezado ----------
  hoja.drawText(limpio(empresa), { x: MARGEN, y: y - 4, size: 11, font: negrita, color: GRIS });
  hoja.drawText('REPORTE DE AVANCE DE INSTALACIÓN', { x: MARGEN, y: y - 26, size: 17, font: negrita, color: TINTA });
  hoja.drawText(recortar(cliente, negrita, 14, ANCHO - MARGEN * 2), { x: MARGEN, y: y - 46, size: 14, font: negrita, color: TINTA });
  hoja.drawText(recortar(`${paneles.length === 1 ? 'Panel' : 'Paneles'}: ${paneles.length ? paneles.join(', ') : 'sin registrar'}`, fuente, 10, ANCHO - MARGEN * 2), { x: MARGEN, y: y - 62, size: 10, font: fuente, color: TINTA });
  hoja.drawText(limpio(`Fecha de corte: ${fecha} · ${planos.length} ${planos.length === 1 ? 'plano' : 'planos'}`), { x: MARGEN, y: y - 76, size: 9.5, font: fuente, color: GRIS });
  y -= 89;
  hoja.drawLine({ start: { x: MARGEN, y }, end: { x: ANCHO - MARGEN, y }, thickness: 1.5, color: TINTA });
  y -= 18;

  // ---------- Resumen para quien lo ve por primera vez ----------
  let total: Cuenta = cuentaVacia();
  for (const p of planos) total = sumar(total, contar(p.plano.sembrado.equipos, p.avance));
  const pctTotal = porcentajes(total);
  const tramos = [
    ...ESTADOS_AVANCE.map((e) => ({ nombre: e.corto, color: e.color, letra: e.letra === '✓' ? 'OK' : e.letra, n: total.porEstado[e.id] })),
    { nombre: 'No se puede', color: COLOR_BLOQUEADO, letra: 'X', n: total.bloqueados },
  ];

  titulo('Resumen');
  // A la izquierda, el número grande: qué tanto está terminado.
  const anchoGrande = 150;
  const altoResumen = 92;
  hoja.drawRectangle({ x: MARGEN, y: y - altoResumen, width: anchoGrande, height: altoResumen, color: FONDO_SUAVE });
  hoja.drawText('TERMINADO', { x: MARGEN + 12, y: y - 18, size: 8, font: negrita, color: GRIS });
  hoja.drawText(`${pctTotal.probado}%`, { x: MARGEN + 12, y: y - 52, size: 32, font: negrita, color: color(COLOR_PROBADO) });
  hoja.drawText(limpio(`${pctTotal.probados} de ${pctTotal.aplicables} equipos`), { x: MARGEN + 12, y: y - 68, size: 8.5, font: negrita, color: TINTA });
  hoja.drawText('probados y funcionando', { x: MARGEN + 12, y: y - 79, size: 8, font: fuente, color: GRIS });

  // A la derecha, lo mismo dicho en palabras.
  const frases = frasesDelResumen(total, planos.map((p) => ({ nombre: p.plano.nombre, cuenta: contar(p.plano.sembrado.equipos, p.avance) })), motivosDeBloqueo(planos));
  const xFrases = MARGEN + anchoGrande + 16;
  const anchoFrases = ANCHO - MARGEN - xFrases;
  let yFrase = y - 10;
  for (const frase of frases) {
    lineas(frase, fuente, 9, anchoFrases - 10).forEach((linea, i) => {
      if (i === 0) hoja.drawCircle({ x: xFrases + 2, y: yFrase + 3, size: 1.8, color: TINTA });
      hoja.drawText(linea, { x: xFrases + 10, y: yFrase, size: 9, font: fuente, color: TINTA });
      yFrase -= 12;
    });
    yFrase -= 3;
  }
  y = Math.min(y - altoResumen, yFrase) - 16;

  // Barra con todos los equipos repartidos por el paso en que van.
  if (total.total > 0) {
    let x = MARGEN;
    for (const t of tramos) {
      const ancho = (t.n / total.total) * (ANCHO - MARGEN * 2);
      if (ancho > 0) {
        hoja.drawRectangle({ x, y: y - 16, width: ancho, height: 16, color: color(t.color) });
        const texto = String(t.n);
        if (negrita.widthOfTextAtSize(texto, 8.5) < ancho - 4) hoja.drawText(texto, { x: x + (ancho - negrita.widthOfTextAtSize(texto, 8.5)) / 2, y: y - 11.5, size: 8.5, font: negrita, color: rgb(1, 1, 1) });
      }
      x += ancho;
    }
    y -= 26;
  }

  // ---------- Cómo se mide: los pasos de cada equipo ----------
  espacio(130);
  titulo('Cómo se mide el avance');
  for (const linea of lineas('Cada equipo pasa por estos 5 pasos, en orden. El número grande dice cuántos equipos ya cumplieron ese paso: un equipo probado también está instalado y direccionado, aunque no se haya marcado cada paso.', fuente, 8.5, ANCHO - MARGEN * 2)) {
    hoja.drawText(linea, { x: MARGEN, y, size: 8.5, font: fuente, color: GRIS });
    y -= 11;
  }
  y -= 1;
  // «Pendiente» son los que no han empezado; los demás pasos se acumulan.
  const pasos = [
    ...ESTADOS_AVANCE.map((e, i) => ({ titulo: `${i + 1}. ${e.corto}`, color: e.color, n: e.id === 'pendiente' ? total.porEstado.pendiente : alMenos(total, e.id), texto: QUE_SIGNIFICA[e.id] })),
    { titulo: 'No se puede', color: COLOR_BLOQUEADO, n: total.bloqueados, texto: 'Detenido por algo ajeno (plafón, acceso...). El motivo va en la lista.' },
  ];
  const separacion = 6;
  const anchoPaso = (ANCHO - MARGEN * 2 - separacion * (pasos.length - 1)) / pasos.length;
  const altoPaso = 84;
  pasos.forEach((paso, i) => {
    const x = MARGEN + i * (anchoPaso + separacion);
    hoja.drawRectangle({ x, y: y - altoPaso, width: anchoPaso, height: altoPaso, color: color(paso.color), opacity: 0.1 });
    hoja.drawRectangle({ x, y: y - 4, width: anchoPaso, height: 4, color: color(paso.color) });
    hoja.drawText(recortar(paso.titulo.toUpperCase(), negrita, 7, anchoPaso - 10), { x: x + 6, y: y - 16, size: 7, font: negrita, color: TINTA });
    hoja.drawText(String(paso.n), { x: x + 6, y: y - 37, size: 18, font: negrita, color: color(paso.color) });
    hoja.drawText(paso.n === 1 ? 'equipo' : 'equipos', { x: x + 8 + negrita.widthOfTextAtSize(String(paso.n), 18), y: y - 37, size: 7.5, font: fuente, color: GRIS });
    lineas(paso.texto, fuente, 7, anchoPaso - 12).slice(0, 4).forEach((linea, k) => {
      hoja.drawText(linea, { x: x + 6, y: y - 51 - k * 8.5, size: 7, font: fuente, color: TINTA });
    });
    // Flecha al siguiente paso (el bloqueo no es un paso, va aparte).
    if (i < ESTADOS_AVANCE.length - 1) {
      const xf = x + anchoPaso + separacion / 2;
      hoja.drawLine({ start: { x: xf - 2, y: y - 30 }, end: { x: xf + 1, y: y - 33 }, thickness: 1, color: GRIS });
      hoja.drawLine({ start: { x: xf + 1, y: y - 33 }, end: { x: xf - 2, y: y - 36 }, thickness: 1, color: GRIS });
    }
  });
  y -= altoPaso + 18;

  // ---------- Tablas de resumen ----------
  // Cada columna cuenta los que YA pasaron ese paso (se acumula hacia la izquierda).
  const columnas: { titulo: [string, string?]; valor: (c: Cuenta) => number; rojo?: boolean }[] = [
    { titulo: ['Equipos'], valor: (c) => c.total },
    { titulo: ['Sin', 'iniciar'], valor: (c) => c.porEstado.pendiente },
    { titulo: ['Con tubería', 'y cable'], valor: (c) => alMenos(c, 'canalizado') },
    { titulo: ['Ya', 'instalados'], valor: (c) => alMenos(c, 'instalado') },
    { titulo: ['Ya direc-', 'cionados'], valor: (c) => alMenos(c, 'direccionado') },
    { titulo: ['Ya', 'probados'], valor: (c) => c.porEstado.probado },
    { titulo: ['No se', 'pueden'], valor: (c) => c.bloqueados, rojo: true },
  ];
  const anchoNombre = 122;
  const anchoBarra = 84;
  const anchoColumna = (ANCHO - MARGEN * 2 - anchoNombre - anchoBarra) / columnas.length;
  const centroColumna = (i: number) => MARGEN + anchoNombre + anchoColumna * (i + 0.5);
  const xBarra = ANCHO - MARGEN - anchoBarra;

  function centrado(p: PDFPage, texto: string, xCentro: number, yTexto: number, tam: number, letra: PDFFont, tinta = TINTA) {
    p.drawText(texto, { x: xCentro - letra.widthOfTextAtSize(texto, tam) / 2, y: yTexto, size: tam, font: letra, color: tinta });
  }

  function tabla(nombre: string, primera: string, filas: { rotulo: string; cuenta: Cuenta }[]) {
    if (filas.length === 0) return;
    espacio(80);
    titulo(nombre);
    const encabezado = () => {
      // Banda gris con los títulos en dos renglones, centrados sobre su columna.
      hoja.drawRectangle({ x: MARGEN, y: y - 20, width: ANCHO - MARGEN * 2, height: 26, color: FONDO_SUAVE });
      hoja.drawText(limpio(primera.toUpperCase()), { x: MARGEN + 6, y: y - 8, size: 7, font: negrita, color: GRIS });
      columnas.forEach((c, i) => {
        const [arriba, abajo] = c.titulo;
        if (abajo) {
          centrado(hoja, limpio(arriba.toUpperCase()), centroColumna(i), y - 4, 6.5, negrita, GRIS);
          centrado(hoja, limpio(abajo.toUpperCase()), centroColumna(i), y - 12, 6.5, negrita, GRIS);
        } else {
          centrado(hoja, limpio(arriba.toUpperCase()), centroColumna(i), y - 8, 6.5, negrita, GRIS);
        }
      });
      hoja.drawText('TERMINADO', { x: xBarra + 6, y: y - 8, size: 6.5, font: negrita, color: GRIS });
      y -= 34;
    };
    encabezado();
    const renglon = (rotulo: string, c: Cuenta, esTotal: boolean) => {
      if (y - 16 < MARGEN + 10) {
        hojaNueva();
        encabezado();
      }
      const letra = esTotal ? negrita : fuente;
      if (esTotal) hoja.drawLine({ start: { x: MARGEN, y: y + 11 }, end: { x: ANCHO - MARGEN, y: y + 11 }, thickness: 0.9, color: TINTA });
      hoja.drawText(recortar(rotulo, letra, 9, anchoNombre - 10), { x: MARGEN + 6, y, size: 9, font: letra, color: TINTA });
      columnas.forEach((col, i) => {
        const valor = col.valor(c);
        const tinta = col.rojo && valor > 0 ? color(COLOR_BLOQUEADO) : TINTA;
        centrado(hoja, String(valor), centroColumna(i), y, 9, letra, tinta);
      });
      // Barrita de lo terminado y su porcentaje.
      const pct = porcentajes(c).probado;
      const largo = anchoBarra - 40;
      hoja.drawRectangle({ x: xBarra + 6, y: y - 0.5, width: largo, height: 7, color: LINEA });
      if (pct > 0) hoja.drawRectangle({ x: xBarra + 6, y: y - 0.5, width: (largo * pct) / 100, height: 7, color: color(COLOR_PROBADO) });
      const textoPct = `${pct}%`;
      hoja.drawText(textoPct, { x: ANCHO - MARGEN - 4 - letra.widthOfTextAtSize(textoPct, 9), y, size: 9, font: letra, color: TINTA });
      y -= 5;
      if (!esTotal) hoja.drawLine({ start: { x: MARGEN, y }, end: { x: ANCHO - MARGEN, y }, thickness: 0.4, color: LINEA });
      y -= 12;
    };
    filas.forEach((f) => renglon(f.rotulo, f.cuenta, false));
    if (filas.length > 1) renglon('Total', filas.reduce((suma, f) => sumar(suma, f.cuenta), cuentaVacia()), true);
    y -= 8;
  }

  espacio(60);
  for (const linea of lineas('Cómo leer las tablas: cada columna dice cuántos equipos ya pasaron ese paso. Un equipo probado también cuenta como instalado y direccionado, por eso los números bajan de izquierda a derecha. «Terminado» es lo probado entre los equipos que sí se pueden instalar.', fuente, 8.5, ANCHO - MARGEN * 2)) {
    hoja.drawText(linea, { x: MARGEN, y, size: 8.5, font: fuente, color: GRIS });
    y -= 11;
  }
  y -= 4;

  const todos = planos.flatMap((p) => p.plano.sembrado.equipos);
  const avanceJunto: AvancePlano = Object.assign({}, ...planos.map((p) => p.avance));
  tabla('Avance por nivel', 'Nivel (plano)', planos.map((p) => ({ rotulo: p.plano.nombre, cuenta: contar(p.plano.sembrado.equipos, p.avance) })));
  // Por lazo: se juntan los de todos los planos.
  const porLazo = new Map<string, { rotulo: string; cuenta: Cuenta }>();
  for (const p of planos) {
    for (const r of resumenPorLazo(p.plano.sembrado.equipos, p.avance, lazoDe)) {
      const previa = porLazo.get(r.id);
      porLazo.set(r.id, { rotulo: r.nombre, cuenta: previa ? sumar(previa.cuenta, r.cuenta) : r.cuenta });
    }
  }
  tabla('Avance por lazo', 'Lazo', [...porLazo.entries()].sort(([a, x], [b, z]) => (a === 'sin' ? 1 : b === 'sin' ? -1 : x.rotulo.localeCompare(z.rotulo, 'es', { numeric: true }))).map(([, f]) => f));
  // Por etapa de obra solo si se usan etapas.
  const porEtapa = resumenPorEtapa(todos, avanceJunto);
  if (porEtapa.some((r) => r.etapa !== null)) tabla('Avance por etapa de obra', 'Etapa', porEtapa.map((r) => ({ rotulo: nombreEtapa(r.etapa), cuenta: r.cuenta })));
  tabla('Avance por tipo de equipo', 'Equipo', resumenPorTipo(todos, avanceJunto).map((r) => ({ rotulo: r.nombre, cuenta: r.cuenta })));

  // ---------- Lo que falta y lo terminado ----------
  // Agrupado por lo que le falta a cada equipo, del más cercano a terminar al
  // que no se ha empezado; lo detenido va primero porque es lo que hay que explicar.
  type Renglon = { orden: number; paso: number; rotulo: string; tipo: string; ubicacion: string; plano: string; detalle: string; color: string; bloqueado: boolean; grupo: string };
  const faltantes: Renglon[] = [];
  const terminados: Renglon[] = [];
  planos.forEach((p, orden) => {
    for (const e of equiposQueCuentan(p.plano.sembrado.equipos)) {
      const marca = p.avance[e.id];
      const estado = estadoDe(p.avance, e.id);
      const bloqueo = marca?.bloqueo;
      const datos = datosDeEstado(estado);
      const renglon: Renglon = {
        orden,
        paso: bloqueo ? 99 : ESTADOS_AVANCE.findIndex((x) => x.id === estado),
        rotulo: rotuloDe(e, p.etiquetas),
        tipo: tipoDispositivo(e.tipo).nombre,
        ubicacion: (e.elementoId && ubicaciones.get(e.elementoId)) || '-',
        plano: e.etapa ? `${p.plano.nombre} · E${e.etapa}` : p.plano.nombre,
        detalle: bloqueo ? (bloqueo.nota || bloqueo.motivo) : SIGUIENTE_PASO[estado],
        color: bloqueo ? COLOR_BLOQUEADO : datos.color,
        bloqueado: Boolean(bloqueo),
        grupo: bloqueo ? `Detenidos: ${bloqueo.motivo}` : GRUPO_DE[estado],
      };
      if (estado === 'probado' && !bloqueo) terminados.push(renglon);
      else faltantes.push(renglon);
    }
  });
  // Los planos en orden de nivel (-2, -1, Planta baja, 1…).
  const porPlanoYDireccion = (a: Renglon, b: Renglon) => a.orden - b.orden || a.rotulo.localeCompare(b.rotulo, 'es', { numeric: true });
  faltantes.sort((a, b) => b.paso - a.paso || a.grupo.localeCompare(b.grupo) || porPlanoYDireccion(a, b));
  terminados.sort(porPlanoYDireccion);

  const xs = { rotulo: MARGEN + 8, tipo: MARGEN + 70, ubicacion: MARGEN + 168, plano: MARGEN + 330, detalle: MARGEN + 412 };
  function encabezadoLista(ultima: string) {
    hoja.drawRectangle({ x: MARGEN, y: y - 4, width: ANCHO - MARGEN * 2, height: 14, color: FONDO_SUAVE });
    (['Dirección', 'Equipo', 'Ubicación', 'Plano', ultima] as const).forEach((c, i) => {
      hoja.drawText(limpio(c.toUpperCase()), { x: Object.values(xs)[i], y, size: 6.8, font: negrita, color: GRIS });
    });
    y -= 17;
  }
  function listaDeEquipos(renglones: Renglon[], ultima: (f: Renglon) => string) {
    let grupoActual = '';
    for (const f of renglones) {
      if (f.grupo !== grupoActual) {
        espacio(50);
        grupoActual = f.grupo;
        const cuantos = renglones.filter((x) => x.grupo === f.grupo).length;
        y -= 6;
        hoja.drawRectangle({ x: MARGEN, y: y - 2, width: 8, height: 8, color: color(f.color) });
        hoja.drawText(limpio(`${f.grupo} (${cuantos})`), { x: MARGEN + 13, y, size: 9.5, font: negrita, color: f.bloqueado ? color(COLOR_BLOQUEADO) : TINTA });
        y -= 16;
        encabezadoLista(ultima(f));
      }
      if (y - 14 < MARGEN + 10) {
        hojaNueva();
        encabezadoLista(ultima(f));
      }
      // Sombreado claro del color del paso, con una franja más fuerte a la izquierda.
      hoja.drawRectangle({ x: MARGEN, y: y - 3.5, width: ANCHO - MARGEN * 2, height: 13, color: color(f.color), opacity: 0.14 });
      hoja.drawRectangle({ x: MARGEN, y: y - 3.5, width: 3, height: 13, color: color(f.color) });
      hoja.drawText(recortar(f.rotulo, negrita, 8.5, 60), { x: xs.rotulo, y, size: 8.5, font: negrita, color: TINTA });
      hoja.drawText(recortar(f.tipo, fuente, 8.5, 94), { x: xs.tipo, y, size: 8.5, font: fuente, color: TINTA });
      hoja.drawText(recortar(f.ubicacion, fuente, 8.5, 158), { x: xs.ubicacion, y, size: 8.5, font: fuente, color: TINTA });
      hoja.drawText(recortar(f.plano, fuente, 8.5, 78), { x: xs.plano, y, size: 8.5, font: fuente, color: TINTA });
      hoja.drawText(recortar(f.detalle, fuente, 8.5, ANCHO - MARGEN - xs.detalle - 2), { x: xs.detalle, y, size: 8.5, font: fuente, color: TINTA });
      y -= 14;
    }
  }

  espacio(80);
  titulo(`Lo que falta (${faltantes.length})`);
  if (faltantes.length === 0) {
    hoja.drawText('Todos los equipos están probados y funcionando.', { x: MARGEN, y, size: 10, font: fuente, color: TINTA });
    y -= 16;
  } else {
    hoja.drawText('Agrupado por lo que le falta a cada equipo, del más cercano a terminar al que no se ha empezado.', { x: MARGEN, y, size: 8.5, font: fuente, color: GRIS });
    y -= 12;
  }
  listaDeEquipos(faltantes, (f) => (f.bloqueado ? 'Por qué' : 'Siguiente paso'));

  espacio(80);
  titulo(`Lo que ya está terminado (${terminados.length})`);
  if (terminados.length === 0) {
    hoja.drawText('Todavía no hay equipos probados.', { x: MARGEN, y, size: 10, font: fuente, color: TINTA });
    y -= 16;
  }
  listaDeEquipos(terminados, () => 'Estado');

  // ---------- Evidencias (fotos en miniatura) ----------
  const conFoto: { ruta: string; rotulo: string; texto: string }[] = [];
  for (const p of planos) {
    for (const e of equiposQueCuentan(p.plano.sembrado.equipos)) {
      const marca = p.avance[e.id];
      const ruta = marca?.bloqueo?.foto || marca?.foto;
      if (!ruta || !fotos.has(ruta)) continue;
      const texto = marca?.bloqueo ? `No se puede: ${marca.bloqueo.motivo}` : datosDeEstado(estadoDe(p.avance, e.id)).corto;
      conFoto.push({ ruta, rotulo: `${rotuloDe(e, p.etiquetas)} · ${p.plano.nombre}`, texto });
    }
  }
  if (conFoto.length > 0) {
    const porRenglon = 4;
    const anchoFoto = (ANCHO - MARGEN * 2 - (porRenglon - 1) * 8) / porRenglon;
    const altoFoto = anchoFoto * 0.75;
    // El título no se queda solo al final de la hoja: va con el primer renglón de fotos.
    espacio(altoFoto + 70);
    titulo(`Evidencias fotográficas (${conFoto.length})`);
    for (let i = 0; i < conFoto.length; i += porRenglon) {
      espacio(altoFoto + 30);
      conFoto.slice(i, i + porRenglon).forEach((f, k) => {
        const x = MARGEN + k * (anchoFoto + 8);
        hoja.drawRectangle({ x, y: y - altoFoto, width: anchoFoto, height: altoFoto, borderColor: LINEA, borderWidth: 0.6 });
        const bytes = fotos.get(f.ruta)!;
        imagenes.push({ hoja, x, y: y - altoFoto, ancho: anchoFoto, alto: altoFoto, bytes });
        hoja.drawText(recortar(f.rotulo, negrita, 7.2, anchoFoto), { x, y: y - altoFoto - 9, size: 7.2, font: negrita, color: TINTA });
        hoja.drawText(recortar(f.texto, fuente, 7, anchoFoto), { x, y: y - altoFoto - 18, size: 7, font: fuente, color: GRIS });
      });
      y -= altoFoto + 28;
    }
  }

  // ---------- Firmas ----------
  espacio(110);
  titulo('Conformidad');
  const anchoFirma = (ANCHO - MARGEN * 2 - 30) / 2;
  (['Entrega (nombre y firma)', 'Recibe (nombre y firma)'] as const).forEach((rotulo, i) => {
    const x = MARGEN + i * (anchoFirma + 30);
    hoja.drawLine({ start: { x, y: y - 50 }, end: { x: x + anchoFirma, y: y - 50 }, thickness: 0.8, color: TINTA });
    hoja.drawText(limpio(rotulo), { x, y: y - 62, size: 8.5, font: fuente, color: GRIS });
  });
  hoja.drawText(limpio(`Fecha: ${fecha}`), { x: MARGEN, y: y - 82, size: 8.5, font: fuente, color: GRIS });
  y -= 92;
  pie(hoja);

  // Las fotos se ponen al final (embedJpg es asíncrono); si una no se entiende, queda el recuadro vacío.
  for (const im of imagenes) {
    try {
      const esPng = im.bytes[0] === 0x89 && im.bytes[1] === 0x50;
      const imagen = esPng ? await pdf.embedPng(im.bytes) : await pdf.embedJpg(im.bytes);
      const escala = Math.min(im.ancho / imagen.width, im.alto / imagen.height);
      const w = imagen.width * escala;
      const h = imagen.height * escala;
      im.hoja.drawImage(imagen, { x: im.x + (im.ancho - w) / 2, y: im.y + (im.alto - h) / 2, width: w, height: h });
    } catch (e) {
      console.error('Foto del reporte que no se pudo poner:', e);
    }
  }

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
    // El plano completo en una hoja carta horizontal (vectorial, se puede
    // acercar): a su tamaño real (3000 pt) el visor lo mostraba recortado.
    const origen = await PDFDocument.load(bytes);
    const [embebida] = await pdf.embedPdf(origen, [0]);
    const pagina = pdf.addPage([ALTO, ANCHO]);
    const encabezado = 40;
    const escala = Math.min((ALTO - MARGEN * 2) / embebida.width, (ANCHO - MARGEN * 2 - encabezado) / embebida.height);
    const w = embebida.width * escala;
    const h = embebida.height * escala;
    const x = (ALTO - w) / 2;
    const yPlano = MARGEN + (ANCHO - MARGEN * 2 - encabezado - h) / 2;
    pagina.drawText(recortar(`${p.plano.nombre} · Avance al ${fecha}`, negrita, 12, ALTO - MARGEN * 2), { x: MARGEN, y: ANCHO - MARGEN - 12, size: 12, font: negrita, color: TINTA });
    pagina.drawPage(embebida, { x, y: yPlano, width: w, height: h });
    pagina.drawRectangle({ x, y: yPlano, width: w, height: h, borderColor: LINEA, borderWidth: 0.6 });
    // Leyenda con la letra de cada estado (no solo el color).
    let xLey = MARGEN;
    for (const t of tramos) {
      const texto = limpio(`${t.letra} ${t.nombre}`);
      pagina.drawCircle({ x: xLey + 4, y: ANCHO - MARGEN - 27, size: 4, color: color(t.color) });
      pagina.drawText(texto, { x: xLey + 12, y: ANCHO - MARGEN - 30, size: 7.8, font: fuente, color: TINTA });
      xLey += 22 + fuente.widthOfTextAtSize(texto, 7.8);
    }
    pie(pagina);
  }

  return pdf.save();
}
