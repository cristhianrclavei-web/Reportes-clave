import { describe, expect, it } from 'vitest';
import { rutaInterna } from './pushServidor';

describe('rutaInterna', () => {
  it('deja pasar las pantallas de la app', () => {
    expect(rutaInterna('/dashboard/reportes')).toBe('/dashboard/reportes');
    expect(rutaInterna('/servicios/abc?dia=2')).toBe('/servicios/abc?dia=2');
    expect(rutaInterna('/')).toBe('/');
  });

  it('manda al inicio lo que saldría de la app', () => {
    expect(rutaInterna('https://sitio-falso.com/login')).toBe('/');
    expect(rutaInterna('//sitio-falso.com')).toBe('/');
    expect(rutaInterna('/\\sitio-falso.com')).toBe('/');
    expect(rutaInterna('javascript:alert(1)')).toBe('/');
  });

  it('manda al inicio lo que no es texto', () => {
    expect(rutaInterna(undefined)).toBe('/');
    expect(rutaInterna({ url: '/x' })).toBe('/');
  });
});
