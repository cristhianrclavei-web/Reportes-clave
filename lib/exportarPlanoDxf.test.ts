import { describe, expect, it } from 'vitest';
import { capaDeTuberia, colocacionDe, exportarPlanoDxf, nombreBloque, trazoAPolilineas } from './exportarPlanoDxf';
import { leerDxf, primitivasDe } from './leerDxf';
import type { Plano } from './planos';

const plano: Plano = {
  id: 'p', cliente_id: 'c', nombre: 'Nivel -2', pdf_path: 'lazos/planos/p/plano.dxf', imagen_path: '', pagina: 1,
  ancho: 3000, alto: 1100, metros_por_unidad: 0.1, formato: 'dxf',
  // Hoja → dibujo: X = 2100 + x·0.1 ; Y = 970 − y·0.1
  dxf: { x0: 2100, y1: 970, k: 0.1, unidad: 1 },
  sembrado: {
    equipos: [
      { id: 'e1', tipo: 'SH', x: 100, y: 200, elementoId: null, etiqueta: 'L01D001' },
      { id: 'e2', tipo: 'EMA', x: 400, y: 200, rotacion: 90 },
    ],
    tuberias: [{ id: 't1', tipo: 'EMT', diametro: '3/4"', puntos: [[100, 200], [400, 200]] }],
  },
  creado_en: '', actualizado_en: '',
};

function decodificar(bytes: Uint8Array): string {
  return new TextDecoder('windows-1252').decode(bytes);
}

describe('exportar el sembrado a AutoCAD', () => {
  it('un plano DXF vuelve a sus coordenadas reales', () => {
    expect(colocacionDe(plano, 1)).toEqual({ ox: 2100, oy: 970, f: 0.1 });
    const bytes = exportarPlanoDxf({ plano, colocacion: colocacionDe(plano, 1), etiquetaDe: (id) => (id === 'e1' ? 'L01D001' : '') });
    const texto = decodificar(bytes);
    expect(texto.startsWith('0\r\nSECTION')).toBe(true);
    expect(texto.trim().endsWith('EOF')).toBe(true);

    const leido = leerDxf(texto);
    expect([...leido.capas.keys()]).toEqual(expect.arrayContaining(['FA-DETECCION', 'FA-TEXTO', capaDeTuberia('EMT', '3/4"').nombre]));
    expect(leido.bloques.has(nombreBloque('SH'))).toBe(true);

    const inserts = leido.entidades.filter((e) => e.tipo === 'INSERT');
    const sh = inserts.find((e) => e.pares.some(([c, v]) => c === 2 && v === 'FA_SH'))!;
    const valor = (c: number) => Number(sh.pares.find(([k]) => k === c)?.[1]);
    expect(valor(10)).toBeCloseTo(2110);
    expect(valor(20)).toBeCloseTo(950);
    // El giro de la app (90° horario) en AutoCAD es 270°.
    const ema = inserts.find((e) => e.pares.some(([c, v]) => c === 2 && v === 'FA_EMA'))!;
    expect(Number(ema.pares.find(([k]) => k === 50)?.[1])).toBe(270);

    // La tubería de x 100→400 queda de 2110 a 2140 a la altura 950.
    const tubo = primitivasDe(leido).find((p) => p.tipo === 'trazo' && p.capas.includes(capaDeTuberia('EMT', '3/4"').nombre));
    expect(tubo && tubo.tipo === 'trazo' ? tubo.puntos.map(([x, y]) => [Math.round(x), Math.round(y)]) : null).toEqual([[2110, 950], [2140, 950]]);
  });

  it('un plano PDF sale a escala real en las unidades elegidas', () => {
    const pdf = { ...plano, formato: 'pdf' as const, dxf: null, metros_por_unidad: 0.05 };
    // En milímetros: 0.05 m por unidad de hoja = 50 mm.
    expect(colocacionDe(pdf, 0.001)).toEqual({ ox: 0, oy: 1100 * 50, f: 50 });
  });

  it('nombres válidos para AutoCAD', () => {
    expect(capaDeTuberia('Galvanizada', '1 1/4"').nombre).toBe('FA-TUB-GALVANIZADA-1_1-4');
  });

  it('convierte el círculo del símbolo en una polilínea cerrada', () => {
    const [fig] = trazoAPolilineas('M -1 0 A 1 1 0 1 0 1 0 A 1 1 0 1 0 -1 0 Z');
    expect(fig.cerrada).toBe(true);
    for (const [x, y] of fig.puntos) expect(Math.hypot(x, y)).toBeCloseTo(1);
  });
});
