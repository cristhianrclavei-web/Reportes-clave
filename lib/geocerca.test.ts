import { describe, it, expect } from 'vitest';
import { distanciaMetros, extraerCoordenadas } from './geocerca';

describe('distanciaMetros', () => {
  it('da 0 para el mismo punto', () => {
    expect(distanciaMetros({ lat: 19.43, lng: -99.13 }, { lat: 19.43, lng: -99.13 })).toBe(0);
  });

  it('un grado de latitud son ~111.32 km, sin importar la longitud', () => {
    const d = distanciaMetros({ lat: 19.0, lng: -99.0 }, { lat: 20.0, lng: -99.0 });
    expect(d).toBeGreaterThan(111000);
    expect(d).toBeLessThan(111700);
  });

  it('es simétrica', () => {
    const a = { lat: 20.6, lng: -103.3 };
    const b = { lat: 20.7, lng: -103.4 };
    expect(distanciaMetros(a, b)).toBeCloseTo(distanciaMetros(b, a), 6);
  });
});

describe('extraerCoordenadas', () => {
  it('lee coordenadas escritas directamente', () => {
    expect(extraerCoordenadas('19.4326, -99.1332')).toEqual({ lat: 19.4326, lng: -99.1332 });
  });

  it('lee un link con formato @lat,lng,zoom', () => {
    const link = 'https://www.google.com/maps/@19.4326,-99.1332,15z';
    expect(extraerCoordenadas(link)).toEqual({ lat: 19.4326, lng: -99.1332 });
  });

  it('lee un link con formato ?q=lat,lng', () => {
    expect(extraerCoordenadas('https://maps.google.com/?q=19.4326,-99.1332')).toEqual({ lat: 19.4326, lng: -99.1332 });
  });

  it('devuelve null si no hay nada parecido a coordenadas', () => {
    expect(extraerCoordenadas('https://maps.google.com/place/Oficina+Central')).toBeNull();
  });

  it('rechaza valores fuera de rango de lat/lng', () => {
    expect(extraerCoordenadas('200.0, 300.0')).toBeNull();
  });
});
