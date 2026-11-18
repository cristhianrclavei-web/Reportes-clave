import { describe, expect, it } from 'vitest';
import { buscarEnCatalogo, cambioDePrecio, construirCatalogo, parecido, textoParaBuscar, vaLaPenaBuscar, type FilaCotizada } from './catalogoCotizaciones';

const FILAS: FilaCotizada[] = [
  { descripcion: 'Modulo Solar, 645 W BIFACIAL, 53.7 Vcc', enlace: 'https://www.syscom.mx/products/1001', costo: 2000, unidad: 'Pza', fecha: '2026-10-01', folio: 'COT-0010' },
  { descripcion: 'Modulo Solar, 645 W BIFACIAL, 53.7 Vcc', enlace: 'https://www.syscom.mx/products/1001', costo: 2100, unidad: 'Pza', fecha: '2026-11-05', folio: 'COT-0035' },
  { descripcion: 'Detector de humo fotoeléctrico direccionable', enlace: 'https://www.syscom.mx/producto/2002', costo: 900, unidad: 'Pza', fecha: '2026-10-10', folio: 'COT-0020' },
  { descripcion: 'Mano de obra', enlace: null, costo: 5000, unidad: 'Lote', fecha: '2026-10-10', folio: 'COT-0020' },
];

describe('catálogo propio de cotizaciones', () => {
  it('deja un producto por enlace, el más reciente', () => {
    const catalogo = construirCatalogo(FILAS);
    expect(catalogo).toHaveLength(2);
    expect(catalogo.find((p) => p.id === '1001')).toMatchObject({ costo: 2100, folio: 'COT-0035' });
  });

  it('reconoce el mismo texto pegado aunque traiga la cantidad', () => {
    const catalogo = construirCatalogo(FILAS);
    expect(buscarEnCatalogo('Modulo Solar, 645 W BIFACIAL, 53.7 Vcc (6 Unidades)', catalogo)?.id).toBe('1001');
    expect(buscarEnCatalogo('módulo solar 645 w bifacial', catalogo)?.id).toBe('1001');
  });

  it('no sugiere algo distinto', () => {
    const catalogo = construirCatalogo(FILAS);
    expect(buscarEnCatalogo('Modulo Solar 550 W monocristalino', catalogo)).toBeNull();
    expect(buscarEnCatalogo('Detector de calor', catalogo)).toBeNull();
  });

  it('compara palabras sin acentos ni mayúsculas', () => {
    expect(parecido('Batería de Litio 48 Vcc', 'BATERIA LITIO 48 VCC 104 Ah')).toBe(1);
  });

  it('decide qué vale la pena buscar y cómo', () => {
    expect(vaLaPenaBuscar('Mano de obra e instalación')).toBe(false);
    expect(vaLaPenaBuscar('Cable')).toBe(false);
    expect(vaLaPenaBuscar('Batería de Litio 48 Vcc 104 Ah')).toBe(true);
    expect(textoParaBuscar('Modulo Solar, 645 W (6 Unidades)\nSegundo renglón')).toBe('Modulo Solar, 645 W');
  });

  it('calcula el cambio de precio', () => {
    expect(cambioDePrecio(100, 112.5)).toBe(12.5);
    expect(cambioDePrecio(100, 95)).toBe(-5);
    expect(cambioDePrecio(null, 95)).toBeNull();
    expect(cambioDePrecio(0, 95)).toBeNull();
  });
});
