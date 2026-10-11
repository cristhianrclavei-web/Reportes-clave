import { describe, it, expect } from 'vitest';
import { direccionDePhoton, primeroLosDeLaZona, sinRepetidos, zonaDeTrabajo } from './geocoding';

const gdl = { lat: 20.67, lng: -103.35 };

describe('zonaDeTrabajo', () => {
  it('sin sitios registrados no hay zona', () => {
    expect(zonaDeTrabajo([null, undefined])).toBeNull();
  });
  it('un servicio foráneo no mueve el centro', () => {
    const zona = zonaDeTrabajo([{ lat: 20.6, lng: -103.3 }, { lat: 20.7, lng: -103.4 }, { lat: 20.65, lng: -103.35 }, { lat: 25.6, lng: -100.3 }]);
    expect(zona!.lat).toBeGreaterThan(20);
    expect(zona!.lat).toBeLessThan(21);
  });
});

describe('primeroLosDeLaZona', () => {
  it('sube lo cercano y conserva el orden dentro de cada grupo', () => {
    const lista = [
      { direccion: 'Tapachula', lat: 14.9, lng: -92.26 },
      { direccion: 'Zapopan A', lat: 20.68, lng: -103.43 },
      { direccion: 'Tijuana', lat: 32.5, lng: -117.0 },
      { direccion: 'Zapopan B', lat: 20.72, lng: -103.39 },
    ];
    expect(primeroLosDeLaZona(lista, gdl).map((s) => s.direccion)).toEqual(['Zapopan A', 'Zapopan B', 'Tapachula', 'Tijuana']);
  });
  it('sin zona de referencia no cambia nada', () => {
    const lista = [{ direccion: 'X', lat: 1, lng: 1 }];
    expect(primeroLosDeLaZona(lista, null)).toBe(lista);
  });
});

describe('direccionDePhoton y sinRepetidos', () => {
  it('arma la dirección sin repetir partes', () => {
    expect(direccionDePhoton({ name: 'Plaza Galerias', street: 'Avenida Rafael Sanzio', housenumber: '150', city: 'Zapopan', state: 'Jalisco' }))
      .toBe('Plaza Galerias, Avenida Rafael Sanzio 150, Zapopan, Jalisco');
    expect(direccionDePhoton({ name: 'Avenida Vallarta', street: 'Avenida Vallarta', city: 'Guadalajara' })).toBe('Avenida Vallarta, Guadalajara');
  });
  it('quita el mismo lugar repetido', () => {
    const a = { direccion: 'Plaza Galerias, Zapopan', lat: 20.6801, lng: -103.4301 };
    expect(sinRepetidos([a, { ...a, lat: 20.69 }, { ...a, direccion: 'PLAZA GALERIAS, Zapopan' }, { ...a, direccion: 'Otra' }])).toHaveLength(2);
  });
});
