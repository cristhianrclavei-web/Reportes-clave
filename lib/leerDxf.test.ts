import { describe, expect, it } from 'vitest';
import { cajaDe, capaQueEstorba, leerDxf, primitivasDe, textoLimpio, unidadProbable, visible } from './leerDxf';

// Arma un DXF mínimo con las entidades dadas (pares código/valor).
function dxf(entidades: (string | number)[][], bloques: (string | number)[][] = []): string {
  const pares = (lista: (string | number)[][]) => lista.flat().map(String);
  return [
    '0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1032', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER',
    '0', 'LAYER', '2', 'Muros', '70', '0', '62', '7',
    '0', 'LAYER', '2', 'Apagada', '70', '0', '62', '-7',
    '0', 'ENDTAB', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'BLOCKS', ...pares(bloques), '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES', ...pares(entidades), '0', 'ENDSEC', '0', 'EOF',
  ].join('\r\n');
}

const linea = (x1: number, y1: number, x2: number, y2: number, capa = 'Muros') => [0, 'LINE', 8, capa, 10, x1, 20, y1, 11, x2, 21, y2];

describe('leer un DXF', () => {
  it('lee capas (las apagadas marcadas) y líneas en coordenadas del dibujo', () => {
    const leido = leerDxf(dxf([linea(0, 0, 10, 0)]));
    expect(leido.version).toBe('AC1032');
    expect(leido.capas.get('Apagada')?.apagada).toBe(true);
    const [p] = primitivasDe(leido);
    expect(p.tipo === 'trazo' && p.puntos).toEqual([[0, 0], [10, 0]]);
  });

  it('abre un bloque girado, escalado y anidado', () => {
    const bloques = [
      [0, 'BLOCK', 8, '0', 2, 'HIJO', 70, 0, 10, 0, 20, 0], linea(0, 0, 1, 0, '0'), [0, 'ENDBLK'],
      [0, 'BLOCK', 8, '0', 2, 'PADRE', 70, 0, 10, 0, 20, 0], [0, 'INSERT', 8, '0', 2, 'HIJO', 10, 0, 20, 0, 41, 2, 42, 2], [0, 'ENDBLK'],
    ];
    const leido = leerDxf(dxf([[0, 'INSERT', 8, 'Muros', 2, 'PADRE', 10, 100, 20, 50, 50, 90]], bloques));
    const [p] = primitivasDe(leido);
    // La línea de 1 escalada a 2 y girada 90°: de (100,50) a (100,52), en la capa del bloque.
    expect(p.tipo === 'trazo' && p.puntos.map(([x, y]) => [Math.round(x), Math.round(y)])).toEqual([[100, 50], [100, 52]]);
    expect(p.capas).toEqual(['Muros', 'Muros', 'Muros']);
  });

  it('respeta el espejo (extrusión hacia abajo)', () => {
    const leido = leerDxf(dxf([[0, 'CIRCLE', 8, 'Muros', 10, 5, 20, 0, 40, 1, 210, 0, 220, 0, 230, -1]]));
    const [p] = primitivasDe(leido);
    const xs = p.tipo === 'trazo' ? p.puntos.map(([x]) => x) : [];
    expect(Math.min(...xs)).toBeCloseTo(-6);
    expect(Math.max(...xs)).toBeCloseTo(-4);
  });

  it('dibuja la curva de una polilínea con bulge', () => {
    // Media vuelta de (0,0) a (2,0): pasa por (1,-1) o (1,1).
    const leido = leerDxf(dxf([[0, 'LWPOLYLINE', 8, 'Muros', 90, 2, 70, 0, 10, 0, 20, 0, 42, 1, 10, 2, 20, 0]]));
    const [p] = primitivasDe(leido);
    const ys = p.tipo === 'trazo' ? p.puntos.map(([, y]) => Math.abs(y)) : [];
    expect(Math.max(...ys)).toBeCloseTo(1, 1);
  });

  it('apagar una capa la quita del dibujo y de la medida', () => {
    const prims = primitivasDe(leerDxf(dxf([linea(0, 0, 10, 0), linea(500, 500, 600, 600, 'Apagada')])));
    const ocultas = new Set(['Apagada']);
    expect(prims.filter((p) => visible(p, ocultas))).toHaveLength(1);
    expect(cajaDe(prims, ocultas)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 0 });
  });
});

describe('textos, unidades y capas', () => {
  it('limpia el formato de MTEXT', () => {
    expect(textoLimpio('\\pxql;{\\fArial|b1;PLANTA}\\PNIVEL -2')).toBe('PLANTA\nNIVEL -2');
    expect(textoLimpio('12 M\\S2^;')).toBe('12 M2');
    expect(textoLimpio('%%c 3/4')).toBe('Ø 3/4');
  });

  it('propone unidades que cuadren con un edificio aunque el archivo diga otra cosa', () => {
    expect(unidadProbable(4, 315)).toBe(1); // dice mm pero mide 315: son metros
    expect(unidadProbable(4, 85000)).toBe(0.001); // 85 m en milímetros
    expect(unidadProbable(6, 120)).toBe(1);
  });

  it('reconoce capas que estorban para sembrar', () => {
    expect(capaQueEstorba('0 Cotas')).toBe(true);
    expect(capaQueEstorba('0 Mobiliario')).toBe(true);
    expect(capaQueEstorba('0 Muro carga')).toBe(false);
  });
});
