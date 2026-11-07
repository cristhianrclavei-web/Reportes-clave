// PDF del plano con lo sembrado: la hoja original del PDF (vectorial, nítida
// a cualquier zoom) con los equipos y la tubería encima, y una segunda hoja
// con la simbología y el cuadro de cantidades. Se arma en el navegador: los
// planos pesan varios MB y una función de Vercel no regresa más de 4.5 MB.

import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from 'pdf-lib';
import { tipoDispositivo } from './lazos';
import {
  cantidadesDeEquipos, cantidadesDeTuberia, colocacionDePagina, colorEquipo, colorTuberia, formatoMetros,
  proporcionDeEscala, tamanoSimbolo, type Plano,
} from './planos';

function color(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// Helvetica solo trae letras latinas: lo demás se cambia para que no truene.
function texto(valor: string): string {
  return valor.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/[^\x20-\xFF]/g, '?');
}

// Símbolo con el centro en (cx, cy) en coordenadas del PDF (y hacia arriba).
function dibujarSimbolo(hoja: PDFPage, fuente: PDFFont, tipo: string, cx: number, cy: number, r: number) {
  const t = tipoDispositivo(tipo);
  const tinta = color(colorEquipo(tipo));
  const blanco = rgb(1, 1, 1);
  const grosor = Math.max(0.4, r / 7);
  if (t.forma === 'detector') {
    // Hexágono como en el diagrama del lazo (en coordenadas con y hacia abajo).
    const a = r * 0.55;
    const camino = `M ${-a} ${-r * 0.9} L ${a} ${-r * 0.9} L ${r} 0 L ${a} ${r * 0.9} L ${-a} ${r * 0.9} L ${-r} 0 Z`;
    hoja.drawSvgPath(camino, { x: cx, y: cy, color: blanco, borderColor: tinta, borderWidth: grosor });
    const letra = tipo === 'SC' ? 'C' : 'S';
    const tam = r * 1.1;
    hoja.drawText(letra, { x: cx - fuente.widthOfTextAtSize(letra, tam) / 2, y: cy - tam * 0.36, size: tam, font: fuente, color: tinta });
    return;
  }
  if (t.forma === 'caja' || t.forma === 'fin') {
    hoja.drawCircle({ x: cx, y: cy, size: r, color: blanco, borderColor: tinta, borderWidth: grosor, borderDashArray: t.forma === 'caja' ? [r / 3, r / 4] : undefined });
    const codigo = t.forma === 'caja' ? 'RG' : 'FDL';
    const tam = r * (codigo.length > 2 ? 0.6 : 0.8);
    hoja.drawText(codigo, { x: cx - fuente.widthOfTextAtSize(codigo, tam) / 2, y: cy - tam * 0.36, size: tam, font: fuente, color: tinta });
    return;
  }
  const ancho = r * (tipo.length > 2 ? 2.4 : 2);
  hoja.drawRectangle({ x: cx - ancho / 2, y: cy - r * 0.8, width: ancho, height: r * 1.6, color: blanco, borderColor: tinta, borderWidth: grosor });
  const tam = r * (tipo.length > 2 ? 0.75 : 0.9);
  hoja.drawText(texto(tipo), { x: cx - fuente.widthOfTextAtSize(texto(tipo), tam) / 2, y: cy - tam * 0.36, size: tam, font: fuente, color: tinta });
}

export type DatosExportar = {
  plano: Plano;
  pdfOriginal: ArrayBuffer | Uint8Array;
  cliente: string;
  // Texto junto a cada equipo ligado a un dispositivo (dirección o nombre).
  etiquetas: Map<string, string>;
};

