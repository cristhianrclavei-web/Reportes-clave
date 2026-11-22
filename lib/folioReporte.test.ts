import { describe, expect, it } from 'vitest';
import { siguienteConsecutivo } from './folioReporte';

describe('consecutivo del folio', () => {
  it('sigue al número más alto aunque se haya borrado uno', () => {
    // 3 reportes que quedan, pero el más alto es el 016: el siguiente es 17, no 4.
    expect(siguienteConsecutivo(['CIR-A-001', 'CIR-A-016', 'CIR-A-002'])).toBe(17);
  });
  it('los reportes viejos sin ese formato cuentan para no repetir', () => {
    expect(siguienteConsecutivo([null, 'CRM0851', 'JR-A-001'])).toBe(4);
  });
  it('sin reportes empieza en 1', () => {
    expect(siguienteConsecutivo([])).toBe(1);
  });
});
