// Recorrido del cable por la tubería del plano: en vez de unir dos
// dispositivos con una línea directa (en diagonal, cruzando muros), se busca
// el camino más corto POR las tuberías dibujadas, como va el cable de verdad.
// Lógica pura, se prueba en lib/rutaTuberia.test.ts.

import type { Punto, TuberiaPlano } from './planos';

type Proyeccion = { punto: Punto; t: number; distancia: number };

// El punto de un segmento más cercano a `p` (t = 0 en `a`, 1 en `b`).
function proyectar(p: Punto, a: Punto, b: Punto): Proyeccion {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const largo2 = dx * dx + dy * dy;
  let t = 0;
  if (largo2 > 0) t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / largo2;
  t = Math.max(0, Math.min(1, t));
  const punto: Punto = [a[0] + dx * t, a[1] + dy * t];
  return { punto, t, distancia: Math.hypot(p[0] - punto[0], p[1] - punto[1]) };
}

function distancia(a: Punto, b: Punto): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

type Segmento = { a: Punto; b: Punto; cortes: { t: number; punto: Punto }[] };

// Red de nodos (puntos) y tramos entre ellos. Dos puntos a menos de
// `tolerancia` son el mismo nodo (tuberías que se tocan en una punta).
class Red {
  puntos: Punto[] = [];
  vecinos: { a: number; largo: number }[][] = [];
  constructor(private tolerancia: number) {}

  nodo(p: Punto): number {
    for (let i = 0; i < this.puntos.length; i++) {
      if (distancia(this.puntos[i], p) <= this.tolerancia) return i;
    }
    this.puntos.push(p);
    this.vecinos.push([]);
    return this.puntos.length - 1;
  }

  // Nodo de paso (no se junta con otros aunque queden cerca), unido a `con`.
  private base = -1;
  agregarTemporal(p: Punto, con: number[]): number {
    if (this.base === -1) this.base = this.puntos.length;
    this.puntos.push(p);
    this.vecinos.push([]);
    const nuevo = this.puntos.length - 1;
    for (const otro of con) this.unir(nuevo, otro);
    return nuevo;
  }

  quitarTemporales() {
    if (this.base === -1) return;
    this.puntos.length = this.base;
    this.vecinos.length = this.base;
    for (const lista of this.vecinos) {
      for (let k = lista.length - 1; k >= 0; k--) if (lista[k].a >= this.base) lista.splice(k, 1);
    }
    this.base = -1;
  }

  unir(i: number, j: number) {
    if (i === j) return;
    const largo = distancia(this.puntos[i], this.puntos[j]);
    this.vecinos[i].push({ a: j, largo });
    this.vecinos[j].push({ a: i, largo });
  }

  // Camino más corto (Dijkstra sencillo: las redes de un plano son de
  // cientos de nodos, no hace falta más).
  camino(desde: number, hasta: number): Punto[] | null {
    const n = this.puntos.length;
    const costo = new Array<number>(n).fill(Infinity);
    const previo = new Array<number>(n).fill(-1);
    const hecho = new Array<boolean>(n).fill(false);
    costo[desde] = 0;
    for (let vuelta = 0; vuelta < n; vuelta++) {
      let actual = -1;
      for (let i = 0; i < n; i++) {
        if (!hecho[i] && costo[i] < Infinity && (actual === -1 || costo[i] < costo[actual])) actual = i;
      }
      if (actual === -1 || actual === hasta) break;
      hecho[actual] = true;
      for (const { a, largo } of this.vecinos[actual]) {
        if (costo[actual] + largo < costo[a]) {
          costo[a] = costo[actual] + largo;
          previo[a] = actual;
        }
      }
    }
    if (costo[hasta] === Infinity) return null;
    const ruta: Punto[] = [];
    for (let i = hasta; i !== -1; i = previo[i]) ruta.unshift(this.puntos[i]);
    return ruta;
  }
}

// Red de tuberías de un plano, armada una vez; luego se pide la ruta entre
// dos puntos cuantas veces haga falta (una por cada conexión del lazo).
export function redDeTuberias(tuberias: TuberiaPlano[], alcance: number) {
  const tolerancia = alcance * 0.08;
  const segmentos: Segmento[] = [];
  for (const t of tuberias) {
    for (let i = 0; i + 1 < t.puntos.length; i++) segmentos.push({ a: t.puntos[i], b: t.puntos[i + 1], cortes: [] });
  }

  // Una tubería que termina sobre otra (en T) se une ahí aunque la otra no
  // tenga un quiebre en ese punto.
  for (const t of tuberias) {
    if (t.puntos.length < 2) continue;
    for (const punta of [t.puntos[0], t.puntos[t.puntos.length - 1]]) {
      for (const s of segmentos) {
        const pr = proyectar(punta, s.a, s.b);
        if (pr.distancia <= tolerancia && pr.t > 0 && pr.t < 1) s.cortes.push({ t: pr.t, punto: pr.punto });
      }
    }
  }

  // Cada segmento partido en piezas por sus cortes; cada pieza une dos nodos.
  const red = new Red(tolerancia);
  const piezas: { i: number; j: number }[] = [];
  for (const s of segmentos) {
    const orden = [...s.cortes].sort((x, y) => x.t - y.t).map((c) => c.punto);
    const puntos = [s.a, ...orden, s.b];
    for (let k = 0; k + 1 < puntos.length; k++) {
      const i = red.nodo(puntos[k]);
      const j = red.nodo(puntos[k + 1]);
      if (i === j) continue;
      red.unir(i, j);
      piezas.push({ i, j });
    }
  }

  // Dónde entra el cable a la tubería: el punto más cercano de alguna pieza.
  function entradaDe(p: Punto): { pieza: { i: number; j: number }; punto: Punto } | null {
    let mejor: { pieza: { i: number; j: number }; punto: Punto; d: number } | null = null;
    for (const pieza of piezas) {
      const pr = proyectar(p, red.puntos[pieza.i], red.puntos[pieza.j]);
      if (pr.distancia > alcance) continue;
      if (!mejor || pr.distancia < mejor.d) mejor = { pieza, punto: pr.punto, d: pr.distancia };
    }
    return mejor;
  }

  // Recorrido de `desde` a `hasta` siguiendo las tuberías. null si alguno
  // de los dos no está junto a una tubería (a más de `alcance`) o si las
  // tuberías no los unen: entonces se dibuja la línea directa.
  function ruta(desde: Punto, hasta: Punto): Punto[] | null {
    const a = entradaDe(desde);
    const b = entradaDe(hasta);
    if (!a || !b) return null;
    // Dos nodos de paso, unidos a las puntas de su pieza; se quitan al terminar.
    const nA = red.agregarTemporal(a.punto, [a.pieza.i, a.pieza.j]);
    const unirB = [b.pieza.i, b.pieza.j];
    const mismaPieza = a.pieza === b.pieza;
    if (mismaPieza) unirB.push(nA);
    const nB = red.agregarTemporal(b.punto, unirB);
    const camino = red.camino(nA, nB);
    red.quitarTemporales();
    if (!camino) return null;
    return sinRepetidos([desde, ...camino, hasta], tolerancia);
  }

  return { ruta };
}

