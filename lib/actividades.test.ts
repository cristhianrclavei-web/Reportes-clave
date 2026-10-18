import { describe, it, expect } from 'vitest';
import { motivoNoPuedeBorrar } from './actividades';

const ahora = new Date('2026-10-18T18:00:00Z').getTime();

describe('motivoNoPuedeBorrar', () => {
  it('una actividad reciente sin reporte se puede borrar', () => {
    expect(motivoNoPuedeBorrar({ report_id: null, hora_inicio: '2026-10-17T15:00:00Z' }, ahora)).toBeNull();
  });
  it('con reporte ligado no', () => {
    expect(motivoNoPuedeBorrar({ report_id: 'r1', hora_inicio: '2026-10-17T15:00:00Z' }, ahora)).toMatch(/reporte ligado/);
  });
  it('de hace más de 7 días no', () => {
    expect(motivoNoPuedeBorrar({ report_id: null, hora_inicio: '2026-10-10T15:00:00Z' }, ahora)).toMatch(/7 días/);
  });
});
