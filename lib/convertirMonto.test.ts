import { describe, it, expect } from 'vitest';
import { convertirMonto } from './cotizaciones';

describe('convertirMonto', () => {
  it('USD a MXN multiplica por el tipo de cambio', () => {
    expect(convertirMonto(1000, 'USD', 'MXN', 18.5)).toBe(18500);
  });
  it('MXN a USD divide y redondea a centavos', () => {
    expect(convertirMonto(1000, 'MXN', 'USD', 18.5)).toBe(54.05);
  });
  it('sin tipo de cambio o misma moneda no cambia', () => {
    expect(convertirMonto(1000, 'USD', 'MXN', 0)).toBe(1000);
    expect(convertirMonto(1000, 'MXN', 'MXN', 18.5)).toBe(1000);
  });
});
