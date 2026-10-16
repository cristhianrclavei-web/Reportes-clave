import { describe, expect, it } from 'vitest';
import { calcularTotales } from './cotizaciones';

const lineas = [
  { cantidad: 2, precio_unitario: 580 },
  { cantidad: 1, precio_unitario: 1160 },
] as any;

describe('calcularTotales', () => {
  it('suma el IVA encima de los conceptos', () => {
    expect(calcularTotales(lineas, 16)).toEqual({ subtotal: 2320, iva: 371.2, total: 2691.2 });
  });

  it('con IVA incluido el total es la suma de los conceptos', () => {
    expect(calcularTotales(lineas, 16, true)).toEqual({ subtotal: 2000, iva: 320, total: 2320 });
  });

  it('subtotal + IVA siempre da el total exacto aunque haya centavos', () => {
    const t = calcularTotales([{ cantidad: 1, precio_unitario: 494.5 }] as any, 16, true);
    expect(t.total).toBe(494.5);
    expect(Math.round((t.subtotal + t.iva) * 100) / 100).toBe(494.5);
  });
});
