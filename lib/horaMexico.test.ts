import { describe, it, expect } from 'vitest';
import { horaActualMexico, minutosTranscurridos } from './horaMexico';

describe('horaActualMexico', () => {
  it('convierte medianoche UTC al día/hora anterior en México (UTC-6)', () => {
    // 2026-03-10T00:00:00Z -> 2026-03-09 18:00 en America/Mexico_City
    const r = horaActualMexico(new Date('2026-03-10T00:00:00Z'));
    expect(r).toEqual({ fecha: '2026-03-09', horaMin: 18 * 60 });
  });

  it('mediodía UTC es temprano en la mañana en México', () => {
    // 2026-06-15T14:30:00Z -> 2026-06-15 08:30 en México
    const r = horaActualMexico(new Date('2026-06-15T14:30:00Z'));
    expect(r).toEqual({ fecha: '2026-06-15', horaMin: 8 * 60 + 30 });
  });
});

describe('minutosTranscurridos', () => {
  it('da 0 si la hora actual es igual a la programada', () => {
    expect(minutosTranscurridos('09:00', 9 * 60)).toBe(0);
  });

  it('da positivo cuando ya pasó la hora programada', () => {
    expect(minutosTranscurridos('09:00', 9 * 60 + 15)).toBe(15);
  });

  it('da negativo cuando todavía no llega la hora programada', () => {
    expect(minutosTranscurridos('09:00', 8 * 60 + 45)).toBe(-15);
  });

  it('acepta el formato HH:mm:ss que devuelve Postgres', () => {
    expect(minutosTranscurridos('09:00:00', 9 * 60 + 10)).toBe(10);
  });
});
