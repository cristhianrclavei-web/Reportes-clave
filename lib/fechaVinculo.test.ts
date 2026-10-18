import { describe, it, expect } from 'vitest';
import { motivoFechaNoCoincide } from './fechaVinculo';

describe('motivoFechaNoCoincide', () => {
  it('mismo día: se puede vincular', () => {
    expect(motivoFechaNoCoincide('2026-10-15', '2026-10-15')).toBeNull();
  });
  it('días distintos: explica cuáles', () => {
    expect(motivoFechaNoCoincide('2026-10-15', '2026-10-14')).toBe(
      'La fecha del reporte (15/10/2026) no coincide con la del servicio (14/10/2026). Solo se puede vincular un reporte con un servicio del mismo día.',
    );
  });
});
