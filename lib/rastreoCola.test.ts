import { describe, expect, it } from 'vitest';
import { MAXIMO_EN_COLA, agregarACola, leerCola, quitarEnviados, tocaGuardar, PuntoUbicacion } from './rastreoCola';

const punto = (i: number): PuntoUbicacion => ({
  registrado_en: new Date(Date.UTC(2026, 9, 22, 15, i)).toISOString(), lat: 25.6, lng: -100.3, precision_m: 10, velocidad_ms: null,
});

describe('cola de ubicaciones', () => {
  it('guarda un punto por minuto', () => {
    expect(tocaGuardar(null, 1000)).toBe(true);
    expect(tocaGuardar(0, 30_000)).toBe(false);
    expect(tocaGuardar(0, 56_000)).toBe(true);
  });

  it('descarta los más viejos al pasar del máximo', () => {
    let cola: PuntoUbicacion[] = [];
    for (let i = 0; i < MAXIMO_EN_COLA + 3; i++) cola = agregarACola(cola, punto(i % 60));
    expect(cola.length).toBe(MAXIMO_EN_COLA);
  });

  it('quita los enviados y lee una cola dañada como vacía', () => {
    expect(quitarEnviados([punto(1), punto(2), punto(3)], 2)).toEqual([punto(3)]);
    expect(leerCola('no es json')).toEqual([]);
    expect(leerCola(JSON.stringify([punto(1), { lat: 'x' }]))).toEqual([punto(1)]);
  });
});
