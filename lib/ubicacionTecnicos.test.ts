import { describe, expect, it } from 'vitest';
import { estadoSenal, marcasDelRecorrido, minutosEnElLugar } from './ubicacionTecnicos';

describe('estadoSenal', () => {
  const ahora = Date.UTC(2026, 9, 22, 18, 0);
  const haceMin = (m: number) => new Date(ahora - m * 60000).toISOString();

  it('clasifica según los minutos sin puntos', () => {
    expect(estadoSenal(haceMin(1), ahora)).toBe('en_linea');
    expect(estadoSenal(haceMin(10), ahora)).toBe('reciente');
    expect(estadoSenal(haceMin(40), ahora)).toBe('sin_senal');
  });
});

describe('marcas del recorrido', () => {
  it('toma el primer punto de cada tramo de 10 minutos', () => {
    const p = (h: number, m: number) => ({ lat: 1, lng: 2, registrado_en: new Date(2026, 9, 22, h, m).toISOString() });
    const marcas = marcasDelRecorrido([p(9, 2), p(9, 8), p(9, 10), p(9, 19), p(9, 31), p(10, 0), p(10, 59), p(12, 5)]);
    expect(marcas.map((x) => new Date(x.registrado_en).getHours() * 100 + new Date(x.registrado_en).getMinutes())).toEqual([902, 910, 931, 1000, 1059, 1205]);
    expect(marcasDelRecorrido([])).toEqual([]);
  });
});

describe('minutos en el lugar', () => {
  // 0.0001° de latitud son unos 11 m; 0.01° son más de 1 km.
  const p = (min: number, lat: number) => ({ lat, lng: -103, registrado_en: new Date(2026, 9, 22, 9, min).toISOString() });

  it('cuenta mientras los puntos siguen cerca y se detiene al alejarse', () => {
    const recorrido = [p(0, 20), p(1, 20.0001), p(5, 20.0002), p(6, 20.01), p(7, 20)];
    expect(minutosEnElLugar(recorrido, 0)).toBe(5);
    expect(minutosEnElLugar(recorrido, 3)).toBe(0);
    expect(minutosEnElLugar([], 0)).toBe(0);
  });
});
