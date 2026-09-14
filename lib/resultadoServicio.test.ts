import { describe, it, expect } from 'vitest';
import { calcularResultadoServicio } from './resultadoServicio';

// Fábrica con valores por defecto: servicio de un solo día, concluido a
// tiempo, sin checklist. Cada prueba pisa solo lo que le importa.
function base(overrides: Partial<Parameters<typeof calcularResultadoServicio>[0]> = {}) {
  return {
    estado: 'concluido' as const,
    hora_llegada: '2026-09-10T08:00:00-06:00',
    hora_inicio: '2026-09-10T08:00:00-06:00',
    hora_fin: '2026-09-10T09:00:00-06:00',
    duracion_estimada_min: 60,
    numero_dia: 1,
    dias_totales: 1,
    ...overrides,
  };
}

describe('calcularResultadoServicio', () => {
  it('un servicio que aún no concluye no tiene marcas', () => {
    const r = calcularResultadoServicio(base({ estado: 'en_curso' }));
    expect(r.marcas).toEqual([]);
    expect(r.retrasoMin).toBeNull();
    expect(r.pendientes).toBe(0);
  });

  it('a tiempo y sin checklist pendiente cierra "completo"', () => {
    const r = calcularResultadoServicio(base());
    expect(r.marcas).toEqual(['completo']);
  });

  it('pasarse del tiempo estimado marca "retrasado" con el exceso en minutos', () => {
    const r = calcularResultadoServicio(
      base({ hora_inicio: '2026-09-10T08:00:00-06:00', hora_fin: '2026-09-10T09:20:00-06:00', duracion_estimada_min: 60 })
    );
    expect(r.marcas).toContain('retrasado');
    expect(r.retrasoMin).toBe(20);
  });

  it('cerrar exactamente en el tiempo estimado no cuenta como retraso', () => {
    const r = calcularResultadoServicio(
      base({ hora_inicio: '2026-09-10T08:00:00-06:00', hora_fin: '2026-09-10T09:00:00-06:00', duracion_estimada_min: 60 })
    );
    expect(r.marcas).not.toContain('retrasado');
    expect(r.retrasoMin).toBeNull();
  });

  it('cerrar antes de lo estimado no cuenta como retraso', () => {
    const r = calcularResultadoServicio(
      base({ hora_inicio: '2026-09-10T08:00:00-06:00', hora_fin: '2026-09-10T08:30:00-06:00', duracion_estimada_min: 60 })
    );
    expect(r.marcas).not.toContain('retrasado');
    expect(r.retrasoMin).toBeNull();
  });

  it('sin hora_inicio, usa hora_llegada como inicio para medir el retraso', () => {
    const r = calcularResultadoServicio(
      base({
        hora_inicio: null,
        hora_llegada: '2026-09-10T08:00:00-06:00',
        hora_fin: '2026-09-10T09:20:00-06:00',
        duracion_estimada_min: 60,
      })
    );
    expect(r.retrasoMin).toBe(20);
  });

  it('un día intermedio de un proyecto multi-día no marca incompleto aunque falten tareas', () => {
    const r = calcularResultadoServicio(
      base({ numero_dia: 2, dias_totales: 5 }),
      { total: 10, completadas: 4, pct: 40 }
    );
    expect(r.marcas).not.toContain('incompleto');
    // Las tareas pendientes se siguen reportando aunque no cuenten como falla del día.
    expect(r.pendientes).toBe(6);
  });

  it('el último día de un proyecto multi-día sí marca incompleto si quedan tareas', () => {
    const r = calcularResultadoServicio(
      base({ numero_dia: 5, dias_totales: 5 }),
      { total: 10, completadas: 4, pct: 40 }
    );
    expect(r.marcas).toContain('incompleto');
    expect(r.pendientes).toBe(6);
  });

  it('un servicio de un solo día es su propio último día', () => {
    const r = calcularResultadoServicio(base(), { total: 3, completadas: 1, pct: 33 });
    expect(r.marcas).toContain('incompleto');
  });

  it('checklist completo no marca incompleto', () => {
    const r = calcularResultadoServicio(base(), { total: 3, completadas: 3, pct: 100 });
    expect(r.marcas).not.toContain('incompleto');
    expect(r.pendientes).toBe(0);
  });

  it('sin checklist (progreso ausente) no marca incompleto', () => {
    const r = calcularResultadoServicio(base());
    expect(r.marcas).not.toContain('incompleto');
    expect(r.pendientes).toBe(0);
  });

  it('un checklist vacío (total 0) no marca incompleto', () => {
    const r = calcularResultadoServicio(base(), { total: 0, completadas: 0, pct: 0 });
    expect(r.marcas).not.toContain('incompleto');
    expect(r.pendientes).toBe(0);
  });

  it('incompleto y retrasado se acumulan: nunca aparece "completo" junto a otra marca', () => {
    const r = calcularResultadoServicio(
      base({ hora_fin: '2026-09-10T09:20:00-06:00', duracion_estimada_min: 60 }),
      { total: 5, completadas: 2, pct: 40 }
    );
    expect(r.marcas).toContain('incompleto');
    expect(r.marcas).toContain('retrasado');
    expect(r.marcas).not.toContain('completo');
  });
});
