import { describe, it, expect } from 'vitest';
import { distanciaMetros, extraerCoordenadas, esEnlaceCortoMaps, extraerCoordenadasDeHtml } from './geocerca';

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

describe('esEnlaceCortoMaps', () => {
  it('reconoce maps.app.goo.gl', () => {
    expect(esEnlaceCortoMaps('https://maps.app.goo.gl/TVDa7YC3BTC7cpck6?g_st=ac')).toBe(true);
  });

  it('reconoce goo.gl/maps', () => {
    expect(esEnlaceCortoMaps('https://goo.gl/maps/abc123')).toBe(true);
  });

  it('no confunde un link largo de Maps con uno corto', () => {
    expect(esEnlaceCortoMaps('https://www.google.com/maps/@19.4326,-99.1332,15z')).toBe(false);
  });

  it('devuelve false para texto que no es URL', () => {
    expect(esEnlaceCortoMaps('19.4326, -99.1332')).toBe(false);
  });
});

describe('extraerCoordenadasDeHtml', () => {
  it('saca lat,lng del og:image de vista previa del mapa (coma codificada)', () => {
    const html = `<meta content="https://maps.google.com/maps/api/staticmap?center=20.6434994%2C-103.2814592&amp;zoom=14&amp;size=900x900" property="og:image">`;
    expect(extraerCoordenadasDeHtml(html)).toEqual({ lat: 20.6434994, lng: -103.2814592 });
  });

  it('también acepta la coma sin codificar', () => {
    const html = `<meta content="https://maps.google.com/maps/api/staticmap?center=20.6434994,-103.2814592&zoom=14" property="og:image">`;
    expect(extraerCoordenadasDeHtml(html)).toEqual({ lat: 20.6434994, lng: -103.2814592 });
  });

  it('devuelve null si el HTML no trae el mapa estático', () => {
    expect(extraerCoordenadasDeHtml('<html><body>Sin mapa aquí</body></html>')).toBeNull();
  });
});
