import { describe, it, expect } from 'vitest';
import { normalizarConcepto, unirSugerencias, formaCanonica } from './conceptosMateriales';

describe('conceptos de materiales', () => {
  it('trata como el mismo concepto mayúsculas, acentos y espacios', () => {
    expect(normalizarConcepto('  TAQUETE  de  Plástico ')).toBe('taquete de plastico');
    expect(normalizarConcepto('Abrazadera Omega')).toBe(normalizarConcepto('abrazadera  omegá'));
  });

  it('une las de siempre con las aprendidas sin repetir variantes', () => {
    expect(unirSugerencias(['Taquete', 'Pija'], ['taquete', 'PIJA', 'Ancla química'])).toEqual(['Taquete', 'Pija', 'Ancla química']);
    expect(unirSugerencias(['UTP Cat 6'])).toEqual(['UTP Cat 6']);
  });

  it('usa la forma ya conocida cuando se escribe una variante', () => {
    const lista = ['Unicanal', 'Varilla roscada'];
    expect(formaCanonica('UNICANAL', lista)).toBe('Unicanal');
    expect(formaCanonica('  varilla   ROSCADA ', lista)).toBe('Varilla roscada');
    expect(formaCanonica('Cinta  aislante ', lista)).toBe('Cinta aislante');
  });
});
