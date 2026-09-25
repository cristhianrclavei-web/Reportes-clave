import { describe, it, expect } from 'vitest';
import { agruparPorTecnico, fechaCorta, inicioVentana, mensajePendiente, INICIO_COBERTURA } from './coberturaReportes';

describe('coberturaReportes', () => {
  it('fechaCorta usa dd/mm/aaaa', () => {
    expect(fechaCorta('2026-09-03')).toBe('03/09/2026');
  });

  it('la ventana no empieza antes del arranque ni más de 30 días atrás', () => {
    expect(inicioVentana('2026-09-30')).toBe(INICIO_COBERTURA);
    expect(inicioVentana('2026-12-15')).toBe('2026-11-15');
  });

  it('mensaje de la tarde habla de hoy', () => {
    const m = mensajePendiente('tarde', ['2026-10-01']);
    expect(m.titulo).toBe('Falta reporte de servicio');
    expect(m.cuerpo).toContain('01/10/2026');
  });

  it('mensaje de la mañana lista fechas en orden', () => {
    expect(mensajePendiente('manana', ['2026-10-02']).titulo).toBe('Falta reporte de servicio del 02/10/2026');
    expect(mensajePendiente('manana', ['2026-10-02', '2026-09-30']).titulo).toBe(
      'Falta reporte de servicio del 30/09/2026 y 02/10/2026'
    );
  });

  it('con más de 3 días resume', () => {
    const m = mensajePendiente('manana', ['2026-10-05', '2026-10-01', '2026-10-02', '2026-09-30']);
    expect(m.titulo).toBe('Faltan reportes de 4 días');
    expect(m.cuerpo).toContain('30/09/2026');
  });

  it('agrupa filas por técnico', () => {
    const g = agruparPorTecnico([
      { tecnico_id: 'a', fecha: '2026-10-01' },
      { tecnico_id: 'b', fecha: '2026-10-01' },
      { tecnico_id: 'a', fecha: '2026-10-02' },
    ]);
    expect(g.get('a')).toEqual(['2026-10-01', '2026-10-02']);
    expect(g.size).toBe(2);
  });
});
