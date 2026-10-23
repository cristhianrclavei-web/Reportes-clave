import { describe, expect, it } from 'vitest';
import { calcularTotales, leyendaIva, modoIvaDe } from './cotizaciones';

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

describe('modoIvaDe y leyendaIva', () => {
  it('tasa 0 es «no lleva IVA» aunque diga incluido', () => {
    expect(modoIvaDe({ iva_pct: 0, iva_incluido: true })).toBe('sin');
    expect(modoIvaDe({ iva_pct: 16, iva_incluido: true })).toBe('incluido');
    expect(modoIvaDe({ iva_pct: 16 })).toBe('sumar');
  });

  it('la leyenda del PDF dice claramente cómo va el IVA', () => {
    expect(leyendaIva('MXN', 'sumar')).toBe('Los precios se expresan en Moneda Nacional, más IVA.');
    expect(leyendaIva('MXN', 'incluido')).toContain('con IVA incluido');
    expect(leyendaIva('USD', 'sin')).toBe('Los precios se expresan en Dólares Americanos (USD). Esta cotización no lleva IVA.');
    expect(leyendaIva('MXN', 'incluido', true)).toContain('importe total neto es la cantidad final a pagar');
    // «Total neto» sin IVA incluido no aplica: queda la leyenda normal.
    expect(leyendaIva('MXN', 'sumar', true)).toBe('Los precios se expresan en Moneda Nacional, más IVA.');
  });
});
