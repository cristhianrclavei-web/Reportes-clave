import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import {
  NAVY, GRAY_LINE, GRAY_TEXT, WHITE, MARGIN, embedBrandFonts, drawBadge, drawWordmark,
} from './pdfBranding';
import { MARCA } from './marca';
import {
  Elemento, Lazo, NOMBRE_CIRCUITO, armarDiagrama, colgantesEnLinea, cuantosEnRama, direccionVisible, enOrdenDeRecorrido, hijosDe, posiciones, tipoDispositivo,
} from './lazos';

// PDF del diagrama unifilar de un lazo, dibujado en vectores (se ve nítido
// al imprimir o ampliar). Mismo acomodo que la pantalla (DiagramaLazo.tsx):
// la línea principal corre a lo ancho, hasta 10 dispositivos por renglón,
// y al terminar un renglón la línea baja por la derecha y regresa al
// siguiente; lo que cuelga va debajo y las ramas en estrella lado a lado.
// Las ramas largas (armarDiagrama) se dibujan después como su propia línea
// («Rama A · sale de …»), así ningún renglón es más alto que la hoja.
// Después del diagrama va la lista de dispositivos en orden.

// Hoja carta horizontal.
const ANCHO = 792;
const ALTO = 612;
const ABAJO = MARGIN + 22; // deja lugar al pie
const AMBAR = rgb(0.8, 0.5, 0.08);
const LINEA = rgb(0.35, 0.4, 0.45);
const FONDO_TABLA = rgb(0.95, 0.96, 0.97);

// Medidas del diagrama.
const COLUMNA = 62; // ancho de un dispositivo
const X_ENTRADA = MARGIN + 17; // por donde baja la línea a cada renglón
const X_INICIO = MARGIN + 30; // primer dispositivo del renglón
const ANCHO_UTIL = ANCHO - MARGIN - 8 - X_INICIO;
const POR_RENGLON = Math.min(10, Math.floor(ANCHO_UTIL / COLUMNA));
const ALTO_NODO = 50; // bajada + símbolo + nombre + dirección
const ALTO_NIVEL = 58; // de un nivel de rama al siguiente
const BAJADA = 10;

// Las fuentes de respaldo (Helvetica) no traen Ω ni otros símbolos.
function t(texto: string): string {
  return (texto || '').replace(/Ω/g, ' ohm').replace(/[^\x20-\xFF–—‘’“”…]/g, '');
}

// Recorta un texto con «…» para que quepa en `ancho`.
function cabe(texto: string, fuente: PDFFont, tam: number, ancho: number): string {
  let s = t(texto);
  if (fuente.widthOfTextAtSize(s, tam) <= ancho) return s;
  while (s.length > 1 && fuente.widthOfTextAtSize(`${s}…`, tam) > ancho) s = s.slice(0, -1);
  return `${s}…`;
}

function partir(texto: string, fuente: PDFFont, tam: number, ancho: number): string[] {
  const palabras = t(texto).split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let linea = '';
  for (const p of palabras) {
    const prueba = linea ? `${linea} ${p}` : p;
    if (fuente.widthOfTextAtSize(prueba, tam) > ancho && linea) {
      lineas.push(linea);
      linea = p;
    } else {
      linea = prueba;
    }
  }
  if (linea) lineas.push(linea);
  return lineas.length ? lineas : [''];
}

