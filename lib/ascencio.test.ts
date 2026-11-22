import { describe, expect, it } from 'vitest';
import { aProducto, conTodasLasPalabras, idsDeMarcas } from './ascencio';

describe('catálogo de Grupo Ascencio', () => {
  const categorias = [
    { id: 28, name: 'MARCAS', parent: 0 },
    { id: 50, name: 'SIEMENS', parent: 28 },
    { id: 82, name: 'MATERIAL ELECTRICO', parent: 0 },
    { id: 90, name: 'DISTRIBUCIÓN ELÉCTRICA', parent: 82 },
  ];

  it('toma la marca de la categoría hija de MARCAS, el SKU como modelo y la ficha PDF', () => {
    const p = aProducto({
      id: 1,
      name: 'CONTACTOR DE FUERZA TRIPOLAR SIRIUS 32A',
      sku: ' 3RT20271AN20 ',
      permalink: 'https://grupoascencio.com.mx/producto/contactor/',
      short_description: '<p>Contactor&nbsp;de fuerza</p>',
      description: '<a href="https://grupoascencio.com.mx/wp-content/uploads/3RT20271AN20.pdf">Ficha Tecnica</a>',
      images: [{ src: 'https://grupoascencio.com.mx/wp-content/uploads/3RT.png' }],
      categories: [{ id: 90, name: 'DISTRIBUCIÓN ELÉCTRICA' }, { id: 50, name: 'SIEMENS' }],
    }, idsDeMarcas(categorias));
    expect(p).toMatchObject({
      titulo: 'CONTACTOR DE FUERZA TRIPOLAR SIRIUS 32A', modelo: '3RT20271AN20', marca: 'SIEMENS',
      ficha: 'https://grupoascencio.com.mx/wp-content/uploads/3RT20271AN20.pdf', descripcion: 'Contactor de fuerza',
    });
  });

  it('sin marca ni ficha ni foto https no inventa nada', () => {
    const p = aProducto({ id: 2, name: 'TUBO', images: [{ src: 'http://x/y.png' }], categories: [{ id: 82, name: 'REBAJAS' }] }, idsDeMarcas(categorias));
    expect([p.marca, p.ficha, p.imagen, p.modelo]).toEqual(['', null, null, '']);
  });

  it('varias palabras: deja solo los que tienen todas, sin importar acentos', () => {
    const base = { id: 1, imagen: null, link: '', ficha: null, descripcion: '' };
    const lista = [
      { ...base, titulo: 'CONTACTOR SIRIUS 32A', modelo: '3RT2027', marca: 'SIEMENS' },
      { ...base, titulo: 'CONTACTOR TESYS 25A', modelo: 'LC1D25', marca: 'SCHNEIDER' },
      { ...base, titulo: 'Interruptor termomagnético', modelo: 'QO115', marca: 'SCHNEIDER' },
    ];
    expect(conTodasLasPalabras(lista, 'contactor siemens').map((p) => p.modelo)).toEqual(['3RT2027']);
    expect(conTodasLasPalabras(lista, 'TERMOMAGNETICO schneider').map((p) => p.modelo)).toEqual(['QO115']);
  });
});
