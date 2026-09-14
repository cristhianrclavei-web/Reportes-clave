import { describe, it, expect } from 'vitest';
import {
  mediana,
  formatMinutos,
  desviacionPorProyecto,
  tiempoDeArranque,
  puntualidad,
  retrabajo,
  MUESTRA_MINIMA,
} from './kpis';
import { Servicio } from './serviciosProgramados';

// Fábrica con valores por defecto: cada prueba solo pisa lo que le importa,
// en vez de repetir los 13 campos de Servicio en cada caso.
let contador = 0;
function servicio(overrides: Partial<Servicio> = {}): Servicio {
  contador++;
  return {
    id: `s${contador}`,
    creado_por: 'tecnico-1',
    proyecto: 'Proyecto A',
    descripcion: null,
    fecha: '2026-09-10',
    hora_programada: null,
    duracion_estimada_min: 60,
    hora_llegada: null,
    hora_inicio: null,
    hora_fin: null,
    estado: 'concluido',
    report_id: null,
    grupo_id: 'g1',
    numero_dia: 1,
    dias_totales: 1,
    created_at: '2026-09-10T12:00:00-06:00',
    ...overrides,
  };
}

describe('mediana', () => {
  it('devuelve 0 con arreglo vacío', () => {
    expect(mediana([])).toBe(0);
  });

  it('con cantidad impar devuelve el valor de en medio', () => {
    expect(mediana([5, 1, 3])).toBe(3);
  });

  it('con cantidad par promedia los dos de en medio', () => {
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('formatMinutos', () => {
  it('menos de una hora solo muestra minutos', () => {
    expect(formatMinutos(45)).toBe('45 min');
  });

  it('horas exactas no muestran minutos', () => {
    expect(formatMinutos(120)).toBe('2 h');
  });

  it('combina horas y minutos', () => {
    expect(formatMinutos(125)).toBe('2 h 5 min');
  });

  it('conserva el signo en negativos', () => {
    expect(formatMinutos(-90)).toBe('-1 h 30 min');
  });
});

describe('desviacionPorProyecto', () => {
  it('ignora servicios que no están concluidos', () => {
    const { resumen } = desviacionPorProyecto([
      servicio({ estado: 'en_curso', hora_inicio: '2026-09-10T09:00:00-06:00', hora_fin: '2026-09-10T10:00:00-06:00' }),
    ]);
    expect(resumen.n).toBe(0);
  });

  it('descarta como captura imposible un servicio de más de 14h o de menos de 5min, y lo cuenta', () => {
    const { resumen } = desviacionPorProyecto([
      // 20 horas: alguien olvidó dar cierre.
      servicio({ hora_inicio: '2026-09-10T08:00:00-06:00', hora_fin: '2026-09-11T04:00:00-06:00' }),
      // 2 minutos: capturado por error.
      servicio({ hora_inicio: '2026-09-10T08:00:00-06:00', hora_fin: '2026-09-10T08:02:00-06:00' }),
    ]);
    expect(resumen.n).toBe(0);
    expect(resumen.descartados).toBe(2);
  });

  it('ignora (sin contar como descartado) un servicio sin duración estimada', () => {
    const { resumen } = desviacionPorProyecto([
      servicio({
        duracion_estimada_min: 0,
        hora_inicio: '2026-09-10T08:00:00-06:00',
        hora_fin: '2026-09-10T09:00:00-06:00',
      }),
    ]);
    expect(resumen.n).toBe(0);
    expect(resumen.descartados).toBe(0);
  });

  it('calcula el signo de la desviación: positivo si se pasó, negativo si cerró antes', () => {
    const { filas } = desviacionPorProyecto([
      servicio({
        proyecto: 'Tarde',
        duracion_estimada_min: 60,
        hora_inicio: '2026-09-10T08:00:00-06:00',
        hora_fin: '2026-09-10T09:30:00-06:00', // 90 min real vs 60 estimado
      }),
      servicio({
        proyecto: 'Antes',
        duracion_estimada_min: 60,
        hora_inicio: '2026-09-10T08:00:00-06:00',
        hora_fin: '2026-09-10T08:30:00-06:00', // 30 min real vs 60 estimado
      }),
    ]);
    const tarde = filas.find((f) => f.proyecto === 'Tarde')!;
    const antes = filas.find((f) => f.proyecto === 'Antes')!;
    expect(tarde.desviacionPct).toBeCloseTo(50);
    expect(antes.desviacionPct).toBeCloseTo(-50);
  });

  it('ordena las filas por desviación absoluta, de mayor a menor', () => {
    const { filas } = desviacionPorProyecto([
      servicio({
        proyecto: 'Poco desvío',
        duracion_estimada_min: 100,
        hora_inicio: '2026-09-10T08:00:00-06:00',
        hora_fin: '2026-09-10T09:50:00-06:00', // -10%
      }),
      servicio({
        proyecto: 'Mucho desvío',
        duracion_estimada_min: 60,
        hora_inicio: '2026-09-10T08:00:00-06:00',
        hora_fin: '2026-09-10T10:00:00-06:00', // +100%
      }),
    ]);
    expect(filas.map((f) => f.proyecto)).toEqual(['Mucho desvío', 'Poco desvío']);
  });

  it('marca el resumen como no confiable por debajo de la muestra mínima', () => {
    const servicios = Array.from({ length: MUESTRA_MINIMA - 1 }, () =>
      servicio({ hora_inicio: '2026-09-10T08:00:00-06:00', hora_fin: '2026-09-10T09:00:00-06:00' })
    );
    const { resumen } = desviacionPorProyecto(servicios);
    expect(resumen.n).toBe(MUESTRA_MINIMA - 1);
    expect(resumen.confiable).toBe(false);
  });
});

describe('tiempoDeArranque', () => {
  it('mide los minutos entre llegada e inicio', () => {
    const r = tiempoDeArranque([
      servicio({ hora_llegada: '2026-09-10T08:00:00-06:00', hora_inicio: '2026-09-10T08:20:00-06:00' }),
    ]);
    expect(r.valor).toBe(20);
    expect(r.n).toBe(1);
    expect(r.descartados).toBe(0);
  });

  it('ignora servicios sin llegada o sin inicio, sin contarlos como descartados', () => {
    const r = tiempoDeArranque([servicio({ hora_llegada: '2026-09-10T08:00:00-06:00', hora_inicio: null })]);
    expect(r.n).toBe(0);
    expect(r.descartados).toBe(0);
  });

  it('descarta un arranque negativo (empezó antes de llegar) y lo cuenta', () => {
    const r = tiempoDeArranque([
      servicio({ hora_llegada: '2026-09-10T08:20:00-06:00', hora_inicio: '2026-09-10T08:00:00-06:00' }),
    ]);
    expect(r.n).toBe(0);
    expect(r.descartados).toBe(1);
  });

  it('descarta un arranque de más de 4h (el técnico se fue y volvió) y lo cuenta', () => {
    const r = tiempoDeArranque([
      servicio({ hora_llegada: '2026-09-10T08:00:00-06:00', hora_inicio: '2026-09-10T13:00:00-06:00' }),
    ]);
    expect(r.n).toBe(0);
    expect(r.descartados).toBe(1);
  });
});

describe('puntualidad', () => {
  it('llegar hasta 15 min tarde cuenta como a tiempo', () => {
    const r = puntualidad([
      servicio({ hora_programada: '08:00', hora_llegada: '2026-09-10T08:15:00-06:00' }),
    ]);
    expect(r.aTiempo).toBe(1);
    expect(r.tarde).toBe(0);
  });

  it('16 minutos o más ya cuenta como tarde', () => {
    const r = puntualidad([
      servicio({ hora_programada: '08:00', hora_llegada: '2026-09-10T08:16:00-06:00' }),
    ]);
    expect(r.aTiempo).toBe(0);
    expect(r.tarde).toBe(1);
  });

  it('llegar antes de la hora acordada cuenta como a tiempo', () => {
    const r = puntualidad([
      servicio({ hora_programada: '08:00', hora_llegada: '2026-09-10T07:45:00-06:00' }),
    ]);
    expect(r.aTiempo).toBe(1);
    expect(r.medianaDesfaseMin).toBe(-15);
  });

  it('sin hora programada pero con llegada cuenta como sinHora, no en aTiempo/tarde', () => {
    const r = puntualidad([
      servicio({ hora_programada: null, hora_llegada: '2026-09-10T08:15:00-06:00' }),
    ]);
    expect(r.sinHora).toBe(1);
    expect(r.n).toBe(0);
  });

  it('sin hora de llegada no cuenta en nada, ni siquiera en sinHora', () => {
    const r = puntualidad([servicio({ hora_programada: '08:00', hora_llegada: null })]);
    expect(r.sinHora).toBe(0);
    expect(r.n).toBe(0);
  });
});

describe('retrabajo', () => {
  it('sin reportes no divide entre cero', () => {
    const r = retrabajo([]);
    expect(r.pctCorreccion).toBe(0);
    expect(r.pctSinFirma).toBe(0);
  });

  it('cuenta corrección solicitada u habilitada como retrabajo', () => {
    const r = retrabajo([
      { correccion_solicitada: true, data: { firmaClienteData: 'x' } },
      { correccion_habilitada: true, data: { firmaClienteData: 'x' } },
      { data: { firmaClienteData: 'x' } },
    ]);
    expect(r.conCorreccion).toBe(2);
    expect(r.pctCorreccion).toBeCloseTo((2 / 3) * 100);
  });

  it('cuenta reportes sin firma de cliente', () => {
    const r = retrabajo([{ data: {} }, { data: { firmaClienteData: 'x' } }]);
    expect(r.sinFirmaCliente).toBe(1);
    expect(r.pctSinFirma).toBe(50);
  });
});
