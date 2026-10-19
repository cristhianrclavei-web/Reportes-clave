import { describe, it, expect } from 'vitest';
import { normalizarProducto } from './syscom';

describe('normalizarProducto', () => {
  it('lee precios como texto dentro de «precios», total_existencia e img_portada', () => {
    const p = normalizarProducto({
      producto_id: '123', titulo: 'Cámara', modelo: 'DS-1', marca: 'HIKVISION',
      total_existencia: 7,
      precios: { precio_1: '1,500.00', precio_especial: '1200.50', precio_descuento: '1100.25', precio_lista: '2000' },
      img_portada: 'http://ftp3.syscom.mx/foto.jpg',
    });
    expect(p.precio).toBe(1100.25);
    expect(p.existencia).toBe(7);
    expect(p.imagen).toBe('https://ftp3.syscom.mx/foto.jpg');
  });
  it('sin precio ni imagen queda en null', () => {
    const p = normalizarProducto({ producto_id: 1, titulo: 'X', precios: { precio_descuento: '0' }, img_portada: '' });
    expect(p.precio).toBeNull();
    expect(p.imagen).toBeNull();
    expect(p.existencia).toBeNull();
  });
});
