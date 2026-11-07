// Símbolos de los equipos en el PLANO (el diagrama unifilar usa los suyos,
// components/lazos/DiagramaLazo). Más llamativos, rellenos de color, y con
// forma de lo que son: la estación manual con su palanca, la sirena con su
// corneta, el estrobo con su destello, el aislador con su moño.
//
// Cada símbolo se describe una sola vez en unidades (radio 1, centro en 0,0,
// y hacia abajo) como trazos SVG y letras. La pantalla (SimboloPlano) y el
// PDF (exportarPlanoPdf) dibujan esto mismo, así se ven igual en los dos.

import { tipoDispositivo } from './lazos';
import { colorEquipo } from './planos';

export type Trazo = {
  d: string;
  relleno: string | null;
  linea: string | null;
  grosor: number;
  guiones?: number[];
};

export type Letra = { texto: string; x: number; y: number; tam: number; color: string };

export type FiguraSimbolo = { trazos: Trazo[]; letras: Letra[] };

const BLANCO = '#ffffff';

// ---------- Formas básicas (en unidades) ----------

export function circulo(cx: number, cy: number, r: number): string {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
}

function rectangulo(ancho: number, alto: number, radio: number, cx = 0, cy = 0): string {
  const x = cx - ancho / 2;
  const y = cy - alto / 2;
  const r = Math.min(radio, ancho / 2, alto / 2);
  return [
    `M ${x + r} ${y}`,
    `L ${x + ancho - r} ${y}`,
    `A ${r} ${r} 0 0 1 ${x + ancho} ${y + r}`,
    `L ${x + ancho} ${y + alto - r}`,
    `A ${r} ${r} 0 0 1 ${x + ancho - r} ${y + alto}`,
    `L ${x + r} ${y + alto}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + alto - r}`,
    `L ${x} ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    'Z',
  ].join(' ');
}

// Corneta (bocina) y destello (estrobo), centrados en (cx, cy) a escala `e`.
function corneta(cx: number, cy: number, e: number): string {
  const p = [[-0.55, -0.2], [-0.22, -0.2], [0.38, -0.58], [0.38, 0.58], [-0.22, 0.2], [-0.55, 0.2]];
  return 'M ' + p.map(([x, y]) => `${cx + x * e} ${cy + y * e}`).join(' L ') + ' Z';
}

function destello(cx: number, cy: number, e: number): string {
  const p = [[0.12, -0.62], [-0.36, 0.08], [-0.04, 0.08], [-0.16, 0.62], [0.36, -0.1], [0.04, -0.1]];
  return 'M ' + p.map(([x, y]) => `${cx + x * e} ${cy + y * e}`).join(' L ') + ' Z';
}

const relleno = (d: string, color: string): Trazo => ({ d, relleno: color, linea: null, grosor: 0 });

// ---------- Cada equipo ----------

function detector(color: string, letra: string, haloPunteado: boolean): FiguraSimbolo {
  return {
    trazos: [
      // Halo: como los círculos concéntricos de sus planos de AutoCAD.
      { d: circulo(0, 0, 1), relleno: null, linea: color, grosor: 0.09, guiones: haloPunteado ? [0.22, 0.16] : undefined },
      relleno(circulo(0, 0, 0.78), color),
    ],
    letras: [{ texto: letra, x: 0, y: 0, tam: 0.95, color: BLANCO }],
  };
}

// Estación manual: caja roja con la flecha «jale hacia abajo» y la palanca.
function estacion(color: string, letra: string | null): FiguraSimbolo {
  const trazos: Trazo[] = [relleno(rectangulo(1.5, 1.9, 0.22), color)];
  if (letra) {
    trazos.push(relleno(rectangulo(1.0, 0.26, 0.06, 0, 0.42), BLANCO));
    return { trazos, letras: [{ texto: letra, x: 0, y: -0.28, tam: 0.75, color: BLANCO }] };
  }
  // Flecha hacia abajo y la palanca debajo.
  trazos.push(relleno('M -0.3 -0.62 L 0.3 -0.62 L 0 -0.18 Z', BLANCO));
  trazos.push(relleno(rectangulo(1.0, 0.3, 0.06, 0, 0.3), BLANCO));
  return { trazos, letras: [] };
}

// Módulo: marco blanco con borde grueso, franja de color arriba y su código.
function modulo(color: string, codigo: string): FiguraSimbolo {
  return {
    trazos: [
      { d: rectangulo(1.9, 1.5, 0.14), relleno: BLANCO, linea: color, grosor: 0.14 },
      relleno('M -0.88 -0.68 L 0.88 -0.68 L 0.88 -0.3 L -0.88 -0.3 Z', color),
    ],
    letras: [{ texto: codigo, x: 0, y: 0.2, tam: codigo.length > 2 ? 0.55 : 0.68, color }],
  };
}

// Aislador: marco con el moño (dos triángulos que se tocan).
function aislador(color: string): FiguraSimbolo {
  return {
    trazos: [
      { d: rectangulo(1.9, 1.5, 0.14), relleno: BLANCO, linea: color, grosor: 0.14 },
      relleno('M -0.6 -0.42 L 0.6 0.42 L 0.6 -0.42 L -0.6 0.42 Z', color),
    ],
    letras: [],
  };
}

// Sirena, estrobo o las dos: caja de color con la corneta y/o el destello.
function notificacion(color: string, conCorneta: boolean, conDestello: boolean, redonda = false): FiguraSimbolo {
  const fondo = redonda ? circulo(0, 0, 0.95) : rectangulo(1.8, 1.5, 0.2);
  const trazos: Trazo[] = [relleno(fondo, color)];
  if (conCorneta && conDestello) {
    trazos.push(relleno(corneta(-0.38, 0, 0.82), BLANCO));
    trazos.push(relleno(destello(0.46, 0, 0.8), BLANCO));
  } else if (conCorneta) {
    trazos.push(relleno(corneta(0.05, 0, 1.15), BLANCO));
  } else {
    trazos.push(relleno(destello(0, 0, 1.25), BLANCO));
  }
  return { trazos, letras: [] };
}

function caja(color: string): FiguraSimbolo {
  return {
    trazos: [{ d: circulo(0, 0, 0.9), relleno: BLANCO, linea: color, grosor: 0.12, guiones: [0.28, 0.2] }],
    letras: [{ texto: 'RG', x: 0, y: 0, tam: 0.7, color }],
  };
}

// Fin de línea: la resistencia en zigzag.
function finDeLinea(color: string): FiguraSimbolo {
  return {
    trazos: [
      { d: circulo(0, 0, 0.9), relleno: BLANCO, linea: color, grosor: 0.12 },
      { d: 'M -0.62 0 L -0.4 0 L -0.3 -0.3 L -0.1 0.3 L 0.1 -0.3 L 0.3 0.3 L 0.4 0 L 0.62 0', relleno: null, linea: color, grosor: 0.12 },
    ],
    letras: [],
  };
}

export function figuraDe(tipo: string): FiguraSimbolo {
  const color = colorEquipo(tipo);
  switch (tipo) {
    case 'SH': return detector(color, 'S', false);
    case 'SC': return detector(color, 'C', true);
    case 'EMA': return estacion(color, null);
    case 'EA': return estacion(color, 'A');
    case 'EL': return estacion(color, 'L');
    case 'AIS': return aislador(color);
    case 'CO': return notificacion(color, true, false);
    case 'ES': return notificacion(color, false, true);
    case 'SE': return notificacion(color, true, true);
    case 'BO': return notificacion(color, true, false, true);
    case 'BE': return notificacion(color, true, true);
    case 'RG': return caja(color);
    case 'FDL': return finDeLinea(color);
  }
  const forma = tipoDispositivo(tipo).forma;
  if (forma === 'detector') return detector(color, tipo.slice(0, 1), false);
  return modulo(color, tipo.slice(0, 3));
}

// ---------- Giro ----------

// Pasos para girar desde la ficha y cómo queda el ángulo (0 a 359).
export function girar(actual: number, grados: number): number {
  return (((Math.round(actual + grados) % 360) + 360) % 360);
}

// Un punto del símbolo (en unidades) llevado a la hoja: escala, giro y centro.
// y hacia abajo, giro en grados en el sentido de las manecillas.
export function aHoja(px: number, py: number, cx: number, cy: number, r: number, grados: number): [number, number] {
  const a = (grados * Math.PI) / 180;
  const x = px * r;
  const y = py * r;
  return [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)];
}
