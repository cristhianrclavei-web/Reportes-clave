import { describe, it, expect } from 'vitest';
import { hoyLocal, fechaLocal, sumarDias } from './fechaHoy';

describe('hoyLocal', () => {
  it('formatea como YYYY-MM-DD', () => {
    expect(hoyLocal(new Date(2026, 8, 10))).toBe('2026-09-10');
  });

  it('rellena con cero mes y día de un dígito', () => {
    expect(hoyLocal(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  // El motivo de todo el archivo: una hora avanzada de la tarde en México
  // (UTC-6) cae en el día siguiente en UTC. hoyLocal debe leer el reloj
  // local, no un ISO en UTC.
  it('a las 11pm locales sigue siendo el mismo día, no se corre a mañana por UTC', () => {
    const oncePm = new Date(2026, 8, 10, 23, 0, 0);
    expect(hoyLocal(oncePm)).toBe('2026-09-10');
  });

  it('sin argumento usa la fecha actual (formato válido)', () => {
    expect(hoyLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('fechaLocal', () => {
  it('interpreta la fecha como medianoche local, no UTC', () => {
    const d = fechaLocal('2026-09-11');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8); // 0-indexado: septiembre
    expect(d.getDate()).toBe(11);
    expect(d.getHours()).toBe(0);
  });

  it('es la inversa de hoyLocal', () => {
    expect(hoyLocal(fechaLocal('2026-01-05'))).toBe('2026-01-05');
  });
});

describe('sumarDias', () => {
  it('suma días dentro del mismo mes', () => {
    expect(sumarDias('2026-09-10', 3)).toBe('2026-09-13');
  });

  it('cruza el fin de mes', () => {
    expect(sumarDias('2026-09-29', 3)).toBe('2026-10-02');
  });

  it('cruza el fin de año', () => {
    expect(sumarDias('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('acepta días negativos (restar)', () => {
    expect(sumarDias('2026-09-10', -3)).toBe('2026-09-07');
  });

  it('respeta años bisiestos', () => {
    // 2028 es bisiesto: el día siguiente al 28 de febrero es el 29.
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(sumarDias('2027-02-28', 1)).toBe('2027-03-01');
  });
});
