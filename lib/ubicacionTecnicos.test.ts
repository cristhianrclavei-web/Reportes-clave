import { describe, expect, it } from 'vitest';
import { estadoSenal, marcasPorHora } from './ubicacionTecnicos';

describe('estadoSenal', () => {
  const ahora = Date.UTC(2026, 9, 22, 18, 0);
  const haceMin = (m: number) => new Date(ahora - m * 60000).toISOString();

  it('clasifica según los minutos sin puntos', () => {
    expect(estadoSenal(haceMin(1), ahora)).toBe('en_linea');
    expect(estadoSenal(haceMin(10), ahora)).toBe('reciente');
    expect(estadoSenal(haceMin(40), ahora)).toBe('sin_senal');
  });
});

describe('marcas por hora del recorrido', () => {
  it('toma el primer punto de cada hora', () => {
    const p = (h: number, m: number) => ({ lat: 1, lng: 2, registrado_en: new Date(2026, 9, 22, h, m).toISOString() });
    const marcas = marcasPorHora([p(9, 2), p(9, 30), p(10, 0), p(10, 59), p(12, 5)]);
    expect(marcas.map((x) => new Date(x.registrado_en).getHours() * 100 + new Date(x.registrado_en).getMinutes())).toEqual([902, 1000, 1205]);
    expect(marcasPorHora([])).toEqual([]);
  });
});
