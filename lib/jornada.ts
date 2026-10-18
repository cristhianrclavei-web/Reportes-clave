// Jornada de un técnico en un día, en tramos que no se enciman: cada minuto
// cuenta una sola vez, para saber en qué se va el tiempo (trabajo en
// servicio, comida, traslado, compra…) y cuánto quedó sin registrar.
//
// Qué manda cuando dos cosas caen a la misma hora:
//   actividad de bitácora  >  pausa del servicio  >  servicio
// Así, salir por material a mitad de un servicio descuenta ese rato del
// servicio, y la comida dentro del servicio no cuenta como trabajo.
//
// Puro: recibe milisegundos y el «tope» (ahora, o el fin del día si ya
// pasó); no lee el reloj.

import { TipoActividad } from './tiposActividad';

export type ClaseTiempo = 'servicio' | 'comida' | 'pausa' | TipoActividad | 'sin_registrar';

export type PausaDeServicio = { inicio: number; fin: number | null; tipo: string | null };
export type ServicioDelDia = { id: string; titulo: string; inicio: number; fin: number | null; pausas: PausaDeServicio[] };
export type ActividadDelDia = { id: string; titulo: string; tipo: TipoActividad; inicio: number; fin: number | null; dudoso?: boolean };

export type Segmento = {
  clase: ClaseTiempo;
  inicio: number;
  fin: number;
  // De dónde sale el tramo (para abrirlo); los huecos no tienen.
  origen?: { tipo: 'servicio' | 'actividad'; id: string; titulo: string };
  dudoso?: boolean;
};

const MIN = 60000;
// Huecos más cortos que esto (el minuto entre cerrar una cosa y abrir otra)
// no cuentan como «sin registrar».
const HUECO_MINIMO = 5 * MIN;

// Una pausa de comida es comida; una salida por material dentro del
// servicio es compra; el resto de las pausas (espera del cliente, asunto
// personal, otro) se agrupan como «pausa».
export function claseDePausa(tipo: string | null): ClaseTiempo {
  if (tipo === 'comida') return 'comida';
  if (tipo === 'material') return 'compra';
  return 'pausa';
}

type Pieza = { inicio: number; fin: number; prioridad: number; clase: ClaseTiempo; origen: Segmento['origen']; dudoso?: boolean };

function piezasDelDia(servicios: ServicioDelDia[], actividades: ActividadDelDia[], tope: number): Pieza[] {
  const piezas: Pieza[] = [];
  const agregar = (p: Pieza) => {
    const fin = Math.min(p.fin, tope);
    if (fin > p.inicio) piezas.push({ ...p, fin });
  };
  for (const s of servicios) {
    const origen = { tipo: 'servicio' as const, id: s.id, titulo: s.titulo };
    agregar({ inicio: s.inicio, fin: s.fin ?? tope, prioridad: 1, clase: 'servicio', origen });
    for (const p of s.pausas) {
      // Una pausa que quedó abierta termina cuando termina el servicio.
      const finPausa = p.fin ?? s.fin ?? tope;
      agregar({ inicio: p.inicio, fin: finPausa, prioridad: 2, clase: claseDePausa(p.tipo), origen });
    }
  }
  for (const a of actividades) {
    agregar({
      inicio: a.inicio, fin: a.fin ?? tope, prioridad: 3, clase: a.tipo,
      origen: { tipo: 'actividad', id: a.id, titulo: a.titulo }, dudoso: a.dudoso,
    });
  }
  return piezas;
}

// La pieza que manda en un instante: la de mayor prioridad; si empatan
// (dos actividades encimadas), la que empezó después.
function piezaQueManda(piezas: Pieza[], instante: number): Pieza | null {
  let elegida: Pieza | null = null;
  for (const p of piezas) {
    if (p.inicio > instante || p.fin <= instante) continue;
    if (!elegida || p.prioridad > elegida.prioridad || (p.prioridad === elegida.prioridad && p.inicio > elegida.inicio)) {
      elegida = p;
    }
  }
  return elegida;
}

