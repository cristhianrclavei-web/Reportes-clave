import { describe, expect, it } from 'vitest';
import {
  detectarParadas, diasDeTecnico, errorDeRango, lugarEn, textoDuracion, visitasACliente,
  type LugarConocido, type PuntoCompacto, type Registro,
} from './visitas';

// 2026-11-10 10:00 hora de México (16:00 UTC).
const BASE = Date.UTC(2026, 10, 10, 16, 0, 0) / 1000;
// Un punto por minuto en el mismo lugar durante `minutos`, empezando en `inicioMin`.
function quieto(inicioMin: number, minutos: number, lat: number, lng: number): PuntoCompacto[] {
  return Array.from({ length: minutos + 1 }, (_, i) => [BASE + (inicioMin + i) * 60, lat, lng] as PuntoCompacto);
}
const hotel: LugarConocido = { clienteId: 'hotel', cliente: 'Hotel', lat: 20.7, lng: -103.4, radio: 200 };

describe('buscador de visitas', () => {
  it('detecta paradas de 15 minutos o más y no cuenta el paso rápido', () => {
    const puntos = [
      ...quieto(0, 40, 20.7, -103.4), // 40 min en el hotel
      ...quieto(50, 5, 20.75, -103.45), // 5 min en un semáforo
      ...quieto(70, 30, 20.8, -103.5), // 30 min en otro lugar
    ];
    const paradas = detectarParadas(puntos);
    expect(paradas.map((p) => p.minutos)).toEqual([40, 30]);
    expect(paradas[0].fecha).toBe('2026-11-10');
  });

  it('corta la parada si el teléfono estuvo apagado más de 45 minutos', () => {
    const puntos = [...quieto(0, 20, 20.7, -103.4), ...quieto(120, 20, 20.7, -103.4)];
    expect(detectarParadas(puntos)).toHaveLength(2);
  });

  it('reconoce al cliente dentro de su radio', () => {
    expect(lugarEn(20.7005, -103.4, [hotel])?.cliente).toBe('Hotel'); // ~55 m
    expect(lugarEn(20.71, -103.4, [hotel])).toBeNull(); // ~1.1 km
  });

  it('por técnico: marca la parada en un cliente sin registro y el lugar sin identificar', () => {
    const puntos = [...quieto(0, 40, 20.7, -103.4), ...quieto(70, 30, 20.8, -103.5)];
    const [sinNada] = diasDeTecnico(puntos, [], [hotel]);
    expect(sinNada).toMatchObject({ sinRegistro: 1, sinIdentificar: 1 });
    const reporte: Registro = { tipo: 'reporte', id: 'r1', fecha: '2026-11-10', tecnicoId: 't', clienteId: 'hotel', cliente: 'Hotel' };
    const [conReporte] = diasDeTecnico(puntos, [reporte], [hotel]);
    expect(conReporte).toMatchObject({ sinRegistro: 0, sinIdentificar: 1 });
    expect(conReporte.paradas[0].conRegistro).toBe(true);
  });

  it('por cliente: avisa de la visita sin registro y del registro sin rastreo', () => {
    const reporte: Registro = { tipo: 'reporte', id: 'r1', fecha: '2026-11-10', tecnicoId: 'ana', clienteId: 'hotel', cliente: 'Hotel' };
    const gps = [
      { tecnicoId: 'luis', fecha: '2026-11-11', llegada: '', salida: '', minutos: 95 },
      { tecnicoId: 'luis', fecha: '2026-11-12', llegada: '', salida: '', minutos: 4 }, // pasó por enfrente
    ];
    const filas = visitasACliente([reporte], gps, true);
    expect(filas.map((f) => [f.fecha, f.tecnicoId, f.aviso])).toEqual([
      ['2026-11-11', 'luis', 'sin_registro'],
      ['2026-11-10', 'ana', 'sin_rastreo'],
    ]);
    // Un servicio de hoy o de antes de que hubiera rastreo no es «sin rastreo».
    expect(visitasACliente([reporte], [], true, { desde: '2026-11-11', hoy: '2026-11-20' })[0].aviso).toBeNull();
    expect(visitasACliente([reporte], [], true, { desde: null, hoy: '2026-11-10' })[0].aviso).toBeNull();
    // Sin ubicación del cliente no se puede decir que faltó el rastreo.
    expect(visitasACliente([reporte], [], false)[0].aviso).toBeNull();
  });

  it('valida el rango y escribe la duración', () => {
    expect(errorDeRango('2026-11-10', '2026-11-01', 31)).toMatch(/antes/);
    expect(errorDeRango('2026-09-01', '2026-11-10', 31)).toMatch(/31 días/);
    expect(errorDeRango('2026-11-01', '2026-11-10', 31)).toBeNull();
    expect(textoDuracion(45)).toBe('45 min');
    expect(textoDuracion(125)).toBe('2 h 5 min');
  });
});
