import { describe, expect, it } from 'vitest';
import { carrilesDe, desplazarCamino, puntaDeLlegada, puntasDeFlecha, radioDeEquipoEn, rutaPorTuberia, trazoDeConexion } from './rutaTuberia';
import type { TuberiaPlano } from './planos';

function tubo(id: string, puntos: [number, number][]): TuberiaPlano {
  return { id, tipo: 'conduit', diametro: '3/4', puntos };
}

describe('ruta del cable por la tubería', () => {
  // Tubería en L: de (0,0) a (100,0) y baja a (100,100).
  const enL = [tubo('t1', [[0, 0], [100, 0], [100, 100]])];

  it('sigue la tubería en vez de irse en diagonal', () => {
    const ruta = rutaPorTuberia(enL, [0, 5], [105, 100], 20);
    expect(ruta).toEqual([[0, 5], [0, 0], [100, 0], [100, 100], [105, 100]]);
  });

  it('pasa de una tubería a otra que termina sobre ella (en T)', () => {
    const tuberias = [tubo('a', [[0, 0], [200, 0]]), tubo('b', [[100, 0], [100, 80]])];
    const ruta = rutaPorTuberia(tuberias, [0, 0], [100, 80], 10);
    expect(ruta).toEqual([[0, 0], [100, 0], [100, 80]]);
  });

  it('dos dispositivos en el mismo tramo recto: directo por el tramo', () => {
    const ruta = rutaPorTuberia([tubo('a', [[0, 0], [200, 0]])], [20, 3], [150, -3], 10);
    expect(ruta).toEqual([[20, 3], [20, 0], [150, 0], [150, -3]]);
  });

  it('sin tubería cerca o sin unión entre tuberías: null (línea directa)', () => {
    expect(rutaPorTuberia(enL, [0, 0], [500, 500], 20)).toBeNull();
    const sueltas = [tubo('a', [[0, 0], [50, 0]]), tubo('b', [[0, 100], [50, 100]])];
    expect(rutaPorTuberia(sueltas, [0, 0], [50, 100], 10)).toBeNull();
    expect(rutaPorTuberia([], [0, 0], [1, 1], 10)).toBeNull();
  });

  it('tuberías que se cruzan sin unirse no se toman como unidas', () => {
    const cruz = [tubo('a', [[0, 50], [100, 50]]), tubo('b', [[50, 0], [50, 100]])];
    expect(rutaPorTuberia(cruz, [0, 50], [50, 0], 5)).toBeNull();
  });
});

describe('trazo de la conexión', () => {
  it('recorta las puntas y reparte flechas a lo largo', () => {
    const trazo = trazoDeConexion([[0, 0], [100, 0], [100, 100]], 10, 60);
    expect(trazo?.linea).toEqual([[10, 0], [100, 0], [100, 90]]);
    expect(trazo?.flechas.length).toBe(3);
    // La primera va a la derecha, la última hacia abajo.
    expect(trazo?.flechas[0].ux).toBe(1);
    expect(trazo?.flechas[2].uy).toBe(1);
  });

  it('marca dónde sale y dónde llega, recortando según el tamaño de cada equipo', () => {
    // Sale de un equipo normal (10) y llega a uno grande (30).
    const trazo = trazoDeConexion([[0, 0], [200, 0]], 10, 60, 30);
    expect(trazo?.salida).toEqual([10, 0]);
    expect(trazo?.llegada.punto).toEqual([170, 0]);
    // La punta toca la llegada y abre hacia atrás.
    const punta = puntaDeLlegada(trazo!.llegada, 10);
    expect(punta[0]).toEqual([170, 0]);
    expect(punta[1][0]).toBe(160);
    const radioEn = radioDeEquipoEn([{ id: 'a', tipo: 'SH', x: 5, y: 5, tamano: 3 }], 4);
    expect(radioEn([5, 5])).toBe(12);
    expect(radioEn([9, 9])).toBe(4);
  });

  it('muy corta: no se dibuja', () => {
    expect(trazoDeConexion([[0, 0], [15, 0]], 10, 60)).toBeNull();
  });

  it('la flecha apunta hacia donde va', () => {
    const puntas = puntasDeFlecha({ punto: [0, 0], ux: 1, uy: 0 }, 10);
    expect(puntas[0]).toEqual([5, 0]);
    expect(puntas[1][0]).toBeLessThan(0);
  });
});

describe('carriles: ida y regreso por la misma tubería', () => {
  it('la ida y el regreso quedan en lados opuestos de la tubería', () => {
    // Ida de x=0 a x=100 y regreso de x=100 a x=0, por la misma recta.
    const ida = desplazarCamino([[0, 0], [100, 0]], 2);
    const regreso = desplazarCamino([[100, 0], [0, 0]], 2);
    expect(ida[0][1]).toBe(2);
    expect(regreso[0][1]).toBe(-2);
  });

  it('dos que van en el mismo sentido por el mismo tramo toman carriles distintos', () => {
    // El panel llega hasta el 5 pasando por la tubería y regresa 5→4→3.
    const caminos: [number, number][][] = [
      [[0, 0], [100, 0]], // ida larga
      [[100, 0], [75, 0]], // 5 → 4 (sentido contrario: no estorba)
      [[75, 0], [50, 0]], // 4 → 3
      [[20, 0], [80, 0]], // otro lazo, mismo sentido que la ida
    ];
    expect(carrilesDe(caminos, 0.5)).toEqual([0, 0, 0, 1]);
  });

  it('en un quiebre las dos rectas corridas se juntan en esquina', () => {
    // A la derecha, luego hacia abajo (y crece hacia abajo).
    const corrido = desplazarCamino([[0, 0], [100, 0], [100, 100]], 2);
    expect(corrido[1][0]).toBeCloseTo(98);
    expect(corrido[1][1]).toBeCloseTo(2);
  });
});
