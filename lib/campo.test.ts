import { describe, expect, it } from 'vitest';
import {
  agruparCercanas, alertasDelTecnico, estadoTecnico, kmRecorridos, metrosPorPixel, paraEncuadrar, paradasDelDia, posicionEn, rutaFaltante,
  tiemposDelDia, tramosDeRuta, ultimaVez, type ServicioCampo,
} from './campo';
import type { PuntoRecorrido } from './ubicacionTecnicos';
import type { LugarConocido } from './visitas';

const servicio = (extra: Partial<ServicioCampo>): ServicioCampo => ({
  id: 's', proyecto: 'Plaza', cliente_id: 'c1', estado: 'programado', fecha: '2026-11-13', hora_programada: '09:00',
  hora_llegada: null, hora_inicio: null, hora_fin: null, pausado_desde: null, ubicacion: null, radio_m: 120, report_id: null, tecnicoIds: ['t'], ...extra,
});

// Un punto por minuto desde las 8:00 (hora de México = UTC-6).
function recorrido(tramos: { minutos: number; lat: number; lng: number; moverse?: boolean }[]): PuntoRecorrido[] {
  const puntos: PuntoRecorrido[] = [];
  let t = Date.parse('2026-11-13T14:00:00Z');
  let { lat, lng } = tramos[0];
  for (const tramo of tramos) {
    for (let i = 0; i < tramo.minutos; i++) {
      if (tramo.moverse) { lat += (tramo.lat - lat) / (tramo.minutos - i); lng += (tramo.lng - lng) / (tramo.minutos - i); } else { lat = tramo.lat; lng = tramo.lng; }
      puntos.push({ lat, lng, registrado_en: new Date(t).toISOString() });
      t += 60000;
    }
  }
  return puntos;
}

describe('estado del técnico', () => {
  it('en servicio, pausa, en ruta, terminado y sin salir', () => {
    expect(estadoTecnico([servicio({ estado: 'en_curso' })], true, false)).toBe('en_servicio');
    expect(estadoTecnico([servicio({ estado: 'en_curso', pausado_desde: 'x' })], true, false)).toBe('pausa');
    expect(estadoTecnico([servicio({ estado: 'programado' })], true, false)).toBe('en_ruta');
    expect(estadoTecnico([servicio({ estado: 'concluido' })], true, false)).toBe('terminado');
    expect(estadoTecnico([servicio({})], false, false)).toBe('sin_salir');
  });
});

describe('paradas y tramos', () => {
  const lugares: LugarConocido[] = [
    { clienteId: 'c1', cliente: 'Plaza', lat: 20.70, lng: -103.40, radio: 200 },
    { clienteId: 'propio:1', cliente: 'Oficina', lat: 20.65, lng: -103.35, radio: 150, propio: true },
  ];
  const ruta = recorrido([
    { minutos: 30, lat: 20.65, lng: -103.35 },
    { minutos: 20, lat: 20.70, lng: -103.40, moverse: true },
    { minutos: 40, lat: 20.70, lng: -103.40 },
    { minutos: 15, lat: 20.72, lng: -103.42, moverse: true },
  ]);

  it('numera las paradas con su lugar y si hay reporte', () => {
    const paradas = paradasDelDia(ruta, lugares, [servicio({ report_id: 'r1' })], [], false, Date.parse('2026-11-14T00:00:00Z'));
    expect(paradas.map((p) => [p.numero, p.lugar, p.reporte])).toEqual([[1, 'Oficina', null], [2, 'Plaza', 'entregado']]);
    const sinReporte = paradasDelDia(ruta, lugares, [servicio({})], [], false, 0);
    expect(sinReporte[1].reporte).toBe('sin_reporte');
  });

  it('hoy separa lo recorrido del tramo actual desde la última parada', () => {
    const paradas = paradasDelDia(ruta, lugares, [], [], true, Date.parse(ruta[ruta.length - 1].registrado_en));
    const { hecho, actual } = tramosDeRuta(ruta, paradas, true);
    expect(actual.length).toBeGreaterThan(5);
    expect(hecho.length + actual.length).toBe(ruta.length + 1);
    expect(tramosDeRuta(ruta, paradas, false).actual).toEqual([]);
  });

  it('cuenta kilómetros sin brincos del GPS y separa tiempo en sitio y en ruta', () => {
    const conBrinco = [...ruta.slice(0, 2), { ...ruta[2], lat: 25 }, ...ruta.slice(3)];
    expect(kmRecorridos(conBrinco)).toBeLessThan(kmRecorridos(ruta) + 1);
    const t = tiemposDelDia(ruta, paradasDelDia(ruta, lugares, [], [], false, 0));
    expect(t.enSitio + t.enRuta).toBe(104);
  });
});

describe('alertas', () => {
  it('solo cuando algo está mal', () => {
    expect(alertasDelTecnico([], [servicio({ estado: 'concluido' })], null, true)[0].tipo).toBe('sin_reporte');
    const lejos = alertasDelTecnico([], [servicio({ estado: 'en_curso', ubicacion: { lat: 20.7, lng: -103.4 } })], [20.6, -103.3], true);
    expect(lejos[0].tipo).toBe('fuera_de_ruta');
    expect(alertasDelTecnico([], [servicio({ estado: 'concluido', report_id: 'r' })], null, true)).toEqual([]);
  });
});

describe('mapa', () => {
  it('no encuadra todo el país por un punto lejano', () => {
    expect(paraEncuadrar([[20.67, -103.35], [32.5, -117]])).toEqual([[20.67, -103.35]]);
    expect(paraEncuadrar([[19.4, -99.1]])).toEqual([[19.4, -99.1]]);
  });

  it('agrupa las marcas encimadas y las separa al acercar', () => {
    const marcas = [{ id: 'a', lat: 20.70, lng: -103.40 }, { id: 'b', lat: 20.7003, lng: -103.4003 }, { id: 'c', lat: 20.75, lng: -103.45 }];
    expect(agruparCercanas(marcas, metrosPorPixel(11, 20.7)).map((g) => g.length)).toEqual([2, 1]);
    expect(agruparCercanas(marcas, metrosPorPixel(18, 20.7)).map((g) => g.length)).toEqual([1, 1, 1]);
  });

  it('posición a una hora y lo que falta por recorrer', () => {
    const r = [{ lat: 0, lng: 0, registrado_en: '2026-11-13T14:00:00Z' }, { lat: 2, lng: 2, registrado_en: '2026-11-13T14:10:00Z' }];
    expect(posicionEn(r, Date.parse('2026-11-13T14:05:00Z'))).toEqual([1, 1]);
    expect(rutaFaltante([1, 1], [servicio({ ubicacion: { lat: 3, lng: 3 } }), servicio({ estado: 'concluido', ubicacion: { lat: 9, lng: 9 } })])).toEqual([[1, 1], [3, 3]]);
  });

  it('dice cuándo se vio por última vez', () => {
    const ahora = Date.parse('2026-11-14T15:00:00Z');
    expect(ultimaVez('2026-11-14T14:55:00Z', ahora)).toBe('hace 5 min');
    expect(ultimaVez('2026-11-14T00:29:00Z', ahora)).toMatch(/^ayer 6:29/);
  });
});
