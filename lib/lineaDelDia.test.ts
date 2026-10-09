import { describe, it, expect } from 'vitest';
import { BloqueDia, huecosDelDia, ventanaDelDia, minutosPorClase, duracionTexto } from './lineaDelDia';
import { tipoActividad } from './tiposActividad';

const DIA = Date.UTC(2026, 9, 9); // medianoche del día de prueba
const h = (hora: number, min = 0) => DIA + hora * 3600000 + min * 60000;
const bloque = (clave: string, clase: BloqueDia['clase'], ini: number, fin: number | null, extra: Partial<BloqueDia> = {}): BloqueDia =>
  ({ clave, clase, titulo: clave, inicio: ini, fin, href: '#', ...extra });

describe('línea del día', () => {
  it('marca los huecos de media hora o más entre lo registrado', () => {
    const b = [
      bloque('a', 'traslado', h(8), h(9)),
      bloque('b', 'servicio', h(9, 10), h(12)),   // 10 min: no cuenta
      bloque('c', 'compra', h(13, 30), h(14)),    // 1 h 30 sin registrar
    ];
    expect(huecosDelDia(b, h(18))).toEqual([{ inicio: h(12), fin: h(13, 30), minutos: 90 }]);
  });

  it('un bloque que se encima con otro no inventa huecos', () => {
    const b = [bloque('a', 'servicio', h(8), h(13)), bloque('b', 'compra', h(9), h(10)), bloque('c', 'oficina', h(13, 10), h(15))];
    expect(huecosDelDia(b, h(18))).toEqual([]);
  });

  it('lo que sigue en curso llega hasta ahora', () => {
    const b = [bloque('a', 'oficina', h(8), null), bloque('b', 'traslado', h(11), h(12))];
    expect(huecosDelDia(b, h(10))).toEqual([{ inicio: h(10), fin: h(11), minutos: 60 }]);
    expect(minutosPorClase([b[0]], h(10)).oficina).toBe(120);
  });

  it('la barra va de 7 a 19 y se alarga si hubo algo fuera', () => {
    expect(ventanaDelDia([bloque('a', 'servicio', h(9), h(12))], DIA, h(18))).toEqual({ desde: 7, hasta: 19 });
    expect(ventanaDelDia([bloque('a', 'traslado', h(5, 30), h(6)), bloque('b', 'servicio', h(18), h(21, 20))], DIA, h(22))).toEqual({ desde: 5, hasta: 22 });
  });

  it('no suma lo que se cerró solo sin hora confirmada', () => {
    const b = [bloque('a', 'compra', h(9), h(10)), bloque('b', 'compra', h(11), h(11), { dudoso: true }), bloque('c', 'servicio', h(12), h(14))];
    expect(minutosPorClase(b, h(18))).toEqual({ compra: 60, servicio: 120 });
  });

  it('escribe la duración y trata sin tipo como «otro»', () => {
    expect(duracionTexto(45)).toBe('45 min');
    expect(duracionTexto(120)).toBe('2 h');
    expect(duracionTexto(135)).toBe('2 h 15 min');
    expect(tipoActividad(null).clave).toBe('otro');
    expect(tipoActividad('compra').nombre).toBe('Compra de material');
  });
});

import { tiempoDelEquipo } from './tiempoEquipo';

describe('tiempo del equipo', () => {
  const iso = (hora: number, min = 0) => new Date(h(hora, min)).toISOString();
  const fechaDe = (i: string) => i.slice(0, 10);

  it('suma horas-persona de servicios y horas de bitácora por tipo', () => {
    const r = tiempoDelEquipo(
      [
        { fecha: '2026-10-09', estado: 'concluido', hora_llegada: iso(9), hora_inicio: iso(9, 10), hora_fin: iso(12), minutos_pausados: 30, tecnicos: ['a', 'b'] },
        { fecha: '2026-10-09', estado: 'en_curso', hora_llegada: iso(13), hora_inicio: iso(13), hora_fin: null, tecnicos: ['a'] },
        { fecha: '2026-09-01', estado: 'concluido', hora_llegada: iso(9), hora_inicio: iso(9), hora_fin: iso(10), tecnicos: ['a'] },
      ],
      [
        { hora_inicio: iso(7), hora_fin: iso(8), tipo: 'traslado' },
        { hora_inicio: iso(15), hora_fin: iso(15, 45), tipo: 'compra' },
        { hora_inicio: iso(16), hora_fin: iso(16), tipo: 'compra', cierre_automatico: true },
        { hora_inicio: iso(17), hora_fin: null, tipo: 'oficina' },
        { hora_inicio: iso(18), hora_fin: iso(18, 20), tipo: null },
      ],
      '2026-10-05', '2026-10-11', fechaDe,
    );
    expect(r).toEqual([
      { clase: 'servicio', minutos: 300 }, // (180 − 30) × 2 personas
      { clase: 'traslado', minutos: 60 },
      { clase: 'compra', minutos: 45 },
      { clase: 'otro', minutos: 20 },
    ]);
  });
});
