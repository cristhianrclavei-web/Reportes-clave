import { describe, expect, it } from 'vitest';
import {
  aEscuadra, cantidadesDeEquipos, cantidadesDeTuberia, colocacionDePagina, equipoEn, escalaDesdeMedida, siguienteTamano,
  escalaDesdeProporcion, leerSembrado, longitudEnHoja, proporcionDeEscala, sembradoSchema, tuberiaEn, type Sembrado,
} from './planos';

const sembrado: Sembrado = {
  equipos: [
    { id: 'a', tipo: 'SH', x: 10, y: 10 },
    { id: 'b', tipo: 'SH', x: 100, y: 10 },
    { id: 'c', tipo: 'EMA', x: 50, y: 50 },
  ],
  tuberias: [
    { id: 't1', tipo: 'EMT', diametro: '3/4"', puntos: [[0, 0], [30, 0], [30, 40]] },
    { id: 't2', tipo: 'EMT', diametro: '3/4"', puntos: [[0, 0], [10, 0]] },
    { id: 't3', tipo: 'EMT', diametro: '1/2"', puntos: [[0, 0], [0, 5]] },
  ],
};

describe('escala', () => {
  it('1:100 impreso: 72 puntos (una pulgada) son 2.54 m', () => {
    const m = escalaDesdeProporcion(100) as number;
    expect(m * 72).toBeCloseTo(2.54, 6);
    expect(proporcionDeEscala(m)).toBe(100);
  });
  it('rechaza escalas sin sentido', () => {
    expect(escalaDesdeProporcion(0)).toBeNull();
    expect(escalaDesdeMedida([0, 0], [0, 0], 1)).toBeNull();
    expect(escalaDesdeMedida([0, 0], [10, 0], 0)).toBeNull();
  });
  it('calibra con una medida: 50 puntos = 0.90 m', () => {
    expect(escalaDesdeMedida([0, 0], [30, 40], 0.9)).toBeCloseTo(0.018, 6);
  });
});

describe('cantidades', () => {
  it('cuenta equipos por tipo, el más usado primero', () => {
    expect(cantidadesDeEquipos(sembrado).map((c) => [c.tipo, c.cuantos])).toEqual([['SH', 2], ['EMA', 1]]);
  });
  it('suma metros por tipo y diámetro', () => {
    expect(longitudEnHoja(sembrado.tuberias[0].puntos)).toBe(70);
    const filas = cantidadesDeTuberia(sembrado, 0.1);
    expect(filas.map((f) => [f.diametro, f.tramos, Number(f.metros?.toFixed(3))])).toEqual([['1/2"', 1, 0.5], ['3/4"', 2, 8]]);
  });
  it('sin escala solo cuenta tramos', () => {
    expect(cantidadesDeTuberia(sembrado, null)[0].metros).toBeNull();
  });
});

describe('tocar en el plano', () => {
  it('encuentra el equipo más cercano dentro del radio', () => {
    expect(equipoEn(sembrado, [12, 11], 5)?.id).toBe('a');
    expect(equipoEn(sembrado, [30, 30], 5)).toBeNull();
  });
  it('un símbolo agrandado se toca en todo su tamaño', () => {
    const grande = { ...sembrado, equipos: [{ ...sembrado.equipos[0], tamano: 3 }] };
    expect(equipoEn(grande, [22, 10], 5, 4)?.id).toBe(sembrado.equipos[0].id);
    expect(equipoEn(sembrado, [22, 10], 5, 4)).toBeNull();
  });
  it('agranda y achica por pasos sin salirse de los extremos', () => {
    expect(siguienteTamano(1, 1)).toBe(1.25);
    expect(siguienteTamano(1, -1)).toBe(0.75);
    expect(siguienteTamano(3, 1)).toBe(3);
    expect(siguienteTamano(0.4, -1)).toBe(0.4);
  });
  it('encuentra la tubería cerca de un tramo', () => {
    expect(tuberiaEn(sembrado, [31, 20], 2)?.id).toBe('t1');
    expect(tuberiaEn(sembrado, [80, 80], 2)).toBeNull();
  });
  it('endereza la tubería casi horizontal o vertical', () => {
    expect(aEscuadra([0, 0], [100, 3])).toEqual([100, 0]);
    expect(aEscuadra([0, 0], [2, 100])).toEqual([0, 100]);
    expect(aEscuadra([0, 0], [50, 50])).toEqual([50, 50]);
  });
});

describe('validación', () => {
  it('acepta un sembrado válido y descarta basura', () => {
    expect(sembradoSchema.safeParse(sembrado).success).toBe(true);
    expect(leerSembrado({ equipos: 'x' })).toEqual({ equipos: [], tuberias: [] });
    expect(sembradoSchema.safeParse({ equipos: [], tuberias: [{ id: 't', tipo: 'EMT', diametro: '1"', puntos: [[0, 0]] }] }).success).toBe(false);
  });
});

describe('colocación de la página girada', () => {
  it('cada giro deja la hoja dentro de la nueva', () => {
    expect(colocacionDePagina(0, 600, 400)).toEqual({ x: 0, y: 0, giro: 0 });
    expect(colocacionDePagina(90, 600, 400)).toEqual({ x: 0, y: 600, giro: -90 });
    expect(colocacionDePagina(180, 600, 400)).toEqual({ x: 600, y: 400, giro: 180 });
    expect(colocacionDePagina(-90, 600, 400)).toEqual({ x: 400, y: 0, giro: 90 });
  });
});
