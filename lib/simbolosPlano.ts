// Símbolos de los equipos en el PLANO (el diagrama unifilar usa los suyos,
// components/lazos/DiagramaLazo). Son los bloques de la simbología de AutoCAD
// de Clave (lib/simbolosBiblioteca.ts), con el color de cada equipo.
//
// Cada símbolo se describe una sola vez en unidades (radio 1, centro en 0,0,
// y hacia abajo) como trazos SVG y letras. La pantalla (SimboloPlano) y el
// PDF (exportarPlanoPdf) dibujan esto mismo, así se ven igual en los dos.

import { tipoDispositivo } from './lazos';
import { colorEquipo } from './planos';
import { BLOQUES, type Bloque } from './simbolosBiblioteca';

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
  if (r === 0) return `M ${x} ${y} L ${x + ancho} ${y} L ${x + ancho} ${y + alto} L ${x} ${y + alto} Z`;
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

// Corneta centrada en (cx, cy) a escala `e`.
function corneta(cx: number, cy: number, e: number): string {
  const p = [[-0.55, -0.2], [-0.22, -0.2], [0.38, -0.58], [0.38, 0.58], [-0.22, 0.2], [-0.55, 0.2]];
  return 'M ' + p.map(([x, y]) => `${cx + x * e} ${cy + y * e}`).join(' L ') + ' Z';
}

const relleno = (d: string, color: string): Trazo => ({ d, relleno: color, linea: null, grosor: 0 });

// ---------- Cada equipo ----------

// Para los tipos sin bloque en la simbología, con su mismo estilo de línea.
function detector(color: string, letra: string): FiguraSimbolo {
  return {
    trazos: [
      { d: circulo(0, 0, 1), relleno: BLANCO, linea: color, grosor: GROSOR_BLOQUE },
      { d: circulo(0, 0, 0.84), relleno: null, linea: color, grosor: GROSOR_BLOQUE },
    ],
    letras: [{ texto: letra, x: 0, y: 0, tam: 0.9, color }],
  };
}

// Módulo: doble marco y su código, como los MOD-… de la simbología.
function modulo(color: string, codigo: string): FiguraSimbolo {
  return {
    trazos: [
      { d: rectangulo(2, 2, 0), relleno: BLANCO, linea: color, grosor: GROSOR_BLOQUE },
      { d: rectangulo(1.68, 1.68, 0), relleno: null, linea: color, grosor: GROSOR_BLOQUE },
    ],
    letras: [{ texto: codigo, x: 0, y: 0, tam: codigo.length > 2 ? 0.62 : 0.85, color }],
  };
}

// Corneta o bocina sola: marco (redondo la bocina) con la corneta dentro.
function notificacion(color: string, redonda: boolean): FiguraSimbolo {
  const fondo = redonda ? circulo(0, 0, 1) : rectangulo(2, 2, 0);
  return {
    trazos: [
      { d: fondo, relleno: BLANCO, linea: color, grosor: GROSOR_BLOQUE },
      { d: corneta(0.05, 0, 1.15), relleno: null, linea: color, grosor: GROSOR_BLOQUE },
    ],
    letras: [],
  };
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

// Qué bloque de la simbología de AutoCAD de Clave (lib/simbolosBiblioteca.ts)
// dibuja cada tipo de la app. Los que no están aquí usan el dibujo propio.
export const BLOQUE_DE_TIPO: Record<string, string> = {
  FACP: 'TABLERO',
  SH: 'DET-PHOTO',
  SC: 'DET CALOR',
  MC: 'MOD-CONTROL',
  MM: 'MOD-MONITOR',
  MD: 'MOD-DUAL',
  CR: 'MOD-RELAY',
  AIS: 'MOD-AISLADOR',
  EMA: 'EMAN',
  EA: 'EST-ABORTO',
  EL: 'EST-DISPARO',
  SE: 'SIRENA',
  ES: 'ESTROBO',
  BE: 'BOCINA-ESTROBO',
  DM: 'DET-MULTI',
  DG: 'DET-GAS',
  DCO: 'DET-CO',
  DF: 'DET-FLAMA',
  DD: 'DET-DUCTO',
  ASP: 'VESDA',
  BRX: 'PHOTOBEAM-RX',
  BTX: 'PHOTOBEAM-TX',
  BRF: 'PHOTOBEAM-REFLEC',
  MMC: 'MOD-MON-CTRL',
  MMI: 'MINIMOD',
  MZ: 'MOD-ZONA',
  FS: 'SW-FLUJO',
  TS: 'SW-TAMPER',
  PS: 'SW-PRESION',
  RET: 'RETENEDOR',
  FP: 'FUENTE-NAC',
  ANN: 'ANUNCIADOR',
  PL: 'PANEL-SUPRESION',
  CA: 'CAMPANA',
  LD: 'LETRERO-DESCARGA',
};

const GROSOR_BLOQUE = 0.08;

// El bloque de AutoCAD con el color del equipo: líneas del color, el contorno
// de fuera con fondo blanco (para que se lea encima del plano) y los sólidos
// rellenos.
function deBloque(bloque: Bloque, color: string): FiguraSimbolo {
  const trazos = bloque.trazos.map((t): Trazo => {
    if (t.clase === 'relleno') return relleno(t.d, t.color || color);
    return { d: t.d, relleno: t.clase === 'cerrado' ? BLANCO : null, linea: color, grosor: GROSOR_BLOQUE };
  });
  return { trazos, letras: bloque.letras.map((l) => ({ ...l, color })) };
}

export function figuraDe(tipo: string): FiguraSimbolo {
  const color = colorEquipo(tipo);
  const bloque = BLOQUES[BLOQUE_DE_TIPO[tipo]];
  if (bloque) return deBloque(bloque, color);
  switch (tipo) {
    // La simbología no trae corneta ni bocina solas: se dibujan al mismo estilo.
    case 'CO': return notificacion(color, false);
    case 'BO': return notificacion(color, true);
    case 'RG': return caja(color);
    case 'FDL': return finDeLinea(color);
  }
  const forma = tipoDispositivo(tipo).forma;
  if (forma === 'detector') return detector(color, tipo.slice(0, 2));
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
