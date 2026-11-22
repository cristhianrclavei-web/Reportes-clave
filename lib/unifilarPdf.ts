// PDF del diagrama unifilar con formato de plano para el trámite de CFE:
// marco con cuadrícula (1–8, A–F), título, el diagrama en vectores, notas,
// simbología y abreviaturas abajo, y a la derecha macro y microlocalización
// satelital, nombre del proyecto, datos del plano y clave.
// Se arma en el navegador (como el plano con equipos): las imágenes
// satelitales se piden directo a los mosaicos de Esri, que permiten CORS.

import { LineCapStyle, PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, degrees, rgb } from 'pdf-lib';
import {
  NOTAS_POR_OMISION, definicion, kwpTotal, nuevoEquipo, num, redondear, tamanoDe, tituloPorOmision,
  type DatosUnifilar, type TipoEquipo, type TipoSistema,
} from './unifilar';
import { dibujarDiagrama, figurasDeSimbolo, limitesDe, type Figura, type Tinta } from './unifilarDibujo';

const NEGRO = rgb(0.07, 0.07, 0.09);
const TINTAS: Record<Tinta | 'blanco', ReturnType<typeof rgb>> = {
  negro: NEGRO, verde: rgb(0.09, 0.64, 0.29), gris: rgb(0.42, 0.45, 0.5), rojo: rgb(0.86, 0.15, 0.15), blanco: rgb(1, 1, 1),
};

