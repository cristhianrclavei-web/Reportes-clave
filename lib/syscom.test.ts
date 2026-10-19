import { describe, it, expect } from 'vitest';
import { normalizarProducto, ordenarPorParecido } from './syscom';

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

describe('ordenarPorParecido', () => {
  const p = (titulo: string, modelo = '') => normalizarProducto({ producto_id: titulo, titulo, modelo });
  it('primero lo que trae la palabra en el nombre; el resto conserva el orden de SYSCOM', () => {
    const lista = [p('Disco Duro 1 TB'), p('Kit de Baluns'), p('DVR Híbrido 8 canales', 'DVR-208G'), p('Adaptador DC'), p('Grabador DVR 4 canales')];
    expect(ordenarPorParecido(lista, 'dvr').map((x) => x.titulo)).toEqual([
      'DVR Híbrido 8 canales', 'Grabador DVR 4 canales', 'Disco Duro 1 TB', 'Kit de Baluns', 'Adaptador DC',
    ]);
  });
  it('sin acentos y con plural', () => {
    const lista = [p('Fuente de poder'), p('Cámara Bala IP')];
    expect(ordenarPorParecido(lista, 'camaras')[0].titulo).toBe('Cámara Bala IP');
  });
});
