import { describe, it, expect } from 'vitest';
import { serieProductividad, compararPeriodos, mejorDia, promedioPorDiaActivo } from './productividad';

const sv = (o: Record<string, unknown>) => ({
  fecha: '2026-10-09', estado: 'concluido', resultado: null, resultado_motivo: null, llegada_motivo: null, salida_motivo: null,
  hora_programada: null, hora_salida_programada: null, hora_llegada: null, hora_inicio: null, hora_fin: null,
  duracion_estimada_min: null, minutos_pausados: 0, pausado_desde: null, tecnicos: ['Ana'], ...o,
}) as any;

describe('serieProductividad', () => {
  it('arma todos los días, del más viejo a hoy, aunque no tengan actividad', () => {
    const s = serieProductividad([], [], '2026-10-02', 4);
    expect(s.map((d) => d.fecha)).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    expect(s.every((d) => d.servicios === 0 && d.minutos === 0 && d.reportes === 0)).toBe(true);
  });

  it('cuenta solo servicios concluidos; el tiempo es de reloj (no se multiplica por la cuadrilla) y sin pausas', () => {
    const s = serieProductividad([
      sv({ hora_llegada: '2026-10-09T15:00:00Z', hora_fin: '2026-10-09T18:00:00Z', minutos_pausados: 30, tecnicos: ['Ana', 'Beto'] }),
      sv({ estado: 'en_curso', hora_llegada: '2026-10-09T15:00:00Z' }),
      sv({ fecha: '2026-09-01', hora_llegada: '2026-09-01T15:00:00Z', hora_fin: '2026-09-01T16:00:00Z' }),
    ], [], '2026-10-09', 2);
    expect(s[1]).toMatchObject({ servicios: 1, minutos: 150 });
  });

  it('descarta tiempos imposibles pero el servicio sí cuenta', () => {
    const s = serieProductividad([sv({ hora_llegada: '2026-10-08T15:00:00Z', hora_fin: '2026-10-09T15:00:00Z' })], [], '2026-10-09', 1);
    expect(s[0]).toMatchObject({ servicios: 1, minutos: 0 });
  });

  it('lee cada día como a favor, en contra o externo', () => {
    const s = serieProductividad([
      sv({ resultado: 'terminado' }),
      sv({ resultado: 'pendiente', resultado_motivo: null }),
      sv({ resultado: null }),
    ], [], '2026-10-09', 1);
    expect(s[0]).toMatchObject({ servicios: 3, aFavor: 1, enContra: 1, externas: 0 });
  });

  it('sin horas en el servicio, toma el tiempo de la llegada y salida del reporte', () => {
    const rep = (o: Record<string, unknown>, data: Record<string, unknown>) => ({ fecha: '2026-10-09', empresa_cliente: 'Acme', ...o, data });
    const s = serieProductividad([
      // Con horas: su reporte (ligado por los dos lados) no se suma otra vez.
      sv({ id: 'sv1', report_id: 'r1', hora_llegada: '2026-10-09T15:00:00Z', hora_fin: '2026-10-09T16:00:00Z' }),
      // Sin horas: vale lo que diga su reporte.
      sv({ id: 'sv2' }),
    ], [
      rep({ id: 'r1' }, { horaLlegada: '08:00', horaSalida: '12:00' }),
      rep({ id: 'r0' }, { horaLlegada: '08:00', horaSalida: '12:00', servicioProgramadoId: 'sv1' }),
      rep({ id: 'r2' }, { horaLlegada: '09:00', horaSalida: '11:30', servicioProgramadoId: 'sv2' }),
      // Dos reportes sueltos del mismo cliente el mismo día: cuenta el más largo.
      rep({ id: 'r3', empresa_cliente: 'Beta' }, { horaLlegada: '10:00', horaSalida: '11:00' }),
      rep({ id: 'r4', empresa_cliente: 'beta ' }, { horaLlegada: '10:00', horaSalida: '12:00' }),
      // Horas incompletas o al revés: no suman.
      rep({ id: 'r5', empresa_cliente: 'Gama' }, { horaLlegada: '10:00' }),
      rep({ id: 'r6', empresa_cliente: 'Delta' }, { horaLlegada: '18:00', horaSalida: '09:00' }),
    ], '2026-10-09', 1);
    expect(s[0]).toMatchObject({ minutos: 60 + 150 + 120, minutosDeReportes: 270, reportes: 7 });
  });

  it('cuenta los reportes por la fecha del servicio', () => {
    const s = serieProductividad([], [{ fecha: '2026-10-09' }, { fecha: '2026-10-09' }, { fecha: '2026-10-08' }, { fecha: null }], '2026-10-09', 2);
    expect(s.map((d) => d.reportes)).toEqual([1, 2]);
  });
});

describe('compararPeriodos', () => {
  const dia = (servicios: number) => ({ fecha: '', servicios, minutos: 0, minutosDeReportes: 0, reportes: 0, aFavor: 0, enContra: 0, externas: 0 });
  it('compara la segunda mitad contra la primera', () => {
    expect(compararPeriodos([dia(2), dia(2), dia(3), dia(3)], 'servicios')).toEqual({ actual: 6, previo: 4, cambioPct: 50 });
    expect(compararPeriodos([dia(4), dia(4), dia(1), dia(1)], 'servicios').cambioPct).toBe(-75);
  });
  it('sin periodo anterior no hay porcentaje', () => {
    expect(compararPeriodos([dia(0), dia(5)], 'servicios')).toEqual({ actual: 5, previo: 0, cambioPct: null });
  });
});

describe('mejorDia y promedioPorDiaActivo', () => {
  const dia = (fecha: string, servicios: number) => ({ fecha, servicios, minutos: 0, minutosDeReportes: 0, reportes: 0, aFavor: 0, enContra: 0, externas: 0 });
  it('el mejor día es el de más servicios; en empate, el más reciente', () => {
    expect(mejorDia([dia('a', 2), dia('b', 5), dia('c', 5), dia('d', 0)], 'servicios')?.fecha).toBe('c');
    expect(mejorDia([dia('a', 0)], 'servicios')).toBeNull();
  });
  it('el promedio no cuenta los días sin actividad', () => {
    expect(promedioPorDiaActivo([dia('a', 2), dia('b', 0), dia('c', 4)], 'servicios')).toBe(3);
    expect(promedioPorDiaActivo([dia('a', 0)], 'servicios')).toBeNull();
  });
});