// Helvetica solo trae letras latinas: lo demás se cambia para que no truene.
function limpio(valor: string): string {
  return (valor || '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—−]/g, '-').replace(/×/g, 'x').replace(/→/g, '->').replace(/…/g, '...').replace(/[^\x20-\xFF]/g, '?');
}

type Fuentes = { normal: PDFFont; negrita: PDFFont };

// Lleva coordenadas del dibujo (y hacia abajo) a la hoja (y hacia arriba).
type Transformacion = { escala: number; x: (v: number) => number; y: (v: number) => number };

function dibujarFiguras(hoja: PDFPage, fuentes: Fuentes, figuras: Figura[], t: Transformacion) {
  const grosor = (g?: number) => Math.max(0.35, (g ?? 1) * t.escala);
  for (const f of figuras) {
    if (f.k === 'linea') {
      for (let i = 0; i + 3 < f.puntos.length; i += 2) {
        hoja.drawLine({
          start: { x: t.x(f.puntos[i]), y: t.y(f.puntos[i + 1]) },
          end: { x: t.x(f.puntos[i + 2]), y: t.y(f.puntos[i + 3]) },
          thickness: grosor(f.grosor), color: TINTAS[f.tinta || 'negro'],
          dashArray: f.guiones ? [5 * t.escala, 3 * t.escala] : undefined, lineCap: LineCapStyle.Round,
        });
      }
    } else if (f.k === 'rect') {
      hoja.drawRectangle({
        x: t.x(f.x), y: t.y(f.y + f.h), width: f.w * t.escala, height: f.h * t.escala,
        borderColor: TINTAS[f.tinta || 'negro'], borderWidth: grosor(f.grosor), color: f.relleno ? TINTAS[f.relleno] : undefined,
        borderDashArray: f.guiones ? [5 * t.escala, 3 * t.escala] : undefined,
      });
    } else if (f.k === 'circulo') {
      hoja.drawCircle({
        x: t.x(f.cx), y: t.y(f.cy), size: f.r * t.escala,
        borderColor: TINTAS[f.tinta || 'negro'], borderWidth: grosor(f.grosor), color: f.relleno ? TINTAS[f.relleno] : undefined,
      });
    } else if (f.k === 'trazo') {
      hoja.drawSvgPath(f.d, {
        x: t.x(f.x), y: t.y(f.y), scale: t.escala,
        borderColor: TINTAS[f.tinta || 'negro'], borderWidth: grosor(f.grosor) / t.escala, color: f.relleno ? TINTAS[f.relleno] : undefined,
      });
    } else if (f.k === 'texto') {
      const fuente = f.negrita ? fuentes.negrita : fuentes.normal;
      const texto = limpio(f.texto);
      const tam = f.tam * t.escala;
      const ancho = fuente.widthOfTextAtSize(texto, tam);
      if (f.giro) {
        // Texto de abajo hacia arriba, centrado en (x, y).
        hoja.drawText(texto, { x: t.x(f.x) + tam * 0.35, y: t.y(f.y) - ancho / 2, size: tam, font: fuente, color: TINTAS[f.tinta || 'negro'], rotate: degrees(90) });
        continue;
      }
      const corrimiento = f.ancla === 'medio' ? ancho / 2 : f.ancla === 'fin' ? ancho : 0;
      hoja.drawText(texto, { x: t.x(f.x) - corrimiento, y: t.y(f.y), size: tam, font: fuente, color: TINTAS[f.tinta || 'negro'] });
    }
  }
}

function partir(texto: string, fuente: PDFFont, tam: number, ancho: number): string[] {
  const lineas: string[] = [];
  for (const parrafo of limpio(texto).split('\n')) {
    let linea = '';
    for (const p of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = linea ? `${linea} ${p}` : p;
      if (fuente.widthOfTextAtSize(prueba, tam) > ancho && linea) { lineas.push(linea); linea = p; } else linea = prueba;
    }
    if (linea) lineas.push(linea);
  }
  return lineas;
}

function centrado(hoja: PDFPage, texto: string, fuente: PDFFont, tam: number, cx: number, y: number, color = NEGRO) {
  const s = limpio(texto);
  hoja.drawText(s, { x: cx - fuente.widthOfTextAtSize(s, tam) / 2, y, size: tam, font: fuente, color });
}

// ---------- Mapas ----------

const MOSAICO = 256;

function mosaicoDe(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom;
  const x = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { x, y };
}

// Imagen satelital (3×3 mosaicos de Esri) centrada en el punto, con una
// marca roja. Sin señal o sin coordenadas, null.
async function imagenSatelital(lat: number, lng: number, zoom: number): Promise<Uint8Array | null> {
  if (typeof document === 'undefined') return null;
  const centro = mosaicoDe(lat, lng, zoom);
  const lienzo = document.createElement('canvas');
  lienzo.width = MOSAICO * 2;
  lienzo.height = MOSAICO * 1.3;
  const ctx = lienzo.getContext('2d');
  if (!ctx) return null;
  const origenX = centro.x * MOSAICO - lienzo.width / 2;
  const origenY = centro.y * MOSAICO - lienzo.height / 2;
  const cargar = (tx: number, ty: number) => new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { ctx.drawImage(img, tx * MOSAICO - origenX, ty * MOSAICO - origenY); resolve(); };
    img.onerror = () => reject(new Error('mosaico'));
    img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`;
  });
  const pedidos: Promise<void>[] = [];
  for (let tx = Math.floor(origenX / MOSAICO); tx <= Math.floor((origenX + lienzo.width) / MOSAICO); tx++) {
    for (let ty = Math.floor(origenY / MOSAICO); ty <= Math.floor((origenY + lienzo.height) / MOSAICO); ty++) pedidos.push(cargar(tx, ty));
  }
  try {
    await Promise.race([Promise.all(pedidos), new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('tiempo')), 12000))]);
  } catch {
    return null;
  }
  // Marca de la ubicación.
  const mx = lienzo.width / 2;
  const my = lienzo.height / 2;
  ctx.fillStyle = '#e11d48';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(mx, my);
  ctx.bezierCurveTo(mx - 14, my - 18, mx - 12, my - 34, mx, my - 34);
  ctx.bezierCurveTo(mx + 12, my - 34, mx + 14, my - 18, mx, my);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(mx, my - 23, 4.5, 0, Math.PI * 2);
  ctx.fill();
  const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, 'image/jpeg', 0.85));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

// ---------- Hoja ----------

export async function generarUnifilarPdf(datos: DatosUnifilar, tipo: TipoSistema): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const p = datos.proyecto;
  const tabloide = p.tamano === 'tabloide';
  const ANCHO = tabloide ? 1224 : 792;
  const ALTO = tabloide ? 792 : 612;
  const k = tabloide ? 1.3 : 1; // los textos del marco crecen un poco en tabloide
  const hoja = pdf.addPage([ANCHO, ALTO]);
  const fuentes: Fuentes = { normal: await pdf.embedFont(StandardFonts.Helvetica), negrita: await pdf.embedFont(StandardFonts.HelveticaBold) };
  pdf.setTitle(limpio(p.nombre || 'Diagrama unifilar'));

  // Marco exterior y cuadrícula de referencias.
  const M = 14;
  const B = 12 * k; // ancho de la franja de números y letras
  hoja.drawRectangle({ x: M, y: M, width: ANCHO - 2 * M, height: ALTO - 2 * M, borderColor: NEGRO, borderWidth: 1.2 });
  const ix = M + B, iy = M + B, iw = ANCHO - 2 * (M + B), ih = ALTO - 2 * (M + B);
  hoja.drawRectangle({ x: ix, y: iy, width: iw, height: ih, borderColor: NEGRO, borderWidth: 1 });
  for (let c = 0; c < 8; c++) {
    const cx = ix + (iw / 8) * (c + 0.5);
    centrado(hoja, String(c + 1), fuentes.normal, 7 * k, cx, ALTO - M - B + 3.5 * k);
    centrado(hoja, String(c + 1), fuentes.normal, 7 * k, cx, M + 3.5 * k);
    if (c > 0) {
      const x = ix + (iw / 8) * c;
      hoja.drawLine({ start: { x, y: ALTO - M }, end: { x, y: ALTO - M - B }, thickness: 0.6, color: NEGRO });
      hoja.drawLine({ start: { x, y: M }, end: { x, y: M + B }, thickness: 0.6, color: NEGRO });
    }
  }
  'ABCDEF'.split('').forEach((letra, f) => {
    const cy = iy + ih - (ih / 6) * (f + 0.5) - 2.5 * k;
    centrado(hoja, letra, fuentes.normal, 7 * k, M + B / 2, cy);
    centrado(hoja, letra, fuentes.normal, 7 * k, ANCHO - M - B / 2, cy);
    if (f > 0) {
      const y = iy + ih - (ih / 6) * f;
      hoja.drawLine({ start: { x: M, y }, end: { x: M + B, y }, thickness: 0.6, color: NEGRO });
      hoja.drawLine({ start: { x: ANCHO - M - B, y }, end: { x: ANCHO - M, y }, thickness: 0.6, color: NEGRO });
    }
  });

  // ---------- Columna derecha ----------
  const CW = 150 * k;
  const cx0 = ix + iw - CW - 6;
  const caja = (y: number, h: number) => hoja.drawRectangle({ x: cx0, y, width: CW, height: h, borderColor: NEGRO, borderWidth: 0.8 });
  const tituloCaja = (texto: string, y: number) => centrado(hoja, texto, fuentes.negrita, 7.5 * k, cx0 + CW / 2, y);
  const lat = num(p.lat);
  const lng = num(p.lng);
  const conUbicacion = p.lat.trim() !== '' && p.lng.trim() !== '' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const [macro, micro] = conUbicacion ? await Promise.all([imagenSatelital(lat, lng, 13), imagenSatelital(lat, lng, 17)]) : [null, null];
  const incrustar = async (bytes: Uint8Array | null): Promise<PDFImage | null> => (bytes ? pdf.embedJpg(bytes).catch(() => null) : null);
  const [imgMacro, imgMicro] = await Promise.all([incrustar(macro), incrustar(micro)]);

  let yTop = iy + ih - 6;
  const MAPA_H = 78 * k;
  const bloqueMapa = (titulo: string, img: PDFImage | null, extra: string[]) => {
    const alto = 14 * k + MAPA_H + 6 + extra.length * 8.5 * k + (extra.length ? 4 : 0);
    caja(yTop - alto, alto);
    tituloCaja(titulo, yTop - 10 * k);
    const mx = cx0 + 6, my = yTop - 14 * k - MAPA_H, mw = CW - 12;
    if (img) {
      hoja.drawImage(img, { x: mx, y: my, width: mw, height: MAPA_H });
      hoja.drawText('Imagen: Esri', { x: mx + 2, y: my + 2, size: 4.5, font: fuentes.normal, color: TINTAS.blanco });
    } else {
      hoja.drawRectangle({ x: mx, y: my, width: mw, height: MAPA_H, borderColor: TINTAS.gris, borderWidth: 0.5, color: rgb(0.95, 0.95, 0.95) });
      centrado(hoja, conUbicacion ? 'Sin imagen (sin señal)' : 'Sin coordenadas', fuentes.normal, 6.5 * k, mx + mw / 2, my + MAPA_H / 2, TINTAS.gris);
    }
    extra.forEach((l, i) => hoja.drawText(l, { x: mx, y: my - 9 * k - i * 8.5 * k, size: 6.5 * k, font: fuentes.normal, color: NEGRO }));
    yTop -= alto + 5;
  };
  bloqueMapa('MACROLOCALIZACIÓN', imgMacro, []);
  bloqueMapa('MICROLOCALIZACIÓN', imgMicro, partir(p.direccion, fuentes.normal, 6.5 * k, CW - 12).slice(0, 4));

  // Nombre del proyecto
  {
    const nombreProyecto = p.nombre.trim() || `SFV DE ${redondear(kwpTotal(datos))} kWp`;
    const desc = partir(p.descripcion, fuentes.normal, 6.5 * k, CW - 14).slice(0, 5);
    const alto = (24 + 12 + desc.length * 8.5 + (conUbicacion ? 32 : 0)) * k + 8;
    caja(yTop - alto, alto);
    tituloCaja('NOMBRE DEL PROYECTO', yTop - 10 * k);
    centrado(hoja, nombreProyecto, fuentes.normal, 8 * k, cx0 + CW / 2, yTop - 22 * k);
    let y = yTop - 34 * k;
    hoja.drawText('DESCRIPCIÓN:', { x: cx0 + 6, y, size: 6.5 * k, font: fuentes.negrita, color: NEGRO });
    y -= 9 * k;
    for (const l of desc) { centrado(hoja, l, fuentes.normal, 6.5 * k, cx0 + CW / 2, y); y -= 8.5 * k; }
    if (conUbicacion) {
      y -= 3 * k;
      centrado(hoja, 'COORDENADAS', fuentes.negrita, 6.5 * k, cx0 + CW / 2, y);
      hoja.drawText(limpio(`LATITUD: ${p.lat.trim()}`), { x: cx0 + 8, y: y - 10 * k, size: 6.5 * k, font: fuentes.normal, color: NEGRO });
      hoja.drawText(limpio(`LONGITUD: ${p.lng.trim()}`), { x: cx0 + 8, y: y - 19 * k, size: 6.5 * k, font: fuentes.normal, color: NEGRO });
    }
    yTop -= alto + 5;
  }

  // Clave de plano abajo del todo; el bloque de datos en lo que sobre.
  const altoClave = 34 * k;
  const yClave = iy + 6;
  caja(yClave, altoClave);
  hoja.drawText('CLAVE DE PLANO', { x: cx0 + 6, y: yClave + altoClave - 11 * k, size: 6.5 * k, font: fuentes.negrita, color: NEGRO });
  hoja.drawText(limpio(p.clave || '-'), { x: cx0 + 6, y: yClave + 7 * k, size: 7 * k, font: fuentes.normal, color: NEGRO });
  const numero = `#${limpio(p.hoja || '1')}`;
  hoja.drawText(numero, { x: cx0 + CW - 8 - fuentes.negrita.widthOfTextAtSize(numero, 18 * k), y: yClave + 8 * k, size: 18 * k, font: fuentes.negrita, color: NEGRO });

  {
    const alto = yTop - (yClave + altoClave + 5);
    if (alto > 30) {
      caja(yClave + altoClave + 5, alto);
      tituloCaja('DIAGRAMA UNIFILAR', yTop - 12 * k);
      let y = yTop - 28 * k;
      const fila = (etiqueta: string, valor: string) => {
        if (y < yClave + altoClave + 10) return;
        hoja.drawText(limpio(`${etiqueta}:`), { x: cx0 + 6, y, size: 6.5 * k, font: fuentes.negrita, color: NEGRO });
        const lineas = partir(valor || '-', fuentes.normal, 6.5 * k, CW - 14).slice(0, 2);
        lineas.forEach((l, i) => hoja.drawText(l, { x: cx0 + 6, y: y - 8.5 * k * (i + 1), size: 6.5 * k, font: fuentes.normal, color: NEGRO }));
        y -= 8.5 * k * (lineas.length + 1) + 4 * k;
      };
      fila('DISEÑÓ', p.diseno);
      fila('ESCALA', p.escala || 'S/E');
      if (p.fecha.trim()) fila('FECHA', p.fecha);
    }
  }

  // ---------- Franja de abajo: notas, simbología, abreviaturas ----------
  const zonaX = ix + 6;
  const zonaW = cx0 - 6 - zonaX;
  const ALTO_ABAJO = 92 * k;
  const yAbajo = iy + 6;
  const notas = (datos.notas.length ? datos.notas : NOTAS_POR_OMISION).filter((n) => n.trim());
  const anchoNotas = zonaW * 0.34;
  const anchoSimb = zonaW * 0.32;
  const anchoAbrev = zonaW - anchoNotas - anchoSimb - 8;

  // Notas
  hoja.drawRectangle({ x: zonaX, y: yAbajo, width: anchoNotas, height: ALTO_ABAJO, borderColor: NEGRO, borderWidth: 0.8 });
  centrado(hoja, 'NOTAS:', fuentes.negrita, 7 * k, zonaX + anchoNotas / 2, yAbajo + ALTO_ABAJO - 10 * k);
  {
    let y = yAbajo + ALTO_ABAJO - 21 * k;
    const tam = 5.6 * k;
    notas.forEach((n, i) => {
      const lineas = partir(`${i + 1}.- ${n}`, fuentes.normal, tam, anchoNotas - 12);
      for (const l of lineas) {
        if (y < yAbajo + 3) return;
        hoja.drawText(l, { x: zonaX + 6, y, size: tam, font: fuentes.normal, color: NEGRO });
        y -= tam + 1.6;
      }
      y -= 2;
    });
  }

  // Simbología: un ejemplo de cada equipo que se usa.
  const xs = zonaX + anchoNotas + 4;
  hoja.drawRectangle({ x: xs, y: yAbajo, width: anchoSimb, height: ALTO_ABAJO, borderColor: NEGRO, borderWidth: 0.8 });
  hoja.drawRectangle({ x: xs, y: yAbajo + ALTO_ABAJO - 13 * k, width: anchoSimb, height: 13 * k, borderColor: NEGRO, borderWidth: 0.8 });
  centrado(hoja, 'SIMBOLOGÍA', fuentes.negrita, 7 * k, xs + anchoSimb / 2, yAbajo + ALTO_ABAJO - 9.5 * k);
  {
    const usados = [...new Set(datos.equipos.map((e) => e.tipo))];
    if (datos.tramos.some((t) => t.tierra) && !usados.includes('tierra')) usados.push('tierra');
    const columnas = 2;
    const filas = Math.ceil(usados.length / columnas);
    const altoFila = Math.min(16 * k, (ALTO_ABAJO - 16 * k) / Math.max(1, filas));
    usados.forEach((tipoEquipo, i) => {
      const col = Math.floor(i / filas);
      const fila = i % filas;
      const x = xs + 6 + col * (anchoSimb / columnas);
      const yCentro = yAbajo + ALTO_ABAJO - 16 * k - altoFila * (fila + 0.5);
      dibujarSimboloChico(hoja, fuentes, tipoEquipo, x, yCentro, 22 * k, altoFila - 2);
      const nombreTipo = tipoEquipo === 'arreglo' ? 'Módulo fotovoltaico' : definicion(tipoEquipo).nombre;
      hoja.drawText(limpio(nombreTipo), { x: x + 26 * k, y: yCentro - 2.2 * k, size: 5.8 * k, font: fuentes.normal, color: NEGRO });
    });
  }

  // Abreviaturas
  const xa = xs + anchoSimb + 4;
  hoja.drawRectangle({ x: xa, y: yAbajo, width: anchoAbrev, height: ALTO_ABAJO, borderColor: NEGRO, borderWidth: 0.8 });
  hoja.drawRectangle({ x: xa, y: yAbajo + ALTO_ABAJO - 13 * k, width: anchoAbrev, height: 13 * k, borderColor: NEGRO, borderWidth: 0.8 });
  centrado(hoja, 'ABREVIATURAS', fuentes.negrita, 7 * k, xa + anchoAbrev / 2, yAbajo + ALTO_ABAJO - 9.5 * k);
  {
    const lista = abreviaturas(datos, tipo);
    let y = yAbajo + ALTO_ABAJO - 21 * k;
    const tam = 5.3 * k;
    for (const l of lista) {
      for (const linea of partir(l, fuentes.normal, tam, anchoAbrev - 10)) {
        if (y < yAbajo + 3) break;
        hoja.drawText(linea, { x: xa + 5, y, size: tam, font: fuentes.normal, color: NEGRO });
        y -= tam + 1.6;
      }
      y -= 1.5;
    }
  }

  // ---------- Título y diagrama ----------
  const titulo = (p.titulo.trim() || tituloPorOmision(tipo)).toUpperCase();
  const lineasTitulo = partir(titulo, fuentes.normal, 10.5 * k, zonaW - 30);
  let yTitulo = iy + ih - 18 * k;
  for (const l of lineasTitulo.slice(0, 3)) { centrado(hoja, l, fuentes.normal, 10.5 * k, zonaX + zonaW / 2, yTitulo); yTitulo -= 12.5 * k; }

  const area = { x: zonaX, y: yAbajo + ALTO_ABAJO + 8, w: zonaW, h: yTitulo - 4 - (yAbajo + ALTO_ABAJO + 8) };
  const l = limitesDe(datos);
  const escala = Math.min(area.w / Math.max(1, l.w), area.h / Math.max(1, l.h), 1.6 * k);
  const desplX = area.x + (area.w - l.w * escala) / 2;
  const desplY = area.y + area.h - (area.h - l.h * escala) / 2;
  dibujarFiguras(hoja, fuentes, dibujarDiagrama(datos), {
    escala,
    x: (v) => desplX + (v - l.x) * escala,
    y: (v) => desplY - (v - l.y) * escala,
  });

  return pdf.save();
}

// Símbolo de un tipo de equipo cabido en un cuadrito de `ancho` × `alto`.
function dibujarSimboloChico(hoja: PDFPage, fuentes: Fuentes, tipo: TipoEquipo, x: number, yCentro: number, ancho: number, alto: number) {
  const e = nuevoEquipo(tipo, 0, 0, () => 's');
  if (tipo === 'arreglo') {
    // Un solo módulo.
    const escala = Math.min(ancho / 28, alto / 36);
    const figuras: Figura[] = [
      { k: 'rect', x: 0, y: 0, w: 28, h: 36 },
      { k: 'linea', puntos: [0, 0, 14, 11, 28, 0] },
    ];
    dibujarFiguras(hoja, fuentes, figuras, { escala, x: (v) => x + (ancho - 28 * escala) / 2 + v * escala, y: (v) => yCentro + 18 * escala - v * escala });
    return;
  }
  if (tipo === 'fusibles') e.valores.vias = '1';
  if (tipo === 'inversor_red' || tipo === 'inversor_hibrido' || tipo === 'inversor_aislado') e.valores.mppts = '1';
  const { w, h } = tamanoDe(e);
  const escala = Math.min(ancho / w, alto / h);
  // Sin textos dentro del símbolo: a ese tamaño no se leen.
  const figuras = figurasDeSimbolo(e).filter((f) => f.k !== 'texto' || f.tam > 12);
  dibujarFiguras(hoja, fuentes, figuras, {
    escala,
    x: (v) => x + (ancho - w * escala) / 2 + v * escala,
    y: (v) => yCentro + (h * escala) / 2 - v * escala,
  });
}

function abreviaturas(datos: DatosUnifilar, tipo: TipoSistema): string[] {
  const tipos = new Set(datos.equipos.map((e) => e.tipo));
  const lista: string[] = [];
  if (tipos.has('itm') || tipos.has('tablero')) lista.push('ITM: INTERRUPTOR TERMOMAGNÉTICO');
  lista.push(tipo === 'aislado' ? 'SFV: SISTEMA FOTOVOLTAICO' : 'SFV: SISTEMA FOTOVOLTAICO INTERCONECTADO A LA RED');
  if (datos.tramos.some((t) => t.conductores.some((c) => c.funcion === 'CPT'))) lista.push('CPT: CONDUCTOR PUESTO A TIERRA');
  if (datos.tramos.some((t) => t.conductores.some((c) => c.funcion === 'CPTE'))) lista.push('CPTE: CONDUCTOR DE PUESTA A TIERRA DE EQUIPOS');
  if ([...tipos].some((t) => t.startsWith('inversor') || t === 'controlador')) lista.push('MPPT: SEGUIDOR DEL PUNTO DE MÁXIMA POTENCIA');
  if (tipos.has('arreglo')) lista.push('Voc: TENSIÓN DE CIRCUITO ABIERTO', 'Isc: CORRIENTE DE CORTO CIRCUITO');
  if (tipos.has('dps')) lista.push('DPS: DISPOSITIVO DE PROTECCIÓN CONTRA SOBRETENSIONES');
  lista.push('S/E: SIN ESPECIFICAR');
  return lista;
}

