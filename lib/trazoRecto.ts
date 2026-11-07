// Tubería derecha, como en AutoCAD: cada tramo va a 90° (o a 45°), los
// puntos se alinean con los equipos y la tubería que ya están (rastreo), y
// al llegar a un equipo que no está en línea se mete un codo para no ir
// chueco. Lógica pura; se prueba en lib/trazoRecto.test.ts.

import type { Punto } from './planos';

// recto = solo horizontal y vertical; 45 = también diagonales; libre = sin ayuda.
export type ModoTrazo = 'recto' | '45' | 'libre';

// Guías de alineación que se dibujan mientras se traza (x de una vertical,
// y de una horizontal).
export type Guias = { x: number | null; y: number | null };

const CASI_CERO = 1e-6;

// Lleva `p` a la dirección permitida más cercana vista desde `anterior`,
// conservando lo que avanza en esa dirección.
export function aDireccionPermitida(anterior: Punto, p: Punto, modo: ModoTrazo): Punto {
  const dx = p[0] - anterior[0];
  const dy = p[1] - anterior[1];
  if (modo === 'libre') return p;
  if (modo === 'recto') {
    return Math.abs(dx) >= Math.abs(dy) ? [p[0], anterior[1]] : [anterior[0], p[1]];
  }
  // 45°: el ángulo se redondea al múltiplo de 45 más cercano y se proyecta.
  const angulo = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const ux = Math.cos(angulo);
  const uy = Math.sin(angulo);
  const avance = dx * ux + dy * uy;
  return [anterior[0] + limpio(ux) * avance, anterior[1] + limpio(uy) * avance];
}

function limpio(n: number): number {
  return Math.abs(n) < CASI_CERO ? 0 : n;
}

// ¿Un tramo de a a b ya va en una dirección permitida?
export function vaDerecho(a: Punto, b: Punto, modo: ModoTrazo, tolerancia: number): boolean {
  const dx = Math.abs(b[0] - a[0]);
  const dy = Math.abs(b[1] - a[1]);
  if (modo === 'libre') return true;
  if (dx <= tolerancia || dy <= tolerancia) return true;
  return modo === '45' && Math.abs(dx - dy) <= tolerancia;
}

// Puntos para llegar de `a` a un destino fijo (el centro de un equipo) sin
// ir chueco: si no está en línea, primero un codo. `dirPrevia` es el tramo
// anterior: se sigue en su misma dirección para no hacer un quiebre de más.
export function conCodo(a: Punto, b: Punto, modo: ModoTrazo, dirPrevia: Punto | null, tolerancia: number): Punto[] {
  if (vaDerecho(a, b, modo, tolerancia)) return [b];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (modo === '45') {
    // Diagonal hasta quedar en línea y luego derecho.
    const d = Math.min(Math.abs(dx), Math.abs(dy));
    return [[a[0] + Math.sign(dx) * d, a[1] + Math.sign(dy) * d], b];
  }
  let horizontalPrimero = Math.abs(dx) >= Math.abs(dy);
  if (dirPrevia) horizontalPrimero = Math.abs(dirPrevia[0]) >= Math.abs(dirPrevia[1]);
  const esquina: Punto = horizontalPrimero ? [b[0], a[1]] : [a[0], b[1]];
  return [esquina, b];
}

// Rastreo: si una coordenada queda cerca de la de una referencia (centro de
// un equipo, quiebre de una tubería), se iguala. `ejes` dice cuáles se
// pueden mover (en un tramo horizontal solo la x).
export function alinear(p: Punto, referencias: Punto[], tolerancia: number, ejes: { x: boolean; y: boolean }): { punto: Punto; guias: Guias } {
  let x = p[0];
  let y = p[1];
  let guiaX: number | null = null;
  let guiaY: number | null = null;
  let mejorX = tolerancia;
  let mejorY = tolerancia;
  for (const r of referencias) {
    const ddx = Math.abs(r[0] - p[0]);
    const ddy = Math.abs(r[1] - p[1]);
    if (ejes.x && ddx <= mejorX) {
      mejorX = ddx;
      x = r[0];
      guiaX = r[0];
    }
    if (ejes.y && ddy <= mejorY) {
      mejorY = ddy;
      y = r[1];
      guiaY = r[1];
    }
  }
  return { punto: [x, y], guias: { x: guiaX, y: guiaY } };
}

export type Ajuste = { puntos: Punto[]; guias: Guias };

// Lo que se agrega al trazo al tocar `p`:
// - Cerca de un equipo o de un nodo de otra tubería (`puntoFijo`): se pega
//   ahí exacto (con codo si hace falta), para unir nodo con nodo.
// - Si no: a 90°/45° del punto anterior y alineado con lo que ya hay.
export function siguientesPuntos(
  trazo: Punto[],
  p: Punto,
  opciones: { modo: ModoTrazo; puntoFijo: Punto | null; referencias: Punto[]; tolerancia: number },
): Ajuste {
  const { modo, puntoFijo, referencias, tolerancia } = opciones;
  const sinGuias: Guias = { x: null, y: null };
  const anterior = trazo[trazo.length - 1] || null;
  const previo = trazo[trazo.length - 2] || null;
  const dirPrevia: Punto | null = anterior && previo ? [anterior[0] - previo[0], anterior[1] - previo[1]] : null;

  if (puntoFijo) {
    if (!anterior) return { puntos: [puntoFijo], guias: sinGuias };
    return { puntos: conCodo(anterior, puntoFijo, modo, dirPrevia, tolerancia), guias: sinGuias };
  }
  if (!anterior) {
    const { punto, guias } = alinear(p, referencias, tolerancia, { x: true, y: true });
    return { puntos: [punto], guias };
  }
  if (modo === 'libre') return { puntos: [p], guias: sinGuias };

  const derecho = aDireccionPermitida(anterior, p, modo);
  const horizontal = Math.abs(derecho[1] - anterior[1]) < CASI_CERO;
  const vertical = Math.abs(derecho[0] - anterior[0]) < CASI_CERO;
  // En diagonal no se alinea: movería el punto fuera de los 45°.
  if (!horizontal && !vertical) return { puntos: [derecho], guias: sinGuias };
  const { punto, guias } = alinear(derecho, referencias, tolerancia, { x: horizontal, y: vertical });
  return { puntos: [punto], guias };
}

// Endereza una tubería ya trazada: cada tramo chueco se vuelve un codo.
export function enderezar(puntos: Punto[], modo: ModoTrazo, tolerancia: number): Punto[] {
  if (modo === 'libre' || puntos.length < 2) return puntos;
  const resultado: Punto[] = [puntos[0]];
  for (let i = 1; i < puntos.length; i++) {
    const a = resultado[resultado.length - 1];
    const previo = resultado[resultado.length - 2] || null;
    const dirPrevia: Punto | null = previo ? [a[0] - previo[0], a[1] - previo[1]] : null;
    resultado.push(...conCodo(a, puntos[i], modo, dirPrevia, tolerancia));
  }
  return resultado;
}
