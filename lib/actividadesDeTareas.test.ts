import { describe, it, expect } from 'vitest';
import { actividadesDesdeTareas } from './actividadesDeTareas';

const tarea = (id: string, extra: Partial<Parameters<typeof actividadesDesdeTareas>[0][number]> = {}) => ({
  id, descripcion: `Tarea ${id}`, completada: false, avance_pct: 0, completada_en: null, ...extra,
});

describe('actividadesDesdeTareas', () => {
  it('la tarea completada ese día entra con su nombre', () => {
    const lista = [tarea('a', { completada: true, avance_pct: 100, completada_en: '2026-10-11T18:00:00Z' })];
    expect(actividadesDesdeTareas(lista, new Set(), '2026-10-11')).toEqual(['Tarea a']);
  });
  it('la que tuvo avance ese día entra con su porcentaje', () => {
    const lista = [tarea('b', { avance_pct: 50 })];
    expect(actividadesDesdeTareas(lista, new Set(['b']), '2026-10-11')).toEqual(['Tarea b (avance 50%)']);
  });
  it('las que no se tocaron ese día no entran', () => {
    const lista = [
      tarea('c'),
      tarea('d', { avance_pct: 25 }), // avance de otro día
      tarea('e', { completada: true, avance_pct: 100, completada_en: '2026-10-09T18:00:00Z' }),
    ];
    expect(actividadesDesdeTareas(lista, new Set(), '2026-10-11')).toEqual([]);
  });
});
