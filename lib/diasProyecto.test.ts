import { describe, it, expect } from 'vitest';
import { armarDiasDelProyecto, errorEnDias } from './diasProyecto';

const general = { llegada: '09:00', salida: '17:00', duracionMin: 480 };

describe('armarDiasDelProyecto', () => {
  it('sin ajustes, todos los días siguen el horario general', () => {
    const dias = armarDiasDelProyecto(['2026-10-11', '2026-10-12'], general, {});
    expect(dias).toEqual([
      { fecha: '2026-10-11', llegada: '09:00', salida: '17:00', duracionMin: 480, personalizado: false },
      { fecha: '2026-10-12', llegada: '09:00', salida: '17:00', duracionMin: 480, personalizado: false },
    ]);
  });

  it('un día con su propio horario recalcula su duración y no toca a los demás', () => {
    const dias = armarDiasDelProyecto(['2026-10-11', '2026-10-12'], general, { 0: { llegada: '11:00', salida: '15:00' } });
    expect(dias[0]).toMatchObject({ llegada: '11:00', salida: '15:00', duracionMin: 240, personalizado: true });
    expect(dias[1]).toMatchObject({ llegada: '09:00', salida: '17:00', duracionMin: 480, personalizado: false });
  });

  it('se puede mover solo la fecha de un día', () => {
    const dias = armarDiasDelProyecto(['2026-10-11', '2026-10-12'], general, { 1: { fecha: '2026-10-15' } });
    expect(dias[1]).toMatchObject({ fecha: '2026-10-15', llegada: '09:00', duracionMin: 480, personalizado: true });
  });
});

describe('errorEnDias', () => {
  it('avisa de fechas repetidas', () => {
    const dias = armarDiasDelProyecto(['2026-10-11', '2026-10-12'], general, { 1: { fecha: '2026-10-11' } });
    expect(errorEnDias(dias)).toMatch(/repetidas/);
  });
  it('días distintos no dan error', () => {
    expect(errorEnDias(armarDiasDelProyecto(['2026-10-11', '2026-10-12'], general, {}))).toBeNull();
  });
});
