import { describe, it, expect } from 'vitest';
import { diasDeDiferencia, esDiaVencido, formatFechaAgenda, construirAgenda } from './agenda';
import { Servicio } from './serviciosProgramados';

// 10 de septiembre de 2026, media tarde — la hora no debe importar: la
// diferencia de días se calcula truncando "ahora" a medianoche.
const DIA_10 = new Date(2026, 8, 10, 15, 30, 0);

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
    hora_salida_programada: null,
    ubicacion_programada: null,
    radio_geocerca_m: 120,
    duracion_estimada_min: 60,
    hora_llegada: null,
    hora_inicio: null,
    hora_fin: null,
    estado: 'programado',
    pausado_desde: null,
    minutos_pausados: 0,
    report_id: null,
    grupo_id: 'g1',
    numero_dia: 1,
    dias_totales: 1,
    created_at: '2026-09-10T12:00:00-06:00',
    ...overrides,
  };
}

describe('diasDeDiferencia', () => {
  it('hoy es 0', () => {
    expect(diasDeDiferencia('2026-09-10', DIA_10)).toBe(0);
  });

  it('mañana es 1, ayer es -1', () => {
    expect(diasDeDiferencia('2026-09-11', DIA_10)).toBe(1);
    expect(diasDeDiferencia('2026-09-09', DIA_10)).toBe(-1);
  });

  it('no se corre de día cerca de medianoche', () => {
    const casiMedianoche = new Date(2026, 8, 10, 23, 45, 0);
    expect(diasDeDiferencia('2026-09-10', casiMedianoche)).toBe(0);

    const recienPasada = new Date(2026, 8, 10, 0, 15, 0);
    expect(diasDeDiferencia('2026-09-10', recienPasada)).toBe(0);
  });
});

describe('esDiaVencido', () => {
  it('una fecha pasada sin concluir está vencida', () => {
    expect(esDiaVencido({ fecha: '2026-09-09', estado: 'programado' }, DIA_10)).toBe(true);
  });

  it('una fecha pasada pero ya concluida no está vencida', () => {
    expect(esDiaVencido({ fecha: '2026-09-09', estado: 'concluido' }, DIA_10)).toBe(false);
  });

  it('hoy o a futuro no está vencido', () => {
    expect(esDiaVencido({ fecha: '2026-09-10', estado: 'programado' }, DIA_10)).toBe(false);
    expect(esDiaVencido({ fecha: '2026-09-11', estado: 'programado' }, DIA_10)).toBe(false);
  });
});

describe('formatFechaAgenda', () => {
  it('incluye día de la semana, número y mes en español', () => {
    // 10 de septiembre de 2026 es jueves.
    const texto = formatFechaAgenda('2026-09-10');
    expect(texto.toLowerCase()).toContain('jueves');
    expect(texto).toContain('10');
    expect(texto.toLowerCase()).toContain('septiembre');
  });
});

describe('construirAgenda', () => {
  it('ignora los servicios ya concluidos', () => {
    const bloques = construirAgenda([servicio({ estado: 'concluido', fecha: '2026-09-09' })], DIA_10);
    expect(bloques).toEqual([]);
  });

  it('clasifica vencidos, hoy, mañana, esta semana y más adelante', () => {
    const bloques = construirAgenda(
      [
        servicio({ fecha: '2026-09-09' }), // vencido
        servicio({ fecha: '2026-09-10' }), // hoy
        servicio({ fecha: '2026-09-11' }), // mañana
        servicio({ fecha: '2026-09-17' }), // en 7 días: esta semana
        servicio({ fecha: '2026-09-18' }), // en 8 días: más adelante
      ],
      DIA_10
    );
    const claves = bloques.map((b) => b.clave);
    expect(claves).toEqual(['vencidos', 'hoy', 'manana', 'semana', 'despues']);
    expect(bloques.find((b) => b.clave === 'semana')!.dias[0].fecha).toBe('2026-09-17');
    expect(bloques.find((b) => b.clave === 'despues')!.dias[0].fecha).toBe('2026-09-18');
  });

  it('omite los bloques sin días', () => {
    const bloques = construirAgenda([servicio({ fecha: '2026-09-10' })], DIA_10);
    expect(bloques.map((b) => b.clave)).toEqual(['hoy']);
  });

  it('ordena los vencidos del más antiguo al más reciente (lo más rezagado primero)', () => {
    const bloques = construirAgenda(
      [servicio({ fecha: '2026-09-05' }), servicio({ fecha: '2026-09-08' }), servicio({ fecha: '2026-09-01' })],
      DIA_10
    );
    const vencidos = bloques.find((b) => b.clave === 'vencidos')!;
    expect(vencidos.dias.map((d) => d.fecha)).toEqual(['2026-09-01', '2026-09-05', '2026-09-08']);
  });

  it('dentro de un mismo día ordena por nombre de proyecto', () => {
    const bloques = construirAgenda(
      [
        servicio({ fecha: '2026-09-11', proyecto: 'Zeta' }),
        servicio({ fecha: '2026-09-11', proyecto: 'Alfa' }),
      ],
      DIA_10
    );
    const manana = bloques.find((b) => b.clave === 'manana')!;
    expect(manana.dias.map((d) => d.proyecto)).toEqual(['Alfa', 'Zeta']);
  });
});
