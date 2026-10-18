import { describe, it, expect } from 'vitest';
import { puedeEditarSinPermiso } from './edicionLibreReporte';

const creado = '2026-10-18T10:00:00.000Z';
const minutos = (m: number) => new Date(creado).getTime() + m * 60 * 1000;

describe('puedeEditarSinPermiso', () => {
  it('sí dentro de la primera hora y sin firma del cliente', () => {
    expect(puedeEditarSinPermiso({ created_at: creado, data: {} }, minutos(59))).toBe(true);
  });
  it('no pasada la hora', () => {
    expect(puedeEditarSinPermiso({ created_at: creado, data: {} }, minutos(60))).toBe(false);
  });
  it('no si el cliente ya firmó, aunque no haya pasado la hora', () => {
    expect(puedeEditarSinPermiso({ created_at: creado, data: { firmaClienteData: 'data:image/png;base64,x' } }, minutos(5))).toBe(false);
  });
});
