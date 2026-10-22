import { describe, expect, it } from 'vitest';
import { estadoSenal } from './ubicacionTecnicos';

describe('estadoSenal', () => {
  const ahora = Date.UTC(2026, 9, 22, 18, 0);
  const haceMin = (m: number) => new Date(ahora - m * 60000).toISOString();

  it('clasifica según los minutos sin puntos', () => {
    expect(estadoSenal(haceMin(1), ahora)).toBe('en_linea');
    expect(estadoSenal(haceMin(10), ahora)).toBe('reciente');
    expect(estadoSenal(haceMin(40), ahora)).toBe('sin_senal');
  });
});
