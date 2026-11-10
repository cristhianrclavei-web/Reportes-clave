// PDF del plano con lo sembrado: la hoja original del PDF (vectorial, nítida
// a cualquier zoom) con los equipos y la tubería encima, y una segunda hoja
// con la simbología y el cuadro de cantidades. Se arma en el navegador: los
// planos pesan varios MB y una función de Vercel no regresa más de 4.5 MB.

import { LineCapStyle, PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from 'pdf-lib';
import { aHoja, figuraDe } from './simbolosPlano';
import type { LineaConexion, MarcaConexion } from './conexionesPlano';
import { puntasDeFlecha, trazoDeConexion } from './rutaTuberia';
import {
  cantidadesDeEquipos, cantidadesDeTuberia, colocacionDePagina, colorEquipo, colorTuberia, formatoMetros,
  proporcionDeEscala, tamanoDe, tamanoSimbolo, type Plano, type Punto,
} from './planos';

function color(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// Helvetica solo trae letras latinas: lo demás se cambia para que no truene.
function texto(valor: string): string {
  return valor.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/[^\x20-\xFF]/g, '?');
}

// Símbolo del plano (lib/simbolosPlano.ts, el mismo de la pantalla) con el
// centro en (cx, cy) en coordenadas del PDF (y hacia arriba), girado `giro`
// grados en el sentido de las manecillas.
function dibujarSimbolo(hoja: PDFPage, fuente: PDFFont, tipo: string, cx: number, cy: number, r: number, giro = 0) {
  const figura = figuraDe(tipo);
  for (const t of figura.trazos) {
    // drawSvgPath ya trabaja con y hacia abajo y escala también el grosor.
    hoja.drawSvgPath(t.d, {
      x: cx,
      y: cy,
      scale: r,
      rotate: degrees(-giro),
      color: t.relleno ? color(t.relleno) : undefined,
      borderColor: t.linea ? color(t.linea) : undefined,
      borderWidth: t.linea ? t.grosor : 0,
      borderDashArray: t.guiones,
    });
  }
  for (const l of figura.letras) {
    const tam = l.tam * r;
    const ancho = fuente.widthOfTextAtSize(l.texto, tam);
    // Esquina de inicio del texto, girada junto con el símbolo.
    const [dx, dyAbajo] = aHoja(l.x - ancho / 2 / r, l.y + l.tam * 0.36, 0, 0, r, giro);
    hoja.drawText(texto(l.texto), { x: cx + dx, y: cy - dyAbajo, size: tam, font: fuente, color: color(l.color), rotate: degrees(-giro) });
  }
}

export type DatosExportar = {
  plano: Plano;
  // El fondo: la hoja del PDF original (vectorial) o, si el plano vino en
  // DXF, su imagen en PNG.
  pdfOriginal: ArrayBuffer | Uint8Array | null;
  fondoPng?: Uint8Array | null;
  cliente: string;
  // Texto junto a cada equipo ligado a un dispositivo (dirección o nombre).
  etiquetas: Map<string, string>;
  // Conexiones de los lazos (línea punteada) y qué color lleva cada lazo.
  conexiones?: { lineas: LineaConexion[]; marcas: MarcaConexion[] };
  lazos?: { id: string; texto: string; color: string }[];
};

// Conexión punteada (por la tubería si la hay) con flechas delgadas, como en
// pantalla. `camino` en puntos de la hoja (y hacia abajo, como el SVG).
function dibujarConexion(hoja: PDFPage, camino: Punto[], H: number, r: number, tinta: ReturnType<typeof rgb>) {
  const trazo = trazoDeConexion(camino, r * 1.2, r * 14);
  if (!trazo) return;
  const grosor = Math.max(0.4, r / 6.5);
  // drawSvgPath pone el origen arriba a la izquierda y y hacia abajo: los
  // puntos de la hoja van tal cual con { x: 0, y: H }.
  const ruta = (puntos: Punto[], cerrar: boolean) => puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ') + (cerrar ? ' Z' : '');
  hoja.drawSvgPath(ruta(trazo.linea, false), { x: 0, y: H, borderColor: tinta, borderWidth: grosor, borderDashArray: [grosor * 2.5, grosor * 2], borderLineCap: LineCapStyle.Round });
  for (const f of trazo.flechas) {
    hoja.drawSvgPath(ruta(puntasDeFlecha(f, r * 1.05), true), { x: 0, y: H, color: tinta });
  }
}

export async function exportarPlanoPdf({ plano, pdfOriginal, fondoPng, cliente, etiquetas, conexiones, lazos = [] }: DatosExportar): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(texto(`Distribución de equipos - ${plano.nombre}`));
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Hoja 1: el plano tal como se ve en pantalla (ya girado), con lo sembrado.
  const W = plano.ancho;
  const H = plano.alto;
  const hoja = pdf.addPage([W, H]);
  if (pdfOriginal) {
    const original = await PDFDocument.load(pdfOriginal, { ignoreEncryption: true });
    const paginaOriginal = original.getPage(plano.pagina - 1);
    const caja = paginaOriginal.getCropBox();
    const giro = paginaOriginal.getRotation().angle;
    const embebida = await pdf.embedPage(paginaOriginal, { left: caja.x, bottom: caja.y, right: caja.x + caja.width, top: caja.y + caja.height });
    const lugar = colocacionDePagina(giro, caja.width, caja.height);
    hoja.drawPage(embebida, { x: lugar.x, y: lugar.y, rotate: degrees(lugar.giro) });
  } else if (fondoPng) {
    const imagen = await pdf.embedPng(fondoPng);
    hoja.drawImage(imagen, { x: 0, y: 0, width: W, height: H });
  }

  const rNormal = tamanoSimbolo(W, H) / 2;
  for (const t of plano.sembrado.tuberias) {
    const camino = t.puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
    hoja.drawSvgPath(camino, { x: 0, y: H, borderColor: color(colorTuberia(t.diametro)), borderWidth: Math.max(0.6, rNormal / 3.5), borderOpacity: 0.9 });
  }
  const colorLazo = new Map(lazos.map((l) => [l.id, l.color]));
  for (const l of conexiones?.lineas || []) {
    const tinta = color(colorLazo.get(l.lazoId) || '#0f766e');
    dibujarConexion(hoja, l.camino, H, rNormal, tinta);
  }
  for (const e of plano.sembrado.equipos) {
    const cx = e.x;
    const cy = H - e.y;
    const r = rNormal * tamanoDe(e);
    dibujarSimbolo(hoja, negrita, e.tipo, cx, cy, r, e.rotacion || 0);
    const rotulo = (e.elementoId && etiquetas.get(e.elementoId)) || e.etiqueta;
    if (rotulo) {
      const tam = r * 0.85;
      hoja.drawText(texto(rotulo), { x: cx + r * 1.25, y: cy + r * 0.75, size: tam, font: negrita, color: color(colorEquipo(e.tipo)) });
    }
  }

  for (const m of conexiones?.marcas || []) {
    const rotulo = texto(m.texto);
    const tam = rNormal * 0.85;
    hoja.drawText(rotulo, {
      x: m.en[0] - negrita.widthOfTextAtSize(rotulo, tam) / 2,
      y: H - m.en[1] - rNormal * 2.3 - tam * 0.35,
      size: tam,
      font: negrita,
      color: color(colorLazo.get(m.lazoId) || '#0f766e'),
    });
  }

  // Hoja 2: simbología y cantidades (carta horizontal).
  const resumen = pdf.addPage([792, 612]);
  const margen = 48;
  let y = 612 - margen;
  const tinta = rgb(0.1, 0.12, 0.16);
  const gris = rgb(0.42, 0.45, 0.5);
  resumen.drawText(texto(`Distribución de equipos · ${plano.nombre}`), { x: margen, y: y - 18, size: 18, font: negrita, color: tinta });
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
  if (equipos.length === 0) resumen.drawText('Sin equipos colocados.', { x: margen, y: yIzq, size: 11, font: fuente, color: gris });
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

  // Abajo: qué lazo es cada línea punteada.
  const conLineas = lazos.filter((l) => (conexiones?.lineas || []).some((c) => c.lazoId === l.id) || (conexiones?.marcas || []).some((c) => c.lazoId === l.id));
  if (conLineas.length > 0) {
    let x = margen;
    const yLeyenda = margen - 30;
    resumen.drawText('CONEXIONES', { x, y: yLeyenda + 16, size: 9.5, font: negrita, color: gris });
    for (const l of conLineas) {
      const rotulo = texto(l.texto);
      resumen.drawLine({ start: { x, y: yLeyenda + 3 }, end: { x: x + 22, y: yLeyenda + 3 }, thickness: 1.6, color: color(l.color), dashArray: [4, 3] });
      resumen.drawText(rotulo, { x: x + 28, y: yLeyenda, size: 9.5, font: fuente, color: tinta });
      x += 40 + fuente.widthOfTextAtSize(rotulo, 9.5);
      if (x > 792 - margen - 60) break;
    }
  }

  return pdf.save();
}