export function segmentosDelDia(entrada: {
  servicios: ServicioDelDia[];
  actividades: ActividadDelDia[];
  // Horario de la jornada ese día; null si no aplica (fin de semana).
  jornada: { inicio: number; fin: number } | null;
  tope: number;
}): Segmento[] {
  const piezas = piezasDelDia(entrada.servicios, entrada.actividades, entrada.tope);
  if (piezas.length === 0) return [];

  // Del inicio de la jornada (o lo primero que se registró, si fue antes)
  // al fin de la jornada (o lo último, si fue después), sin pasar de «ahora».
  let desde = Math.min(...piezas.map((p) => p.inicio));
  let hasta = Math.max(...piezas.map((p) => p.fin));
  if (entrada.jornada) {
    desde = Math.min(desde, entrada.jornada.inicio);
    hasta = Math.max(hasta, entrada.jornada.fin);
  }
  hasta = Math.min(hasta, entrada.tope);
  if (hasta <= desde) return [];

  const cortes = new Set<number>([desde, hasta]);
  for (const p of piezas) {
    if (p.inicio > desde && p.inicio < hasta) cortes.add(p.inicio);
    if (p.fin > desde && p.fin < hasta) cortes.add(p.fin);
  }
  const orden = Array.from(cortes).sort((a, b) => a - b);

  const segmentos: Segmento[] = [];
  for (let i = 0; i < orden.length - 1; i++) {
    const inicio = orden[i];
    const fin = orden[i + 1];
    const pieza = piezaQueManda(piezas, inicio);
    const nuevo: Segmento = pieza
      ? { clase: pieza.clase, inicio, fin, origen: pieza.origen, dudoso: pieza.dudoso }
      : { clase: 'sin_registrar', inicio, fin };
    const anterior = segmentos[segmentos.length - 1];
    const mismoTramo = anterior && anterior.clase === nuevo.clase && anterior.origen?.id === nuevo.origen?.id && anterior.fin === inicio;
    if (mismoTramo) anterior.fin = fin;
    else segmentos.push(nuevo);
  }
  return segmentos.filter((s) => s.clase !== 'sin_registrar' || s.fin - s.inicio >= HUECO_MINIMO);
}

export function minutosPorClaseTiempo(segmentos: Segmento[]): Partial<Record<ClaseTiempo, number>> {
  const suma: Partial<Record<ClaseTiempo, number>> = {};
  for (const s of segmentos) {
    suma[s.clase] = (suma[s.clase] || 0) + (s.fin - s.inicio) / MIN;
  }
  for (const clave of Object.keys(suma) as ClaseTiempo[]) suma[clave] = Math.round(suma[clave]!);
  return suma;
}

// Dos rangos se enciman si uno empieza antes de que termine el otro.
export function seEnciman(a: { inicio: number; fin: number }, b: { inicio: number; fin: number }): boolean {
  return a.inicio < b.fin && b.inicio < a.fin;
}

// Tramos libres dentro de [inicio, fin] que no tocan ninguna de las
// actividades dadas: sirve para ofrecer «ajustar a lo libre» cuando lo que
// se quiere registrar choca con algo.
export function tramosLibres(rango: { inicio: number; fin: number }, ocupados: { inicio: number; fin: number }[]): { inicio: number; fin: number }[] {
  const orden = ocupados.filter((o) => seEnciman(o, rango)).sort((a, b) => a.inicio - b.inicio);
  const libres: { inicio: number; fin: number }[] = [];
  let cursor = rango.inicio;
  for (const o of orden) {
    if (o.inicio > cursor) libres.push({ inicio: cursor, fin: Math.min(o.inicio, rango.fin) });
    cursor = Math.max(cursor, o.fin);
  }
  if (cursor < rango.fin) libres.push({ inicio: cursor, fin: rango.fin });
  return libres.filter((l) => l.fin - l.inicio >= MIN);
}
