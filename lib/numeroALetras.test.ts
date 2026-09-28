import { describe, expect, it } from 'vitest';
import { enteroALetras, importeConLetra } from './numeroALetras';

describe('importeConLetra', () => {
  it('igual que el CFDI de referencia', () => {
    expect(importeConLetra(1853.68)).toBe('UN MIL OCHOCIENTOS CINCUENTA Y TRES PESOS MEXICANOS 68/100 MXN');
  });
  it('casos especiales', () => {
    expect(enteroALetras(100)).toBe('CIEN');
    expect(enteroALetras(101)).toBe('CIENTO UN');
    expect(enteroALetras(21)).toBe('VEINTIUN');
    expect(enteroALetras(1000)).toBe('UN MIL');
    expect(enteroALetras(21000)).toBe('VEINTIUN MIL');
    expect(enteroALetras(1_000_000)).toBe('UN MILLON');
    expect(enteroALetras(2_500_300)).toBe('DOS MILLONES QUINIENTOS MIL TRESCIENTOS');
    expect(importeConLetra(0)).toBe('CERO PESOS MEXICANOS 00/100 MXN');
    expect(importeConLetra(1_000_000)).toBe('UN MILLON DE PESOS MEXICANOS 00/100 MXN');
    expect(importeConLetra(250.5, 'USD')).toBe('DOSCIENTOS CINCUENTA DOLARES AMERICANOS 50/100 USD');
  });
});
