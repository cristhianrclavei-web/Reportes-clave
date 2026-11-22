// Dibujo del diagrama unifilar como una lista de figuras simples (líneas,
// rectángulos, círculos, textos y trazos SVG). La pantalla (EditorUnifilar)
// y el PDF (lib/unifilarPdf.ts) dibujan la MISMA lista, así lo que se ve es
// lo que se imprime. Coordenadas del dibujo con y hacia abajo.

import {
  FILA_ARREGLO, FILAS_DIBUJADAS, datosArreglo, entero, filasDeArreglo, lineasDeEquipo, lineasDeTramo,
  puntoDe, tamanoDe, tramoDeArreglo, type DatosUnifilar, type EquipoUnifilar, type Lado, type TramoUnifilar,
} from './unifilar';

export type Tinta = 'negro' | 'verde' | 'gris' | 'rojo';

export type Figura =
  | { k: 'linea'; puntos: number[]; tinta?: Tinta; grosor?: number; guiones?: boolean }
  | { k: 'rect'; x: number; y: number; w: number; h: number; tinta?: Tinta; relleno?: Tinta | 'blanco'; grosor?: number; guiones?: boolean }
  | { k: 'circulo'; cx: number; cy: number; r: number; tinta?: Tinta; relleno?: Tinta | 'blanco'; grosor?: number }
  | { k: 'texto'; x: number; y: number; texto: string; tam: number; ancla?: 'inicio' | 'medio' | 'fin'; negrita?: boolean; tinta?: Tinta; giro?: number }
  // Trazo SVG con el origen en (x, y).
  | { k: 'trazo'; x: number; y: number; d: string; tinta?: Tinta; grosor?: number; relleno?: Tinta };

export const TAM_TEXTO = 8;
export const INTERLINEA = 10;

// Ancho aproximado de un texto en Helvetica (para acomodar y para tocar).
export function anchoTexto(texto: string, tam: number): number {
  return texto.length * tam * 0.5;
}

// ---------- Símbolos ----------

function modulo(f: Figura[], x: number, y: number, numero: string) {
  f.push({ k: 'rect', x, y, w: 28, h: 36 });
  f.push({ k: 'linea', puntos: [x, y, x + 14, y + 11, x + 28, y] });
  f.push({ k: 'circulo', cx: x + 14, cy: y + 24, r: 7.5 });
  f.push({ k: 'texto', x: x + 14, y: y + 27, texto: numero, tam: numero.length > 2 ? 6 : 8, ancla: 'medio' });
}

function dibujarArreglo(f: Figura[], e: EquipoUnifilar) {
  const { serie, paralelo } = datosArreglo(e);
  const filas = filasDeArreglo(e);
  const { w } = tamanoDe(e);
  // Hasta 4 módulos se dibujan todos; más, los 3 primeros, «∘∘∘» y el último.
  const posiciones = serie <= 4 ? Array.from({ length: serie }, (_, i) => i) : [0, 1, 2, -1, serie - 1];
  for (let fila = 0; fila < filas; fila++) {
    const y = e.y + fila * FILA_ARREGLO;
    const medio = y + 18;
    let x = e.x;
    let finAnterior: number | null = null;
    for (const p of posiciones) {
      if (p === -1) {
        for (let k = 0; k < 3; k++) f.push({ k: 'circulo', cx: x + 6 + k * 9, cy: medio, r: k === 2 ? 2 : 3 });
        x += 36;
        finAnterior = null;
        continue;
      }
      if (finAnterior !== null) f.push({ k: 'linea', puntos: [finAnterior, medio, x, medio] });
      modulo(f, x, y, String(p + 1));
      finAnterior = x + 28;
      x += 38;
    }
    f.push({ k: 'linea', puntos: [finAnterior ?? x, medio, e.x + w - 6, medio] });
  }
  const yPuerto = e.y + (filas * FILA_ARREGLO - 18) / 2;
  if (filas > 1) f.push({ k: 'linea', puntos: [e.x + w - 6, e.y + 18, e.x + w - 6, e.y + (filas - 1) * FILA_ARREGLO + 18] });
  f.push({ k: 'linea', puntos: [e.x + w - 6, yPuerto, e.x + w, yPuerto] });
  if (paralelo > FILAS_DIBUJADAS) {
    f.push({ k: 'texto', x: e.x, y: e.y + filas * FILA_ARREGLO - 6, texto: `… ${paralelo} cadenas en paralelo`, tam: 7, tinta: 'gris' });
  }
  // La estructura de los módulos va a tierra.
  const { h } = tamanoDe(e);
  f.push({ k: 'rect', x: e.x - 8, y: e.y - 8, w: w + 4, h: h + 8, tinta: 'verde', guiones: true, grosor: 0.8 });
}

