import { describe, it, expect } from 'vitest';
import { coberturaPorRenglon } from './insumos';

const r = (id: string, articulo_id: string | null, cantidad: number) => ({ id, articulo_id, cantidad });

describe('coberturaPorRenglon', () => {
  it('sin vales, todo falta por pedir', () => {
    const c = coberturaPorRenglon([r('a', 'TAL', 3)], []);
    expect(c.a).toEqual({ estado: 'falta', entregado: 0, pedido: 0, faltaPedir: 3 });
  });

  it('entregado completo, pedido y parcial', () => {
    const c = coberturaPorRenglon(
      [r('a', 'TAL', 3), r('b', 'CAB', 10), r('c', 'ESC', 2)],
      [
        { articulo_id: 'TAL', pedido: 0, entregado: 3 },
        { articulo_id: 'CAB', pedido: 6, entregado: 4 },
        { articulo_id: 'ESC', pedido: 0, entregado: 1 },
      ]
    );
    expect(c.a.estado).toBe('entregado');
    expect(c.b).toEqual({ estado: 'pedido', entregado: 4, pedido: 6, faltaPedir: 0 });
    expect(c.c).toEqual({ estado: 'falta', entregado: 1, pedido: 0, faltaPedir: 1 });
  });

  it('el mismo artículo en dos renglones se reparte en orden', () => {
    const c = coberturaPorRenglon([r('a', 'TAL', 2), r('b', 'TAL', 2)], [{ articulo_id: 'TAL', pedido: 0, entregado: 3 }]);
    expect(c.a.estado).toBe('entregado');
    expect(c.b).toEqual({ estado: 'falta', entregado: 1, pedido: 0, faltaPedir: 1 });
  });

  it('un renglón escrito a mano no se puede pedir por vale', () => {
    expect(coberturaPorRenglon([r('a', null, 1)], []).a.estado).toBe('sin_catalogo');
  });
});
