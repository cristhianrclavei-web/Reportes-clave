import { describe, expect, it } from 'vitest';
import { compararPropuesta, copiaAlDia, fusionar } from './propuestas';

const eq = (id: string, x: number, extra: Record<string, unknown> = {}) => ({ id, tipo: 'SH', x, y: 10, ...extra });
const doc = (equipos: any[], metros: number | null = 0.02) => ({ equipos, tuberias: [], metros });

describe('propuestas de cambio en planos', () => {
  const base = doc([eq('a', 1), eq('b', 2), eq('c', 3)]);

  it('detecta agregados, quitados y movidos, y fusiona solo lo aceptado', () => {
    const propuesta = doc([eq('a', 50), eq('c', 3), eq('d', 9)]);
    const cambios = compararPropuesta('plano', base, propuesta, base);
    expect(cambios.map((c) => [c.clave, c.tipo, c.conflicto])).toEqual([
      ['equipos:a', 'modificado', false],
      ['equipos:d', 'agregado', false],
      ['equipos:b', 'quitado', false],
    ]);
    expect(cambios[0].texto).toBe('Detector de humo: cambió posición');
    const fusion = fusionar('plano', base, cambios, new Set(['equipos:a', 'equipos:d']));
    expect(fusion.equipos.map((e: any) => [e.id, e.x])).toEqual([['a', 50], ['b', 2], ['c', 3], ['d', 9]]);
  });

  it('lo que cambió alguien más en otro equipo se respeta; si es el mismo, es conflicto', () => {
    const actual = doc([eq('a', 1), eq('b', 2, { rotacion: 90 }), eq('c', 70)]);
    const propuesta = doc([eq('a', 5), eq('b', 2), eq('c', 80)]);
    const cambios = compararPropuesta('plano', base, propuesta, actual);
    expect(cambios.map((c) => [c.clave, c.conflicto])).toEqual([['equipos:a', false], ['equipos:c', true]]);
    // Sin aceptar el conflicto, el original se queda con lo suyo.
    const fusion = fusionar('plano', actual, cambios, new Set(['equipos:a']));
    expect(fusion.equipos.map((e: any) => e.x)).toEqual([5, 2, 70]);
    expect((fusion.equipos[1] as any).rotacion).toBe(90);
  });

  it('la escala es un campo suelto y lo ya aplicado no sale', () => {
    const propuesta = doc([eq('a', 1), eq('b', 2), eq('c', 3)], 0.05);
    expect(compararPropuesta('plano', base, propuesta, base).map((c) => c.clave)).toEqual(['campo:metros']);
    expect(compararPropuesta('plano', base, propuesta, propuesta)).toEqual([]);
  });

  it('el orden de las llaves y los vacíos no cuentan como cambio', () => {
    const desordenado = doc([{ y: 10, x: 1, tipo: 'SH', id: 'a', modelo: null }, eq('b', 2), eq('c', 3)]);
    const propuesta = doc([eq('a', 1), eq('b', 2), eq('c', 9)]);
    const cambios = compararPropuesta('plano', desordenado, propuesta, base);
    expect(cambios.map((c) => [c.clave, c.conflicto])).toEqual([['equipos:c', false]]);
  });

  it('copia al día: los cambios del técnico sobre el original de ahora', () => {
    const actual = doc([eq('a', 1), eq('b', 2), eq('c', 3), eq('z', 7)]);
    const propuesta = doc([eq('a', 40), eq('b', 2), eq('c', 3)]);
    expect(copiaAlDia('plano', base, propuesta, actual).equipos.map((e: any) => [e.id, e.x])).toEqual([['a', 40], ['b', 2], ['c', 3], ['z', 7]]);
  });
});

describe('guías y unifilares', () => {
  it('describe conexiones de guía con sus equipos', () => {
    const base = { equipos: [{ id: 'e1', nombre: 'Lectora', bornes: [] }, { id: 'e2', nombre: 'Fuente', bornes: [] }], conexiones: [], pruebas: [], notas: [], fotos: [] };
    const propuesta = { ...base, conexiones: [{ id: 'k', de: { equipo: 'e1', borne: '1' }, a: { equipo: 'e2', borne: '2' }, color: 'rojo' }] };
    const [c] = compararPropuesta('guia', base, propuesta, base);
    expect(c.texto).toBe('Agregó cable Lectora → Fuente');
  });

  it('un tramo del unifilar con otra longitud', () => {
    const tramo = { id: 't1', titulo: 'Circuito de salida', metros: '20', conductores: [] };
    const base = { equipos: [], tramos: [tramo], proyecto: { nombre: 'X' }, notas: [] };
    const propuesta = { ...base, tramos: [{ ...tramo, metros: '35' }] };
    const [c] = compararPropuesta('unifilar', base, propuesta, base);
    expect(c.texto).toBe('Circuito de salida: cambió longitud');
  });
});