function interruptor(f: Figura[], x1: number, x2: number, y: number) {
  const centro = (x1 + x2) / 2;
  f.push({ k: 'linea', puntos: [x1, y, centro - 10, y] });
  f.push({ k: 'circulo', cx: centro - 8, cy: y, r: 2, relleno: 'blanco' });
  f.push({ k: 'trazo', x: centro - 8, y, d: 'M0 -2 Q8 -14 16 -2' });
  f.push({ k: 'circulo', cx: centro + 8, cy: y, r: 2, relleno: 'blanco' });
  f.push({ k: 'linea', puntos: [centro + 10, y, x2, y] });
}

const SENO = 'M0 0 C4 -8 8 -8 12 0 C16 8 20 8 24 0';

function dibujarEquipo(f: Figura[], e: EquipoUnifilar) {
  const { w, h } = tamanoDe(e);
  const { x, y } = e;
  switch (e.tipo) {
    case 'arreglo':
      dibujarArreglo(f, e);
      return;
    case 'fusibles': {
      f.push({ k: 'rect', x, y, w, h });
      const vias = entero(e.valores.vias, 1, 24);
      for (let i = 0; i < vias; i++) {
        const yy = y + 25 + i * 40;
        f.push({ k: 'linea', puntos: [x, yy, x + 22, yy] });
        f.push({ k: 'rect', x: x + 22, y: yy - 5, w: 26, h: 10, relleno: 'blanco' });
        f.push({ k: 'linea', puntos: [x + 22, yy, x + 48, yy], grosor: 0.6 });
        f.push({ k: 'linea', puntos: [x + 48, yy, x + w, yy] });
      }
      return;
    }
    case 'desconectador':
      f.push({ k: 'rect', x, y, w, h, guiones: true });
      f.push({ k: 'linea', puntos: [x, y + h / 2, x + 22, y + h / 2] });
      f.push({ k: 'circulo', cx: x + 24, cy: y + h / 2, r: 2, relleno: 'blanco' });
      f.push({ k: 'linea', puntos: [x + 25, y + h / 2 - 1, x + 44, y + h / 2 - 10] });
      f.push({ k: 'circulo', cx: x + 46, cy: y + h / 2, r: 2, relleno: 'blanco' });
      f.push({ k: 'linea', puntos: [x + 48, y + h / 2, x + w, y + h / 2] });
      return;
    case 'inversor_red':
    case 'inversor_hibrido':
    case 'inversor_aislado': {
      const n = entero(e.valores.mppts, 1, 24);
      const alto = h / n;
      for (let i = 0; i < n; i++) {
        const yy = y + h - alto * (i + 1);
        f.push({ k: 'rect', x, y: yy, w: 18, h: alto });
        f.push({ k: 'texto', x: x + 9, y: yy + alto / 2 + (alto >= 30 ? 0 : 2.5), texto: alto >= 30 ? `MPPT${i + 1}` : `${i + 1}`, tam: alto >= 30 ? 6.5 : 6, ancla: 'medio', giro: alto >= 30 ? -90 : 0 });
      }
      const lado = w - 18;
      const cx = x + 18;
      f.push({ k: 'rect', x: cx, y, w: lado, h });
      f.push({ k: 'linea', puntos: [cx, y + h, cx + lado, y] });
      f.push({ k: 'linea', puntos: [cx + 10, y + 14, cx + 32, y + 14] });
      f.push({ k: 'linea', puntos: [cx + 10, y + 20, cx + 32, y + 20], guiones: true });
      f.push({ k: 'trazo', x: cx + lado - 36, y: y + h - 16, d: SENO });
      if (e.tipo !== 'inversor_red') {
        f.push({ k: 'texto', x: cx + lado - 6, y: y + 14, texto: e.tipo === 'inversor_hibrido' ? 'HÍBRIDO' : 'AISLADO', tam: 6, ancla: 'fin', tinta: 'gris' });
      }
      return;
    }
    case 'controlador':
      f.push({ k: 'rect', x, y, w, h });
      f.push({ k: 'linea', puntos: [x, y + h, x + w, y] });
      f.push({ k: 'linea', puntos: [x + 8, y + 12, x + 26, y + 12] });
      f.push({ k: 'linea', puntos: [x + 8, y + 17, x + 26, y + 17], guiones: true });
      f.push({ k: 'linea', puntos: [x + w - 26, y + h - 17, x + w - 8, y + h - 17] });
      f.push({ k: 'linea', puntos: [x + w - 26, y + h - 12, x + w - 8, y + h - 12], guiones: true });
      f.push({ k: 'texto', x: x + w / 2 + 6, y: y + h / 2 - 4, texto: 'MPPT', tam: 6.5, ancla: 'inicio', tinta: 'gris' });
      return;
    case 'baterias': {
      f.push({ k: 'rect', x, y, w, h });
      for (let k = 0; k < 4; k++) {
        const bx = x + 22 + k * 16;
        f.push({ k: 'linea', puntos: [bx, y + 16, bx, y + 40], grosor: 1.2 });
        f.push({ k: 'linea', puntos: [bx + 6, y + 22, bx + 6, y + 34], grosor: 2.4 });
        if (k < 3) f.push({ k: 'linea', puntos: [bx + 6, y + 28, bx + 16, y + 28] });
      }
      f.push({ k: 'texto', x: x + 10, y: y + 31, texto: '+', tam: 9, ancla: 'medio' });
      f.push({ k: 'texto', x: x + w - 8, y: y + 31, texto: '−', tam: 9, ancla: 'medio' });
      f.push({ k: 'linea', puntos: [x + w / 2, y, x + w / 2, y + 8] });
      return;
    }
    case 'tablero':
    case 'itm':
      f.push({ k: 'rect', x, y, w, h, guiones: true });
      interruptor(f, x, x + w, y + h / 2);
      return;
    case 'medidor':
      f.push({ k: 'rect', x, y, w, h, grosor: 1.4 });
      f.push({ k: 'linea', puntos: [x + 22, y + 10, x + w - 22, y + 10] });
      f.push({ k: 'trazo', x: x + 22, y: y + 10, d: 'M6 -3 L0 0 L6 3', relleno: 'negro' });
      f.push({ k: 'trazo', x: x + w - 22, y: y + 10, d: 'M-6 -3 L0 0 L-6 3', relleno: 'negro' });
      f.push({ k: 'texto', x: x + w / 2, y: y + 44, texto: 'kWh', tam: 22, ancla: 'medio' });
      return;
    case 'transformador':
      f.push({ k: 'linea', puntos: [x, y + h / 2, x + 10, y + h / 2] });
      f.push({ k: 'circulo', cx: x + 24, cy: y + h / 2, r: 14 });
      f.push({ k: 'circulo', cx: x + 40, cy: y + h / 2, r: 14 });
      f.push({ k: 'linea', puntos: [x + 54, y + h / 2, x + w, y + h / 2] });
      return;
    case 'cfe':
      f.push({ k: 'circulo', cx: x + w / 2, cy: y + h / 2, r: w / 2 - 2 });
      f.push({ k: 'trazo', x: x + w / 2 - 12, y: y + h / 2, d: SENO });
      return;
    case 'generador':
      f.push({ k: 'circulo', cx: x + w / 2, cy: y + h / 2, r: w / 2 - 2 });
      f.push({ k: 'texto', x: x + w / 2, y: y + h / 2 + 7, texto: 'G', tam: 20, ancla: 'medio' });
      return;
    case 'dps':
      f.push({ k: 'linea', puntos: [x, y + 14, x + w / 2, y + 14, x + w / 2, y + 18] });
      f.push({ k: 'rect', x: x + 7, y: y + 18, w: w - 14, h: 18 });
      f.push({ k: 'trazo', x: x + w / 2, y: y + 20, d: 'M0 0 L0 10 M-4 6 L0 12 L4 6' });
      f.push({ k: 'linea', puntos: [x + w / 2, y + 36, x + w / 2, y + h] });
      return;
    case 'cargas':
      f.push({ k: 'rect', x, y, w, h });
      f.push({ k: 'texto', x: x + w / 2, y: y + h / 2 + 4, texto: 'CARGAS', tam: 9, ancla: 'medio', negrita: true });
      return;
    case 'tierra':
      f.push({ k: 'linea', puntos: [x + w / 2, y, x + w / 2, y + 12], tinta: 'verde' });
      f.push({ k: 'linea', puntos: [x + 2, y + 12, x + w - 2, y + 12], tinta: 'verde' });
      f.push({ k: 'linea', puntos: [x + 8, y + 18, x + w - 8, y + 18], tinta: 'verde' });
      f.push({ k: 'linea', puntos: [x + 12, y + 24, x + w - 12, y + 24], tinta: 'verde' });
      return;
  }
}