function fechaMexico(): string {
  return new Date().toLocaleString('es-MX', {
    timeZone: MARCA.zonaHoraria || 'America/Mexico_City', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export async function generateLazoPdf(lazo: Lazo, elementos: Elemento[], cliente: string): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const { font, bold, display } = await embedBrandFonts(pdfDoc);
  pdfDoc.setTitle(`Diagrama unifilar ${lazo.codigo} ${lazo.nombre}`);

  let page: PDFPage = pdfDoc.addPage([ANCHO, ALTO]);
  let y = ALTO - MARGIN;
  let hoja = 1;
  const generado = fechaMexico();
  const titulo = `${lazo.codigo} ${lazo.nombre}`;

  function pie() {
    page.drawText(t(`${cliente} · ${titulo} · Generado el ${generado} · ${MARCA.nombre} · Hoja ${hoja}`), {
      x: MARGIN, y: MARGIN / 2, size: 6.5, font, color: GRAY_TEXT,
    });
  }

  // Encabezado completo en la primera hoja; en las demás, uno corto.
  function encabezado(completo: boolean, rotulo: string) {
    const top = y;
    if (completo) {
      drawBadge(page, display, MARGIN, top, 34);
      drawWordmark(page, display, MARGIN + 44, top - 13, 12);
      page.drawText(rotulo, { x: ANCHO - MARGIN - display.widthOfTextAtSize(rotulo, 13), y: top - 10, size: 13, font: display, color: NAVY });
      const sub = `Generado el ${generado}`;
      page.drawText(t(sub), { x: ANCHO - MARGIN - font.widthOfTextAtSize(t(sub), 7.5), y: top - 23, size: 7.5, font, color: GRAY_TEXT });
      y = top - 48;
      page.drawText(t(cliente), { x: MARGIN, y, size: 15, font: display, color: NAVY, maxWidth: ANCHO - MARGIN * 2 });
      y -= 14;
      const datos = [
        titulo, NOMBRE_CIRCUITO[lazo.tipo], lazo.clase ? `Clase ${lazo.clase}` : '', lazo.panel ? `Panel ${lazo.panel}` : '',
        `${elementos.length} dispositivos`,
      ].filter(Boolean).join('  ·  ');
      page.drawText(t(datos), { x: MARGIN, y, size: 8.5, font, color: GRAY_TEXT, maxWidth: ANCHO - MARGIN * 2 });
      y -= 10;
    } else {
      page.drawText(t(`${rotulo} · ${titulo}`), { x: MARGIN, y: top - 10, size: 10, font: display, color: NAVY });
      y = top - 18;
    }
    page.drawLine({ start: { x: MARGIN, y }, end: { x: ANCHO - MARGIN, y }, thickness: 1.5, color: NAVY });
    y -= 14;
  }

  function hojaNueva(rotulo: string) {
    pie();
    page = pdfDoc.addPage([ANCHO, ALTO]);
    hoja++;
    y = ALTO - MARGIN;
    encabezado(false, rotulo);
  }

  // ---------- Símbolos ----------

  function simbolo(tipo: string, cx: number, arriba: number, color = NAVY) {
    const forma = tipoDispositivo(tipo).forma;
    if (forma === 'detector') {
      // Hexágono como en sus planos, con S (humo) o C (calor).
      const escala = 0.62;
      page.drawSvgPath('M10 2h18l9 15-9 15H10L1 17z', { x: cx - 19 * escala, y: arriba + 1, scale: escala, borderColor: color, borderWidth: 1.1, color: WHITE });
      const letra = tipo === 'SC' ? 'C' : 'S';
      page.drawText(letra, { x: cx - bold.widthOfTextAtSize(letra, 8) / 2, y: arriba - 12.5, size: 8, font: bold, color });
      return;
    }
    if (forma === 'caja') {
      page.drawCircle({ x: cx, y: arriba - 10, size: 10, borderColor: AMBAR, borderWidth: 1, borderDashArray: [2, 1.6], color: WHITE });
      page.drawText('RG', { x: cx - bold.widthOfTextAtSize('RG', 6) / 2, y: arriba - 12, size: 6, font: bold, color: AMBAR });
      return;
    }
    if (forma === 'fin') {
      page.drawCircle({ x: cx, y: arriba - 9, size: 8, borderColor: color, borderWidth: 1, color: WHITE });
      page.drawText('FDL', { x: cx - bold.widthOfTextAtSize('FDL', 5) / 2, y: arriba - 11, size: 5, font: bold, color });
      return;
    }
    const ancho = Math.max(22, bold.widthOfTextAtSize(tipo, 7) + 8);
    page.drawRectangle({ x: cx - ancho / 2, y: arriba - 19, width: ancho, height: 18, borderColor: color, borderWidth: 1.1, color: WHITE });
    page.drawText(tipo, { x: cx - bold.widthOfTextAtSize(tipo, 7) / 2, y: arriba - 12.5, size: 7, font: bold, color });
  }

  function linea(x1: number, y1: number, x2: number, y2: number) {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.9, color: LINEA });
  }

  // ---------- Acomodo: línea principal y ramas largas aparte ----------

  const acomodo = armarDiagrama(elementos);
  const principal = acomodo.principal;
  const letraDe = (e: Elemento) => acomodo.letraDeRama.get(e.id);

  // Cuántas columnas y niveles ocupa una rama colgada (las ramas en estrella
  // lado a lado, lo que va en serie debajo). Una rama larga solo ocupa su
  // etiqueta: se dibuja aparte.
  function unidadesDe(lista: Elemento[], vueltas = 0): number {
    let suma = 0;
    for (const h of lista) suma += letraDe(h) || vueltas > 50 ? 1 : unidadesDe(hijosDe(elementos, h.id), vueltas + 1);
    return Math.max(1, suma);
  }
  function nivelesDe(lista: Elemento[], vueltas = 0): number {
    let mayor = 0;
    for (const h of lista) {
      const n = letraDe(h) || vueltas > 50 ? 1 : 1 + nivelesDe(hijosDe(elementos, h.id), vueltas + 1);
      mayor = Math.max(mayor, n);
    }
    return mayor;
  }

  // Etiqueta de una rama que se dibuja aparte.
  function etiquetaRama(letra: string, cx: number, arriba: number) {
    const texto = `Rama ${letra}`;
    const ancho = bold.widthOfTextAtSize(texto, 7) + 10;
    page.drawRectangle({ x: cx - ancho / 2, y: arriba - 14, width: ancho, height: 13, borderColor: NAVY, borderWidth: 0.9, color: rgb(0.9, 0.97, 0.95) });
    page.drawText(texto, { x: cx - bold.widthOfTextAtSize(texto, 7) / 2, y: arriba - 10, size: 7, font: bold, color: NAVY });
  }

  // Un dispositivo y lo que cuelga (`colgantes`), en la franja [x, x + ancho].
  function nodo(e: Elemento, colgantes: Elemento[], x: number, ancho: number, arriba: number, columna: number, vueltas = 0) {
    const cx = x + ancho / 2;
    linea(cx, arriba, cx, arriba - BAJADA);
    simbolo(e.tipo, cx, arriba - BAJADA);
    const anchoTexto = Math.min(ancho, columna) - 4;
    const nombre = cabe(e.nombre, bold, 6.8, anchoTexto);
    page.drawText(nombre, { x: cx - bold.widthOfTextAtSize(nombre, 6.8) / 2, y: arriba - 39, size: 6.8, font: bold, color: NAVY });
    const direccion = direccionVisible(e.direccion, lazo.numero);
    if (direccion) {
      page.drawText(direccion, { x: cx - font.widthOfTextAtSize(direccion, 6.5) / 2, y: arriba - 47.5, size: 6.5, font, color: GRAY_TEXT });
    }
    if (colgantes.length === 0 || vueltas > 50) return;

    const fondo = arriba - ALTO_NODO;
    const anchoUnidad = ancho / unidadesDe(colgantes);
    // Una sola rama baja directo; varias (estrella) salen de una barra.
    const barra = colgantes.length === 1 ? arriba - ALTO_NIVEL : arriba - ALTO_NIVEL + 2;
    linea(cx, fondo, cx, barra);
    let xHijo = x;
    const centros: number[] = [];
    for (const h of colgantes) {
      const letra = letraDe(h);
      const anchoHijo = (letra ? 1 : unidadesDe(hijosDe(elementos, h.id))) * anchoUnidad;
      const centro = xHijo + anchoHijo / 2;
      centros.push(centro);
      if (letra) {
        linea(centro, barra, centro, barra - 4);
        etiquetaRama(letra, centro, barra - 4);
      } else {
        nodo(h, hijosDe(elementos, h.id), xHijo, anchoHijo, barra, columna, vueltas + 1);
      }
      xHijo += anchoHijo;
    }
    if (centros.length > 1) linea(centros[0], barra, centros[centros.length - 1], barra);
  }

  // Una línea (la principal o una rama larga) en renglones; cambia de hoja
  // entre renglones cuando ya no cabe el siguiente.
  function dibujarLinea(lista: Elemento[], rotulo: string) {
    type Renglon = { elementos: Elemento[]; colgantes: Elemento[][]; columnas: number };
    const renglones: Renglon[] = [];
    lista.forEach((e, i) => {
      const colg = colgantesEnLinea(elementos, lista, i);
      const u = colg.length ? unidadesDe(colg) : 1;
      const actual = renglones[renglones.length - 1];
      // Renglón nuevo si ya hay 10 o si sus ramas ya no caben a lo ancho.
      const lleno = !actual || actual.elementos.length >= POR_RENGLON || actual.columnas + u > POR_RENGLON;
      if (lleno) renglones.push({ elementos: [e], colgantes: [colg], columnas: u });
      else {
        actual.elementos.push(e);
        actual.colgantes.push(colg);
        actual.columnas += u;
      }
    });

    renglones.forEach((r, i) => {
      const columna = r.columnas > POR_RENGLON ? ANCHO_UTIL / r.columnas : COLUMNA;
      const nivelesRenglon = 1 + Math.max(0, ...r.colgantes.map((c) => nivelesDe(c)));
      const alto = 14 + ALTO_NODO + (nivelesRenglon - 1) * ALTO_NIVEL + 12;
      if (y - alto < ABAJO) {
        // Aviso de que la línea sigue en la otra hoja.
        page.drawText('La línea continúa en la siguiente hoja', { x: X_ENTRADA + 4, y: y - 10, size: 7, font, color: GRAY_TEXT });
        hojaNueva(rotulo);
        page.drawText('Viene de la hoja anterior', { x: X_ENTRADA + 4, y: y - 2, size: 7, font, color: GRAY_TEXT });
        y -= 6;
      }
      const yLinea = y - 14;
      const xFin = X_INICIO + r.columnas * columna;
      // Entrada al renglón (del PCI, del origen de la rama o del regreso del renglón anterior).
      linea(X_ENTRADA, y, X_ENTRADA, yLinea);
      linea(X_ENTRADA, yLinea, xFin, yLinea);

      let x = X_INICIO;
      r.elementos.forEach((e, k) => {
        const colg = r.colgantes[k];
        const ancho = (colg.length ? unidadesDe(colg) : 1) * columna;
        nodo(e, colg, x, ancho, yLinea, columna);
        x += ancho;
      });

      const fondo = y - alto;
      if (i < renglones.length - 1) {
        // Salto de renglón: baja por la derecha y regresa por abajo, para que
        // se lea en serie y no como otra salida del panel.
        linea(xFin + 6, yLinea, xFin + 6, fondo);
        linea(xFin, yLinea, xFin + 6, yLinea);
        linea(X_ENTRADA, fondo, xFin + 6, fondo);
      }
      y = fondo;
    });
  }

  encabezado(true, 'DIAGRAMA UNIFILAR');

  // Símbolos usados, como leyenda.
  const usados = [...new Set(elementos.map((e) => e.tipo))];
  if (usados.length > 0) {
    let xLeyenda = MARGIN;
    page.drawText('SÍMBOLOS', { x: xLeyenda, y: y - 8, size: 6.5, font: bold, color: GRAY_TEXT });
    xLeyenda += 46;
    for (const tipo of usados) {
      const nombre = t(`${tipo} ${tipoDispositivo(tipo).nombre}`);
      const anchoItem = 30 + font.widthOfTextAtSize(nombre, 7) + 14;
      if (xLeyenda + anchoItem > ANCHO - MARGIN) break;
      simbolo(tipo, xLeyenda + 13, y + 2);
      page.drawText(nombre, { x: xLeyenda + 30, y: y - 9, size: 7, font, color: NAVY });
      xLeyenda += anchoItem;
    }
    y -= 30;
  }

  // Tablero: el PCI arriba a la izquierda; de él baja la línea.
  page.drawRectangle({ x: MARGIN, y: y - 18, width: 34, height: 18, borderColor: NAVY, borderWidth: 1.4, color: WHITE });
  page.drawText('PCI', { x: MARGIN + 17 - bold.widthOfTextAtSize('PCI', 8) / 2, y: y - 12.5, size: 8, font: bold, color: NAVY });
  page.drawText(t(`${lazo.panel || 'Panel'} · salida del lazo`), { x: MARGIN + 42, y: y - 12.5, size: 7.5, font, color: GRAY_TEXT });
  y -= 18;

  if (principal.length === 0) {
    page.drawText('Todavía no hay dispositivos capturados en este lazo.', { x: MARGIN, y: y - 20, size: 9, font, color: GRAY_TEXT });
  }
  dibujarLinea(principal, 'DIAGRAMA UNIFILAR');

  // Cada rama larga: su título y su línea. Si el título y el primer
  // renglón no caben, empieza en otra hoja.
  for (const bloque of acomodo.bloques) {
    const rotulo = bloque.origen ? `RAMA ${bloque.letra}` : 'SIN CONECTAR';
    if (y - 110 < ABAJO) hojaNueva('DIAGRAMA UNIFILAR');
    y -= 16;
    page.drawLine({ start: { x: MARGIN, y: y + 6 }, end: { x: ANCHO - MARGIN, y: y + 6 }, thickness: 0.5, color: GRAY_LINE, dashArray: [3, 2] });
    const etiqueta = bloque.origen ? `Rama ${bloque.letra}` : 'Sin conectar';
    const anchoEtiqueta = bold.widthOfTextAtSize(etiqueta, 8) + 12;
    page.drawRectangle({ x: MARGIN, y: y - 18, width: anchoEtiqueta, height: 16, color: NAVY });
    page.drawText(etiqueta, { x: MARGIN + 6, y: y - 13, size: 8, font: bold, color: WHITE });
    const cuantos = cuantosEnRama(elementos, bloque.linea[0].id);
    let detalle: string;
    if (bloque.origen) {
      const direccion = direccionVisible(bloque.origen.direccion, lazo.numero);
      detalle = t(`sale de ${bloque.origen.nombre}${direccion ? ` (${direccion})` : ''} · ${cuantos} dispositivos`);
    } else {
      detalle = t(`falta unirlo al lazo · ${cuantos} dispositivos`);
    }
    page.drawText(detalle, { x: MARGIN + anchoEtiqueta + 8, y: y - 13, size: 7.5, font, color: GRAY_TEXT });
    y -= 18;
    dibujarLinea(bloque.linea, `DIAGRAMA UNIFILAR · ${rotulo}`);
  }

  // ---------- Lista de dispositivos ----------

  hojaNueva('LISTA DE DISPOSITIVOS');
  const pos = posiciones(elementos);
  const porId = new Map(elementos.map((e) => [e.id, e]));
  const columnas = [
    { titulo: 'LUGAR', ancho: 52 },
    { titulo: 'NOMBRE', ancho: 110 },
    { titulo: 'DIRECCIÓN', ancho: 70 },
    { titulo: 'TIPO', ancho: 150 },
    { titulo: 'UBICACIÓN', ancho: 0 },
    { titulo: 'CUELGA DE', ancho: 120 },
  ];
  const ocupado = columnas.reduce((s, c) => s + c.ancho, 0);
  columnas[4].ancho = ANCHO - MARGIN * 2 - ocupado;
  const xs: number[] = [];
  columnas.reduce((xc, c) => { xs.push(xc); return xc + c.ancho; }, MARGIN);

  function encabezadoTabla() {
    page.drawRectangle({ x: MARGIN, y: y - 14, width: ANCHO - MARGIN * 2, height: 14, color: NAVY });
    columnas.forEach((c, i) => page.drawText(c.titulo, { x: xs[i] + 4, y: y - 10, size: 6.5, font: bold, color: WHITE }));
    y -= 14;
  }
  encabezadoTabla();

  enOrdenDeRecorrido(elementos).forEach((e, k) => {
    const padre = e.padre_id ? porId.get(e.padre_id) : null;
    const celdas = [
      e.padre_id ? 'Rama' : `Pos. ${pos.get(e.id) || ''}`,
      e.nombre,
      direccionVisible(e.direccion, lazo.numero) || '—',
      `${e.tipo} · ${tipoDispositivo(e.tipo).nombre}`,
      e.ubicacion || '—',
      padre ? padre.nombre : '—',
    ];
    const lineas = celdas.map((c, i) => partir(c, i === 1 ? bold : font, 7.5, columnas[i].ancho - 8).slice(0, 3));
    const alto = Math.max(...lineas.map((l) => l.length)) * 9.5 + 6;
    if (y - alto < ABAJO) {
      hojaNueva('LISTA DE DISPOSITIVOS');
      encabezadoTabla();
    }
    if (k % 2 === 1) page.drawRectangle({ x: MARGIN, y: y - alto, width: ANCHO - MARGIN * 2, height: alto, color: FONDO_TABLA });
    lineas.forEach((ls, i) => ls.forEach((l, j) => {
      page.drawText(l, { x: xs[i] + 4, y: y - 10 - j * 9.5, size: 7.5, font: i === 1 ? bold : font, color: i === 0 && e.padre_id ? GRAY_TEXT : NAVY });
    }));
    y -= alto;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: ANCHO - MARGIN, y }, thickness: 0.4, color: GRAY_LINE });
  });
  if (elementos.length === 0) {
    page.drawText('Sin dispositivos.', { x: MARGIN + 4, y: y - 12, size: 8.5, font, color: GRAY_TEXT });
  }
  pie();

  return pdfDoc.save();
}