export async function exportarPlanoPdf({ plano, pdfOriginal, cliente, etiquetas }: DatosExportar): Promise<Uint8Array> {
  const original = await PDFDocument.load(pdfOriginal, { ignoreEncryption: true });
  const paginaOriginal = original.getPage(plano.pagina - 1);
  const caja = paginaOriginal.getCropBox();
  const giro = paginaOriginal.getRotation().angle;

  const pdf = await PDFDocument.create();
  pdf.setTitle(texto(`Sembrado - ${plano.nombre}`));
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Hoja 1: el plano tal como se ve en pantalla (ya girado), con lo sembrado.
  const W = plano.ancho;
  const H = plano.alto;
  const hoja = pdf.addPage([W, H]);
  const embebida = await pdf.embedPage(paginaOriginal, { left: caja.x, bottom: caja.y, right: caja.x + caja.width, top: caja.y + caja.height });
  const lugar = colocacionDePagina(giro, caja.width, caja.height);
  hoja.drawPage(embebida, { x: lugar.x, y: lugar.y, rotate: degrees(lugar.giro) });

  const r = tamanoSimbolo(W, H) / 2;
  for (const t of plano.sembrado.tuberias) {
    const camino = t.puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
    hoja.drawSvgPath(camino, { x: 0, y: H, borderColor: color(colorTuberia(t.diametro)), borderWidth: Math.max(0.6, r / 3.5), borderOpacity: 0.9 });
  }
  for (const e of plano.sembrado.equipos) {
    const cx = e.x;
    const cy = H - e.y;
    dibujarSimbolo(hoja, negrita, e.tipo, cx, cy, r);
    const rotulo = (e.elementoId && etiquetas.get(e.elementoId)) || e.etiqueta;
    if (rotulo) {
      const tam = r * 0.85;
      hoja.drawText(texto(rotulo), { x: cx + r * 1.25, y: cy + r * 0.55, size: tam, font: negrita, color: color(colorEquipo(e.tipo)) });
    }
  }

  // Hoja 2: simbología y cantidades (carta horizontal).
  const resumen = pdf.addPage([792, 612]);
  const margen = 48;
  let y = 612 - margen;
  const tinta = rgb(0.1, 0.12, 0.16);
  const gris = rgb(0.42, 0.45, 0.5);
  resumen.drawText(texto(`Sembrado de equipos · ${plano.nombre}`), { x: margen, y: y - 18, size: 18, font: negrita, color: tinta });
  y -= 40;
  const escala = plano.metros_por_unidad ? `Escala aprox. 1:${proporcionDeEscala(plano.metros_por_unidad)}` : 'Sin escala: los metros no se calcularon';
  const fecha = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Mexico_City' });
  resumen.drawText(texto(`${cliente} · ${escala} · ${fecha}`), { x: margen, y, size: 10.5, font: fuente, color: gris });
  y -= 34;

  // Columna izquierda: equipos.
  const equipos = cantidadesDeEquipos(plano.sembrado);
  let yIzq = y;
  resumen.drawText('EQUIPOS', { x: margen, y: yIzq, size: 9.5, font: negrita, color: gris });
  yIzq -= 22;
  for (const fila of equipos) {
    dibujarSimbolo(resumen, negrita, fila.tipo, margen + 12, yIzq + 3, 8);
    resumen.drawText(texto(fila.nombre), { x: margen + 32, y: yIzq, size: 11, font: fuente, color: tinta });
    const cuantos = String(fila.cuantos);
    resumen.drawText(cuantos, { x: margen + 320 - negrita.widthOfTextAtSize(cuantos, 11), y: yIzq, size: 11, font: negrita, color: tinta });
    yIzq -= 24;
    if (yIzq < margen) break;
  }
  if (equipos.length === 0) resumen.drawText('Sin equipos sembrados.', { x: margen, y: yIzq, size: 11, font: fuente, color: gris });
  const totalEquipos = plano.sembrado.equipos.length;
  if (totalEquipos > 0 && yIzq > margen) {
    resumen.drawLine({ start: { x: margen, y: yIzq + 14 }, end: { x: margen + 320, y: yIzq + 14 }, thickness: 0.6, color: gris });
    resumen.drawText('Total', { x: margen + 32, y: yIzq - 2, size: 11, font: negrita, color: tinta });
    const total = String(totalEquipos);
    resumen.drawText(total, { x: margen + 320 - negrita.widthOfTextAtSize(total, 11), y: yIzq - 2, size: 11, font: negrita, color: tinta });
  }

  // Columna derecha: tubería.
  const x0 = 430;
  let yDer = y;
  resumen.drawText('CANALIZACIÓN', { x: x0, y: yDer, size: 9.5, font: negrita, color: gris });
  yDer -= 22;
  const tuberias = cantidadesDeTuberia(plano.sembrado, plano.metros_por_unidad);
  let totalMetros = 0;
  for (const fila of tuberias) {
    resumen.drawLine({ start: { x: x0, y: yDer + 4 }, end: { x: x0 + 22, y: yDer + 4 }, thickness: 3, color: color(colorTuberia(fila.diametro)) });
    resumen.drawText(texto(`${fila.tipo} ${fila.diametro}`), { x: x0 + 32, y: yDer, size: 11, font: fuente, color: tinta });
    const valor = fila.metros === null ? `${fila.tramos} tramos` : formatoMetros(fila.metros);
    if (fila.metros !== null) totalMetros += fila.metros;
    resumen.drawText(texto(valor), { x: x0 + 314 - negrita.widthOfTextAtSize(texto(valor), 11), y: yDer, size: 11, font: negrita, color: tinta });
    yDer -= 24;
    if (yDer < margen) break;
  }
  if (tuberias.length === 0) resumen.drawText('Sin tubería trazada.', { x: x0, y: yDer, size: 11, font: fuente, color: gris });
  if (tuberias.length > 0 && plano.metros_por_unidad && yDer > margen) {
    resumen.drawLine({ start: { x: x0, y: yDer + 14 }, end: { x: x0 + 314, y: yDer + 14 }, thickness: 0.6, color: gris });
    resumen.drawText('Total', { x: x0 + 32, y: yDer - 2, size: 11, font: negrita, color: tinta });
    const total = texto(formatoMetros(totalMetros));
    resumen.drawText(total, { x: x0 + 314 - negrita.widthOfTextAtSize(total, 11), y: yDer - 2, size: 11, font: negrita, color: tinta });
    resumen.drawText('Medido sobre el plano, sin desperdicio ni bajadas.', { x: x0, y: yDer - 22, size: 9, font: fuente, color: gris });
  }

  return pdf.save();
}
