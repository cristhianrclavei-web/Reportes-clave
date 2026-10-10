import { describe, it, expect } from 'vitest';
import {
  metaLimpia, normalizarEvidencia, evidenciasDe, areasUsadas, fechaHoraFoto, agruparParaPdf,
  proporcionEstandar, altoObjetivo, filasJustificadas, textoEtapa,
} from './evidencias';

describe('metaLimpia', () => {
  it('solo deja lo que trae algo', () => {
    expect(metaLimpia({ etapa: null, area: '   ', interna: false, ts: null })).toEqual({});
    expect(metaLimpia({ etapa: 'antes', area: '  Cuarto   de control ', interna: true, ts: '2026-10-09T15:00:00Z' }))
      .toEqual({ etapa: 'antes', area: 'Cuarto de control', interna: true, ts: '2026-10-09T15:00:00Z' });
  });
  it('descarta una etapa desconocida', () => {
    expect(metaLimpia({ etapa: 'luego' as any })).toEqual({});
    expect(textoEtapa('despues')).toBe('Después');
    expect(textoEtapa(null)).toBe('');
  });
});

describe('normalizarEvidencia', () => {
  it('acepta el formato viejo (solo la ruta) y el nuevo', () => {
    expect(normalizarEvidencia('a/1.jpg')).toEqual({ path: 'a/1.jpg', caption: '' });
    expect(normalizarEvidencia({ path: 'a/2.jpg', caption: 'Panel', interna: true, etapa: 'despues' }))
      .toEqual({ path: 'a/2.jpg', caption: 'Panel', interna: true, etapa: 'despues' });
    expect(normalizarEvidencia({ path: 'a/3.jpg', video: 'a/3.mp4', dur: 24 })).toEqual({ path: 'a/3.jpg', caption: '', video: 'a/3.mp4', dur: 24 });
  });
  it('ignora lo que no es una evidencia', () => {
    expect(evidenciasDe([null, {}, '', { path: 'x' }, 7])).toEqual([{ path: 'x', caption: '' }]);
    expect(evidenciasDe(undefined)).toEqual([]);
  });
});

describe('areasUsadas', () => {
  it('sin repetir, aunque cambien las mayúsculas', () => {
    expect(areasUsadas([{ area: 'Azotea' }, { area: 'azotea ' }, { area: null }, { area: 'Site' }])).toEqual(['Azotea', 'Site']);
  });
});

describe('fechaHoraFoto', () => {
  it('usa la zona de la instalación, no la del servidor', () => {
    expect(fechaHoraFoto('2026-10-10T02:05:00Z', 'America/Mexico_City')).toBe('09/10/2026 20:05');
    expect(fechaHoraFoto('2026-10-09T06:00:00Z', 'America/Mexico_City')).toBe('09/10/2026 00:00');
    expect(fechaHoraFoto(null, 'America/Mexico_City')).toBe('');
    expect(fechaHoraFoto('no es fecha', 'America/Mexico_City')).toBe('');
  });
});

describe('agruparParaPdf', () => {
  const f = (id: string, o: object = {}) => ({ id, ...o }) as { id: string; etapa?: any; area?: string; interna?: boolean };
  it('las internas no entran', () => {
    const g = agruparParaPdf([f('a'), f('b', { interna: true })]);
    expect(g).toEqual([{ area: null, pares: [], sueltas: [f('a')] }]);
  });
  it('empareja antes con después dentro de la misma área', () => {
    const fotos = [
      f('a1', { etapa: 'antes', area: 'Site' }), f('x', { area: 'Site' }), f('d1', { etapa: 'despues', area: 'site' }),
      f('a2', { etapa: 'antes', area: 'Site' }), f('du', { etapa: 'durante', area: 'Site' }),
      f('d0', { etapa: 'despues', area: 'Azotea' }),
    ];
    const g = agruparParaPdf(fotos);
    expect(g.map((x) => x.area)).toEqual(['Site', 'Azotea']);
    expect(g[0].pares.map((p) => p.map((q) => q.id))).toEqual([['a1', 'd1']]);
    expect(g[0].sueltas.map((q) => q.id)).toEqual(['a2', 'du', 'x']);
    expect(g[1].pares).toEqual([]);
    expect(g[1].sueltas.map((q) => q.id)).toEqual(['d0']);
  });
  it('las que no tienen área van primero', () => {
    const g = agruparParaPdf([f('a', { area: 'Site' }), f('b')]);
    expect(g.map((x) => x.area)).toEqual([null, 'Site']);
  });
});

describe('proporciones y filas', () => {
  it('ajusta a la proporción estándar más cercana', () => {
    expect(proporcionEstandar(4000, 3000)).toBeCloseTo(4 / 3);
    expect(proporcionEstandar(3000, 4000)).toBeCloseTo(3 / 4);
    expect(proporcionEstandar(1920, 1080)).toBeCloseTo(16 / 9);
    expect(proporcionEstandar(1080, 1920)).toBeCloseTo(9 / 16);
    expect(proporcionEstandar(1000, 1040)).toBe(1);
    expect(proporcionEstandar(6000, 1500)).toBeCloseTo(16 / 9);
    expect(proporcionEstandar(0, 0)).toBeCloseTo(4 / 3);
  });
  it('pocas fotos salen más grandes', () => {
    expect(altoObjetivo(1)).toBeGreaterThan(altoObjetivo(3));
    expect(altoObjetivo(3)).toBeGreaterThan(altoObjetivo(12));
  });
  it('cada fila completa llena el ancho exacto', () => {
    const props = [4 / 3, 3 / 4, 3 / 4, 4 / 3, 4 / 3, 3 / 4, 16 / 9];
    const filas = filasJustificadas(props, 544, 10, 170);
    expect(filas.flatMap((x) => x.indices)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const fila of filas.filter((x) => x.completa)) {
      const ancho = fila.indices.reduce((s, i) => s + props[i] * fila.alto, 0) + 10 * (fila.indices.length - 1);
      expect(ancho).toBeCloseTo(544);
    }
  });
  it('una fila final que no alcanza no se estira', () => {
    const filas = filasJustificadas([3 / 4], 544, 10, 170);
    expect(filas).toEqual([{ indices: [0], alto: 170, completa: false }]);
  });
  it('sin fotos no hay filas', () => {
    expect(filasJustificadas([], 544, 10, 170)).toEqual([]);
  });
});

describe('foto huérfana', () => {
  it('se sube a la fila anterior si cabe a buen tamaño', () => {
    const filas = filasJustificadas([4 / 3, 4 / 3, 4 / 3], 544, 10, 170);
    expect(filas).toHaveLength(1);
    expect(filas[0].indices).toEqual([0, 1, 2]);
    expect(filas[0].completa).toBe(true);
  });
  it('se queda sola si la fila anterior quedaría muy chica', () => {
    const filas = filasJustificadas([16 / 9, 16 / 9, 16 / 9, 16 / 9, 16 / 9], 544, 10, 138);
    expect(filas[filas.length - 1].completa).toBe(false);
  });
});