// ---------- Textos de los equipos ----------

// Dónde va el texto de cada equipo si no se ha movido: arriba a la izquierda
// en los arreglos (como en los planos), arriba en tableros e ITM y abajo en
// lo demás.
export function cajaEtiquetaEquipo(datos: DatosUnifilar, e: EquipoUnifilar): { x: number; y: number; w: number; h: number; ancla: 'inicio' | 'medio'; lineas: string[] } {
  const lineas = lineasDeEquipo(datos, e);
  const { w, h } = tamanoDe(e);
  const alto = lineas.length * INTERLINEA;
  const ancho = Math.max(0, ...lineas.map((l) => anchoTexto(l, TAM_TEXTO)));
  let x: number;
  let y: number;
  let ancla: 'inicio' | 'medio' = 'medio';
  if (e.tipo === 'arreglo') {
    x = e.x - 8;
    y = e.y - 14 - alto;
    ancla = 'inicio';
  } else if (e.tipo === 'tablero' || e.tipo === 'itm' || e.tipo === 'desconectador' || e.tipo === 'inversor_hibrido' || e.tipo === 'inversor_aislado') {
    // Arriba: abajo de los inversores híbridos y aislados salen las baterías y el respaldo.
    x = e.x + w / 2;
    y = e.y - 6 - alto;
  } else {
    x = e.x + w / 2;
    y = e.y + h + 6;
  }
  x += e.etiqueta.dx;
  y += e.etiqueta.dy;
  const izquierda = ancla === 'inicio' ? x : x - ancho / 2;
  return { x: izquierda, y, w: ancho, h: alto, ancla, lineas };
}

