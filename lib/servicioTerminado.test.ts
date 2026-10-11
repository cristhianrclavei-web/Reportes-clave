import { describe, it, expect } from 'vitest';
import { servicioQuedoTerminado } from './servicioTerminado';

describe('servicioQuedoTerminado', () => {
  it('un día intermedio nunca cuenta como servicio terminado', () => {
    expect(servicioQuedoTerminado({ numero_dia: 1, dias_totales: 3, resultado: 'terminado' })).toBe(false);
  });
  it('el último día con el trabajo terminado sí', () => {
    expect(servicioQuedoTerminado({ numero_dia: 3, dias_totales: 3, resultado: 'terminado' })).toBe(true);
    expect(servicioQuedoTerminado({ numero_dia: 1, dias_totales: 1, resultado: 'terminado' })).toBe(true);
  });
  it('el último día con trabajo pendiente o sin trabajar, no', () => {
    expect(servicioQuedoTerminado({ numero_dia: 1, dias_totales: 1, resultado: 'pendiente' })).toBe(false);
    expect(servicioQuedoTerminado({ numero_dia: 1, dias_totales: 1, resultado: 'no_realizado' })).toBe(false);
  });
  it('un servicio viejo sin respuesta de cierre cuenta por ser el último día', () => {
    expect(servicioQuedoTerminado({ numero_dia: 2, dias_totales: 2, resultado: null as any })).toBe(true);
  });
});
