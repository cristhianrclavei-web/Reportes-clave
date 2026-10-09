import { describe, it, expect } from 'vitest';
import { semanasDelMes, moverMes, resumenPorDia, fechaLargaCalendario } from './calendarioMes';

describe('calendario mensual', () => {
  it('octubre 2026 empieza en jueves y ocupa cinco semanas de lunes a domingo', () => {
    const s = semanasDelMes(2026, 9);
    expect(s).toHaveLength(5);
    expect(s[0].map((c) => c.fecha)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(s[0].map((c) => c.delMes)).toEqual([false, false, false, true, true, true, true]);
    expect(s[4][6].fecha).toBe('2026-11-01');
  });

  it('un mes que empieza en lunes no deja semana vacía y uno largo usa seis', () => {
    expect(semanasDelMes(2027, 1)).toHaveLength(4); // febrero 2027: lunes 1 a domingo 28
    expect(semanasDelMes(2026, 7)).toHaveLength(6); // agosto 2026: empieza en sábado
  });

  it('cambia de año al pasar de diciembre o de enero', () => {
    expect(moverMes(2026, 11, 1)).toEqual({ anio: 2027, mes: 0 });
    expect(moverMes(2026, 0, -1)).toEqual({ anio: 2025, mes: 11 });
  });

  it('separa hechos, por venir, vencidos y cancelados de cada día', () => {
    const r = resumenPorDia([
      { id: 'a', fecha: '2026-10-08', estado: 'concluido' },
      { id: 'b', fecha: '2026-10-08', estado: 'programado' },
      { id: 'c', fecha: '2026-10-09', estado: 'en_curso' },
      { id: 'd', fecha: '2026-10-12', estado: 'programado' },
      { id: 'e', fecha: '2026-10-12', estado: 'cancelado' },
    ], '2026-10-09');
    expect(r['2026-10-08']).toEqual({ hechos: 1, porVenir: 0, vencidos: 1, cancelados: 0 });
    expect(r['2026-10-09']).toEqual({ hechos: 0, porVenir: 1, vencidos: 0, cancelados: 0 });
    expect(r['2026-10-12']).toEqual({ hechos: 0, porVenir: 1, vencidos: 0, cancelados: 1 });
  });

  it('escribe la fecha larga sin correrse de día', () => {
    expect(fechaLargaCalendario('2026-10-09')).toBe('viernes, 9 de octubre');
  });
});