function textos(f: Figura[], caja: { x: number; y: number; w: number; lineas: string[] }, ancla: 'inicio' | 'medio', tinta?: Tinta) {
  caja.lineas.forEach((l, i) => {
    const x = ancla === 'inicio' ? caja.x : caja.x + caja.w / 2;
    f.push({ k: 'texto', x, y: caja.y + (i + 1) * INTERLINEA - 2, texto: l, tam: TAM_TEXTO, ancla, tinta });
  });
}

// ---------- Tramos ----------

const SALIDA = 12;

function direccion(lado: Lado): { dx: number; dy: number } {
  if (lado === 'izq') return { dx: -1, dy: 0 };
  if (lado === 'der') return { dx: 1, dy: 0 };
  if (lado === 'arr') return { dx: 0, dy: -1 };
  return { dx: 0, dy: 1 };
}

const esHorizontal = (lado: Lado) => lado === 'izq' || lado === 'der';

// Camino del cable en ángulos rectos entre los dos puertos. `codo` mueve el
// tramo de en medio (una x si el cable cruza de lado a lado, una y si va de
// arriba a abajo).
export function rutaDeTramo(datos: DatosUnifilar, t: TramoUnifilar): number[] | null {
  const a = puntoDe(datos, t.a);
  const b = puntoDe(datos, t.b);
  if (!a || !b) return null;
  const da = direccion(a.lado);
  const db = direccion(b.lado);
  const pa = { x: a.x + da.dx * SALIDA, y: a.y + da.dy * SALIDA };
  const pb = { x: b.x + db.dx * SALIDA, y: b.y + db.dy * SALIDA };
  let medio: number[];
  if (esHorizontal(a.lado) && esHorizontal(b.lado)) {
    let x: number;
    if (t.codo !== null) x = t.codo;
    else if (a.lado === b.lado) x = a.lado === 'der' ? Math.max(pa.x, pb.x) + 10 : Math.min(pa.x, pb.x) - 10;
    else x = (pa.x + pb.x) / 2;
    medio = [x, a.y, x, b.y];
  } else if (!esHorizontal(a.lado) && !esHorizontal(b.lado)) {
    let y: number;
    if (t.codo !== null) y = t.codo;
    else if (a.lado === b.lado) y = a.lado === 'aba' ? Math.max(pa.y, pb.y) + 10 : Math.min(pa.y, pb.y) - 10;
    else y = (pa.y + pb.y) / 2;
    medio = [a.x, y, b.x, y];
  } else if (esHorizontal(a.lado)) {
    medio = [b.x, a.y];
  } else {
    medio = [a.x, b.y];
  }
  const puntos = [a.x, a.y, ...medio, b.x, b.y];
  return quitarRepetidos(puntos);
}

