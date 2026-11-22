import { describe, expect, it } from 'vitest';
import { almacenamientoCctv, materialesDelPlano } from './cctv';
import { trazoCampoVision } from './planos';

describe('almacenamiento', () => {
  it('8 cámaras 4 MP H.265 15 fps, 30 días continuo', () => {
    const r = almacenamientoCctv(8, { dias: 30, horas: 24, resolucion: '4MP', codec: 'H.265', fps: 15, movimientoPct: 100 });
    // 8 × 3 Mbps ÷ 8 × 86,400 s × 30 ÷ 1e6 = 7.78 TB
    expect(r.tb).toBeCloseTo(7.776, 2);
    expect(r.discoSugerido).toBe(8);
  });
  it('H.264 y 30 cuadros gastan más', () => {
    const a = almacenamientoCctv(1, { dias: 1, horas: 24, resolucion: '2MP', codec: 'H.264', fps: 30, movimientoPct: 50 });
    expect(a.mbpsPorCamara).toBeCloseTo(4.8);
  });
});

describe('materiales del plano', () => {
  it('agrupa por tipo y modelo, cámaras primero, tubería en metros', () => {
    const lista = materialesDelPlano({
      equipos: [
        { id: '1', tipo: 'NVR', x: 0, y: 0 },
        { id: '2', tipo: 'CAMB', x: 0, y: 0, modelo: 'DS-2CD1027' },
        { id: '3', tipo: 'CAMB', x: 0, y: 0, modelo: 'DS-2CD1027' },
        { id: '4', tipo: 'CAMD', x: 0, y: 0 },
      ],
      tuberias: [{ id: 't', tipo: 'EMT', diametro: '3/4"', puntos: [[0, 0], [100, 0]] }],
    }, 0.1);
    expect(lista[0]).toMatchObject({ descripcion: 'Cámara bala DS-2CD1027', cantidad: 2 });
    expect(lista.find((l) => l.descripcion.startsWith('Grabador'))?.cantidad).toBe(1);
    expect(lista[lista.length - 1]).toMatchObject({ cantidad: 10, unidad: 'Mts' });
  });
});

describe('campo de visión', () => {
  it('sector de 90° mirando a la derecha', () => {
    const d = trazoCampoVision(0, 0, 10, 0, 90);
    expect(d.startsWith('M 0 0 L 7.07')).toBe(true);
  });
});
