import { describe, it, expect } from 'vitest';
import { tocaRecordarTecnico, tocaAvisarSupervisores } from './confirmacionServicio';

const ahora = new Date('2026-09-28T00:30:00Z').getTime(); // 18:30 México del 27
const base = { hoy: '2026-09-27', horaMin: 18 * 60 + 30, ahoraMs: ahora };

describe('tocaRecordarTecnico', () => {
  it('servicio de mañana: sí después de las 18:00 si se asignó hace más de 1 h', () => {
    expect(tocaRecordarTecnico({ ...base, fecha: '2026-09-28', asignadoEn: '2026-09-27T15:00:00Z' })).toBe(true);
  });
  it('no si se asignó hace menos de 1 h', () => {
    expect(tocaRecordarTecnico({ ...base, fecha: '2026-09-28', asignadoEn: '2026-09-28T00:00:00Z' })).toBe(false);
  });
  it('servicio de mañana antes de las 18:00: todavía no', () => {
    expect(tocaRecordarTecnico({ ...base, horaMin: 17 * 60, fecha: '2026-09-28', asignadoEn: '2026-09-27T15:00:00Z' })).toBe(false);
  });
  it('servicio de hoy: sí', () => {
    expect(tocaRecordarTecnico({ ...base, horaMin: 11 * 60, fecha: '2026-09-27', asignadoEn: '2026-09-27T12:00:00Z', ahoraMs: new Date('2026-09-27T17:10:00Z').getTime() })).toBe(true);
  });
  it('servicio en 3 días: espera a la víspera', () => {
    expect(tocaRecordarTecnico({ ...base, fecha: '2026-09-30', asignadoEn: '2026-09-27T15:00:00Z' })).toBe(false);
  });
  it('nunca de noche', () => {
    expect(tocaRecordarTecnico({ ...base, horaMin: 22 * 60, fecha: '2026-09-28', asignadoEn: '2026-09-27T15:00:00Z' })).toBe(false);
  });
});

describe('tocaAvisarSupervisores', () => {
  it('1 h después del recordatorio', () => {
    expect(tocaAvisarSupervisores({ recordatorioEn: '2026-09-27T23:20:00Z', horaMin: base.horaMin, ahoraMs: ahora })).toBe(true);
    expect(tocaAvisarSupervisores({ recordatorioEn: '2026-09-28T00:00:00Z', horaMin: base.horaMin, ahoraMs: ahora })).toBe(false);
  });
  it('sin recordatorio previo, no', () => {
    expect(tocaAvisarSupervisores({ recordatorioEn: null, horaMin: base.horaMin, ahoraMs: ahora })).toBe(false);
  });
});
