import { describe, it, expect } from 'vitest';
import {
  enlaceReporteDeVisita, errorDeJustificacion, horaReloj, horarioSugerido, mensajeVisitasPendientes,
  textoHorario, visitasPendientes, visitasPorTecnico,
} from './visitasExigibles';

// 9:23 y 13:03 en México (UTC-6).
const LLEGADA = '2026-11-04T15:23:00Z';
const SALIDA = '2026-11-04T19:03:00Z';

describe('horas', () => {
  it('da la hora de México en formato de reloj', () => {
    expect(horaReloj(LLEGADA)).toBe('09:23');
    expect(textoHorario({ llegada: LLEGADA, salida: SALIDA, minutos: 220 })).toBe('09:23 – 13:03 · 3 h 40 min');
  });

  it('sugiere la salida solo si el técnico ya se fue', () => {
    const cincoMinDespues = Date.parse(SALIDA) + 5 * 60000;
    const unaHoraDespues = Date.parse(SALIDA) + 60 * 60000;
    expect(horarioSugerido({ llegada: LLEGADA, salida: SALIDA }, cincoMinDespues)).toEqual({ llegada: '09:23', salida: '' });
    expect(horarioSugerido({ llegada: LLEGADA, salida: SALIDA }, unaHoraDespues)).toEqual({ llegada: '09:23', salida: '13:03' });
  });
});

describe('visitasPendientes', () => {
  const visitas = [
    { id: 'ayer', estado: 'sin_reporte', fecha: '2026-11-03' },
    { id: 'hoy', estado: 'sin_reporte', fecha: '2026-11-04' },
    { id: 'cubierta', estado: 'cubierta', fecha: '2026-11-03' },
    { id: 'por_autorizar', estado: 'por_autorizar', fecha: '2026-11-03' },
  ];

  it('antes de las 18:00 no cobra las de hoy', () => {
    expect(visitasPendientes(visitas, '2026-11-04', 12 * 60).map((v) => v.id)).toEqual(['ayer']);
  });

  it('desde las 18:00 también cobra las de hoy', () => {
    expect(visitasPendientes(visitas, '2026-11-04', 18 * 60).map((v) => v.id)).toEqual(['ayer', 'hoy']);
  });
});

describe('errorDeJustificacion', () => {
  it('pide motivo y explicación', () => {
    expect(errorDeJustificacion('', 'algo')).toBe('Elige el motivo.');
    expect(errorDeJustificacion('otro', '  ')).toContain('Explica');
    expect(errorDeJustificacion('otro', 'x'.repeat(501))).toContain('muy larga');
    expect(errorDeJustificacion('cliente_cercano', 'Estaba con Farmacia X')).toBeNull();
    expect(errorDeJustificacion('compra_material', 'Recogí tubería con el proveedor')).toBeNull();
  });
});

describe('avisos', () => {
  it('nombra al cliente cuando es una sola visita', () => {
    const m = mensajeVisitasPendientes('manana', [{ fecha: '2026-11-04', cliente: 'HCL Minerva' }]);
    expect(m.titulo).toBe('Falta el reporte de HCL Minerva');
    expect(m.cuerpo).toContain('04/11/2026');
    expect(mensajeVisitasPendientes('tarde', [{ fecha: '2026-11-04', cliente: 'HCL Minerva' }]).cuerpo).toContain('hoy');
  });

  it('resume cuando son varias', () => {
    const m = mensajeVisitasPendientes('manana', [
      { fecha: '2026-11-03', cliente: 'A' }, { fecha: '2026-11-04', cliente: 'A' }, { fecha: '2026-11-04', cliente: 'B' },
    ]);
    expect(m.titulo).toBe('Faltan reportes de 3 visitas');
    expect(m.cuerpo).toContain('A, B');
  });

  it('agrupa por técnico', () => {
    const mapa = visitasPorTecnico([{ tecnico_id: 't1' }, { tecnico_id: 't2' }, { tecnico_id: 't1' }]);
    expect(mapa.get('t1')).toHaveLength(2);
    expect(mapa.get('t2')).toHaveLength(1);
  });
});

describe('enlaceReporteDeVisita', () => {
  it('lleva fecha, cliente y nombre', () => {
    const enlace = enlaceReporteDeVisita({ fecha: '2026-11-04', cliente_id: 'abc', cliente: 'Plaza & Cía' });
    const parametros = new URLSearchParams(enlace.split('?')[1]);
    expect(enlace.startsWith('/nuevo?')).toBe(true);
    expect(parametros.get('fecha')).toBe('2026-11-04');
    expect(parametros.get('cliente')).toBe('abc');
    expect(parametros.get('nombre')).toBe('Plaza & Cía');
  });
});