// Atajo para una sola ruta (pruebas).
export function rutaPorTuberia(tuberias: TuberiaPlano[], desde: Punto, hasta: Punto, alcance: number): Punto[] | null {
  return redDeTuberias(tuberias, alcance).ruta(desde, hasta);
}

function sinRepetidos(puntos: Punto[], tolerancia: number): Punto[] {
  const limpio: Punto[] = [];
  for (const p of puntos) {
    if (limpio.length === 0 || distancia(limpio[limpio.length - 1], p) > tolerancia) limpio.push(p);
  }
  return limpio;
}

// ---------- Para dibujar ----------

function largoDe(puntos: Punto[]): number {
  let total = 0;
  for (let i = 0; i + 1 < puntos.length; i++) total += distancia(puntos[i], puntos[i + 1]);
  return total;
}

// El punto a `d` del inicio del recorrido y hacia dónde va ahí.
function puntoA(puntos: Punto[], d: number): { punto: Punto; ux: number; uy: number } {
  let resta = d;
  for (let i = 0; i + 1 < puntos.length; i++) {
    const largo = distancia(puntos[i], puntos[i + 1]);
    if (largo === 0) continue;
    const ux = (puntos[i + 1][0] - puntos[i][0]) / largo;
    const uy = (puntos[i + 1][1] - puntos[i][1]) / largo;
    if (resta <= largo || i + 2 === puntos.length) {
      return { punto: [puntos[i][0] + ux * resta, puntos[i][1] + uy * resta], ux, uy };
    }
    resta -= largo;
  }
  return { punto: puntos[0], ux: 1, uy: 0 };
}

// Recorta el recorrido `desde` y `hasta` de distancia en sus puntas.
function recortar(puntos: Punto[], desde: number, hasta: number): Punto[] {
  const total = largoDe(puntos);
  const resultado: Punto[] = [puntoA(puntos, desde).punto];
  let acumulado = 0;
  for (let i = 0; i + 1 < puntos.length; i++) {
    acumulado += distancia(puntos[i], puntos[i + 1]);
    if (acumulado > desde && acumulado < total - hasta) resultado.push(puntos[i + 1]);
  }
  resultado.push(puntoA(puntos, total - hasta).punto);
  return resultado;
}

export type Flecha = { punto: Punto; ux: number; uy: number };

// Lo que se dibuja de una conexión: la línea (sin tocar los símbolos) y las
// flechas repartidas a lo largo, cada `cada` de distancia (mínimo una, a la
// mitad). null si es tan corta que no cabe.
export function trazoDeConexion(camino: Punto[], separacion: number, cada: number): { linea: Punto[]; flechas: Flecha[] } | null {
  const total = largoDe(camino);
  if (total < separacion * 2.2) return null;
  const linea = recortar(camino, separacion, separacion);
  const util = largoDe(linea);
  const cuantas = Math.max(1, Math.floor(util / cada));
  const flechas: Flecha[] = [];
  for (let k = 0; k < cuantas; k++) flechas.push(puntoA(linea, (util * (k + 0.5)) / cuantas));
  return { linea, flechas };
}

// Punta de flecha delgada con muesca atrás (no un triángulo grueso), con la
// punta en el punto y hacia (ux, uy). `p` es el largo de la flecha.
export function puntasDeFlecha(f: Flecha, p: number): Punto[] {
  const { punto: [x, y], ux, uy } = f;
  // Perpendicular a la dirección.
  const nx = -uy;
  const ny = ux;
  const atras = p;
  const ancho = p * 0.42;
  const muesca = p * 0.7;
  const px = x + ux * p * 0.5;
  const py = y + uy * p * 0.5;
  return [
    [px, py],
    [px - ux * atras + nx * ancho, py - uy * atras + ny * ancho],
    [px - ux * muesca, py - uy * muesca],
    [px - ux * atras - nx * ancho, py - uy * atras - ny * ancho],
  ];
}
