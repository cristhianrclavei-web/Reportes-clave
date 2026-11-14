// PDF del buscador de visitas: una tabla sencilla (carta horizontal) para
// tener evidencia impresa de qué días se visitó a un cliente o dónde estuvo
// un técnico. Se arma en el navegador con lo que ya está en pantalla.

import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';

export type TablaVisitas = {
  empresa: string;
  titulo: string;
  subtitulo: string;
  // Notas arriba de la tabla (resumen, avisos).
  notas: string[];
  columnas: { titulo: string; ancho: number }[];
  // `aviso`: la fila se pinta en rojo (visita sin registro).
  filas: { celdas: string[]; aviso?: boolean; encabezado?: boolean }[];
};

const ANCHO = 792;
const ALTO = 612;
const MARGEN = 36;
const TINTA = rgb(0.06, 0.15, 0.23);
const GRIS = rgb(0.42, 0.46, 0.5);
const LINEA = rgb(0.8, 0.82, 0.84);
const ROJO = rgb(0.78, 0.16, 0.16);

// Helvetica solo trae letras latinas: lo demás se cambia para que no truene.
function limpio(valor: string): string {
  return valor.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/[^\x20-\xFF]/g, '?');
}

function recortar(valor: string, fuente: PDFFont, tam: number, ancho: number): string {
  let t = limpio(valor);
  if (fuente.widthOfTextAtSize(t, tam) <= ancho) return t;
  while (t.length > 1 && fuente.widthOfTextAtSize(`${t}...`, tam) > ancho) t = t.slice(0, -1);
  return `${t}...`;
}

export async function visitasPdf(tabla: TablaVisitas): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(limpio(tabla.titulo));
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const generado = new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' });

  // Los anchos vienen en proporción; se reparten en el ancho útil.
  const util = ANCHO - MARGEN * 2;
  const suma = tabla.columnas.reduce((total, c) => total + c.ancho, 0);
  const anchos = tabla.columnas.map((c) => (c.ancho / suma) * util);
  const equis = anchos.map((_, i) => MARGEN + anchos.slice(0, i).reduce((total, a) => total + a, 0));

  let hoja = pdf.addPage([ANCHO, ALTO]);
  let y = ALTO - MARGEN;
  let pagina = 1;

  function pie() {
    hoja.drawText(limpio(`${tabla.empresa} · Generado el ${generado} · Hoja ${pagina}`), { x: MARGEN, y: 20, size: 7.5, font: fuente, color: GRIS });
  }
  function encabezadoDeTabla() {
    tabla.columnas.forEach((c, i) => {
      hoja.drawText(limpio(c.titulo.toUpperCase()), { x: equis[i], y, size: 7, font: negrita, color: GRIS });
    });
    y -= 5;
    hoja.drawLine({ start: { x: MARGEN, y }, end: { x: ANCHO - MARGEN, y }, thickness: 0.8, color: TINTA });
    y -= 12;
  }
  function hojaNueva() {
    pie();
    hoja = pdf.addPage([ANCHO, ALTO]);
    pagina += 1;
    y = ALTO - MARGEN;
    encabezadoDeTabla();
  }

  hoja.drawText(limpio(tabla.empresa), { x: MARGEN, y: y - 4, size: 10, font: negrita, color: GRIS });
  hoja.drawText(recortar(tabla.titulo, negrita, 16, util), { x: MARGEN, y: y - 24, size: 16, font: negrita, color: TINTA });
  hoja.drawText(recortar(tabla.subtitulo, fuente, 10, util), { x: MARGEN, y: y - 40, size: 10, font: fuente, color: GRIS });
  y -= 56;
  for (const nota of tabla.notas) {
    hoja.drawText(recortar(nota, fuente, 9, util), { x: MARGEN, y, size: 9, font: fuente, color: TINTA });
    y -= 13;
  }
  y -= 8;
  encabezadoDeTabla();

  if (tabla.filas.length === 0) {
    hoja.drawText('Sin resultados en estas fechas.', { x: MARGEN, y, size: 10, font: fuente, color: TINTA });
  }
  for (const fila of tabla.filas) {
    if (y < MARGEN + 16) hojaNueva();
    const letra = fila.encabezado ? negrita : fuente;
    const color = fila.aviso ? ROJO : TINTA;
    if (fila.encabezado) {
      hoja.drawRectangle({ x: MARGEN, y: y - 4, width: util, height: 14, color: rgb(0.94, 0.95, 0.96) });
    }
    fila.celdas.forEach((celda, i) => {
      // La fila de encabezado (el día) puede usar todo el ancho.
      const ancho = fila.encabezado ? util - (equis[i] - MARGEN) - 6 : anchos[i] - 6;
      if (celda) hoja.drawText(recortar(celda, letra, 8.8, ancho), { x: equis[i] + (fila.encabezado ? 4 : 0), y, size: 8.8, font: letra, color });
    });
    y -= 4;
    if (!fila.encabezado) hoja.drawLine({ start: { x: MARGEN, y }, end: { x: ANCHO - MARGEN, y }, thickness: 0.35, color: LINEA });
    y -= 11;
  }
  pie();
  return pdf.save();
}
