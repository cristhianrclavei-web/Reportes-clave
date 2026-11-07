import { describe, expect, it } from 'vitest';
import { aDireccionPermitida, alinear, conCodo, enderezar, siguientesPuntos } from './trazoRecto';

describe('dirección permitida', () => {
  it('a 90° se queda con el eje que más avanza', () => {
    expect(aDireccionPermitida([0, 0], [100, 30], 'recto')).toEqual([100, 0]);
    expect(aDireccionPermitida([0, 0], [20, -90], 'recto')).toEqual([0, -90]);
  });
  it('a 45° acepta diagonales', () => {
    const [x, y] = aDireccionPermitida([0, 0], [100, 90], '45');
    expect(x).toBeCloseTo(95);
    expect(y).toBeCloseTo(95);
    expect(aDireccionPermitida([0, 0], [100, 10], '45')).toEqual([100, 0]);
  });
  it('libre no toca el punto', () => {
    expect(aDireccionPermitida([0, 0], [7, 3], 'libre')).toEqual([7, 3]);
  });
});

describe('codo al llegar a un equipo', () => {
  it('si ya está en línea va directo', () => {
    expect(conCodo([0, 0], [100, 0.5], 'recto', null, 1)).toEqual([[100, 0.5]]);
  });
  it('mete un codo, primero por el eje más largo', () => {
    expect(conCodo([0, 0], [100, 40], 'recto', null, 1)).toEqual([[100, 0], [100, 40]]);
    expect(conCodo([0, 0], [30, 80], 'recto', null, 1)).toEqual([[0, 80], [30, 80]]);
  });
  it('sigue la dirección del tramo anterior para no hacer un quiebre de más', () => {
    expect(conCodo([0, 0], [100, 40], 'recto', [0, 50], 1)).toEqual([[0, 40], [100, 40]]);
  });
  it('a 45° va en diagonal y luego derecho', () => {
    expect(conCodo([0, 0], [100, 40], '45', null, 1)).toEqual([[40, 40], [100, 40]]);
  });
});

describe('rastreo', () => {
  it('se alinea con el equipo más cercano en cada eje', () => {
    const { punto, guias } = alinear([52, 18], [[50, 300], [400, 20]], 5, { x: true, y: true });
    expect(punto).toEqual([50, 20]);
    expect(guias).toEqual({ x: 50, y: 20 });
  });
  it('solo mueve los ejes permitidos', () => {
    expect(alinear([52, 18], [[50, 20]], 5, { x: true, y: false }).punto).toEqual([50, 18]);
  });
});

describe('siguiente punto de la tubería', () => {
  const base = { modo: 'recto' as const, puntoFijo: null, referencias: [[200, 300]] as [number, number][], tolerancia: 6 };
  it('el tramo sale horizontal y se alinea con la x de un equipo', () => {
    expect(siguientesPuntos([[0, 0]], [203, 20], base).puntos).toEqual([[200, 0]]);
  });
  it('pegado a un equipo fuera de línea agrega el codo', () => {
    expect(siguientesPuntos([[0, 0]], [0, 0], { ...base, puntoFijo: [200, 300] }).puntos).toEqual([[0, 300], [200, 300]]);
  });
});

describe('enderezar una tubería ya trazada', () => {
  it('cambia los tramos chuecos por codos', () => {
    expect(enderezar([[0, 0], [100, 40], [100, 90]], 'recto', 1)).toEqual([[0, 0], [100, 0], [100, 40], [100, 90]]);
  });
});