function quitarRepetidos(p: number[]): number[] {
  const r: number[] = [p[0], p[1]];
  for (let i = 2; i < p.length; i += 2) {
    if (Math.abs(p[i] - r[r.length - 2]) < 0.01 && Math.abs(p[i + 1] - r[r.length - 1]) < 0.01) continue;
    r.push(p[i], p[i + 1]);
  }
  return r;
}

// El tramo más largo del camino: ahí va el texto y ahí se agarra el codo.
export function tramoMasLargo(puntos: number[]): { x1: number; y1: number; x2: number; y2: number; indice: number } {
  let mejor = { x1: puntos[0], y1: puntos[1], x2: puntos[2] ?? puntos[0], y2: puntos[3] ?? puntos[1], indice: 0 };
  let largo = -1;
  for (let i = 0; i + 3 < puntos.length; i += 2) {
    const l = Math.abs(puntos[i + 2] - puntos[i]) + Math.abs(puntos[i + 3] - puntos[i + 1]);
    if (l > largo) {
      largo = l;
      mejor = { x1: puntos[i], y1: puntos[i + 1], x2: puntos[i + 2], y2: puntos[i + 3], indice: i / 2 };
    }
  }
  return mejor;
}

// Segmento que mueve el codo (el de en medio), si el camino lo tiene.
export function segmentoDelCodo(puntos: number[]): { x1: number; y1: number; x2: number; y2: number; vertical: boolean } | null {
  if (puntos.length !== 8) return null;
  const s = { x1: puntos[2], y1: puntos[3], x2: puntos[4], y2: puntos[5] };
  return { ...s, vertical: Math.abs(s.x1 - s.x2) < 0.01 };
}

export function cajaEtiquetaTramo(datos: DatosUnifilar, t: TramoUnifilar): { x: number; y: number; w: number; h: number; lineas: string[] } | null {
  if (!t.mostrarEtiqueta) return null;
  // El del arreglo ya va dentro del texto del arreglo.
  const arreglo = datos.equipos.find((e) => e.tipo === 'arreglo' && ((t.a.equipo === e.id && t.a.puerto === 'salida') || (t.b.equipo === e.id && t.b.puerto === 'salida')));
  if (arreglo && tramoDeArreglo(datos, arreglo)?.id === t.id) return null;
  const ruta = rutaDeTramo(datos, t);
  if (!ruta) return null;
  const lineas = lineasDeTramo(datos, t);
  if (lineas.length === 0) return null;
  const s = tramoMasLargo(ruta);
  const ancho = Math.max(...lineas.map((l) => anchoTexto(l, TAM_TEXTO)));
  const alto = lineas.length * INTERLINEA;
  const cx = (s.x1 + s.x2) / 2;
  const cy = (s.y1 + s.y2) / 2;
  const vertical = Math.abs(s.x1 - s.x2) < 0.01;
  // Arriba de una línea horizontal; a la derecha de una vertical.
  // Si el texto es más ancho que el cable, se alinea al inicio del cable
  // para no taparle el texto al equipo de llegada.
  const largo = Math.abs(s.x2 - s.x1);
  const horizontalX = ancho > largo ? Math.min(s.x1, s.x2) + 6 : cx - ancho / 2;
  const x = (vertical ? cx + 8 : horizontalX) + t.etiqueta.dx;
  const y = (vertical ? cy - alto / 2 : cy - alto - 6) + t.etiqueta.dy;
  return { x, y, w: ancho, h: alto, lineas };
}

// ---------- Todo el diagrama ----------

export function dibujarDiagrama(datos: DatosUnifilar): Figura[] {
  const f: Figura[] = [];
  for (const t of datos.tramos) {
    const ruta = rutaDeTramo(datos, t);
    if (!ruta) continue;
    f.push({ k: 'linea', puntos: ruta, tinta: t.tierra ? 'verde' : 'negro', grosor: t.tierra ? 0.9 : 1.1 });
    if (t.tierra) {
      f.push({ k: 'circulo', cx: ruta[0], cy: ruta[1], r: 2.6, relleno: 'verde', tinta: 'verde' });
      f.push({ k: 'circulo', cx: ruta[ruta.length - 2], cy: ruta[ruta.length - 1], r: 2.6, relleno: 'verde', tinta: 'verde' });
    }
  }
  for (const e of datos.equipos) {
    dibujarEquipo(f, e);
    const caja = cajaEtiquetaEquipo(datos, e);
    textos(f, caja, caja.ancla);
  }
  for (const t of datos.tramos) {
    const caja = cajaEtiquetaTramo(datos, t);
    if (!caja) continue;
    textos(f, caja, 'inicio');
  }
  return f;
}

// Símbolo suelto de un tipo (para la simbología del PDF), en su tamaño normal.
export function figurasDeSimbolo(e: EquipoUnifilar): Figura[] {
  const f: Figura[] = [];
  dibujarEquipo(f, e);
  return f;
}

// Rectángulo que ocupa todo el dibujo, con textos.
export function limitesDe(datos: DatosUnifilar): { x: number; y: number; w: number; h: number } {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const meter = (x: number, y: number, w = 0, h = 0) => {
    x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x + w); y2 = Math.max(y2, y + h);
  };
  for (const e of datos.equipos) {
    const { w, h } = tamanoDe(e);
    meter(e.x - 10, e.y - 10, w + 20, h + 20);
    const c = cajaEtiquetaEquipo(datos, e);
    if (c.lineas.length) meter(c.x, c.y, c.w, c.h);
  }
  for (const t of datos.tramos) {
    const r = rutaDeTramo(datos, t);
    if (r) for (let i = 0; i < r.length; i += 2) meter(r[i], r[i + 1]);
    const c = cajaEtiquetaTramo(datos, t);
    if (c) meter(c.x, c.y, c.w, c.h);
  }
  if (!Number.isFinite(x1)) return { x: 0, y: 0, w: 600, h: 400 };
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

