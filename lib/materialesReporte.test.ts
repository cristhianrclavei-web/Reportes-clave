import { describe, it, expect } from 'vitest';
import { tuberiasDe, cablesDe, soporteriaDe, soloNumero, cantidadTexto, textoTuberia, textoCable, seccionDeArticulo } from './materialesReporte';

describe('materiales del reporte', () => {
  it('lee la tubería del formato viejo (objeto por tipo)', () => {
    const t = tuberiasDe({ tuberia: { Roscada: { medida: '3/4"', metros: '12' }, Otra: { medida: '1"', metros: '3', especifica: 'Galvanizada' } } });
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ tipo: 'Roscada', medida: '3/4"', cantidad: '12', unidad: 'm' });
    expect(textoTuberia(t[1])).toBe('Otra (Galvanizada) · 1" · 3 m');
  });
  it('lee la tubería del formato nuevo (lista)', () => {
    const t = tuberiasDe({ tuberias: [{ tipo: 'Conduit pared delgada', medida: '3/4"', cantidad: '4', unidad: 'tramo' }] });
    expect(textoTuberia(t[0])).toBe('Conduit pared delgada · 3/4" · 4 tramos');
  });
  it('lee cables viejos (metros, cable1/cable2) y nuevos', () => {
    expect(cablesDe({ cables: [{ tipo: 'UTP', calibre: '23', metros: '120' }] })[0]).toMatchObject({ cantidad: '120', unidad: 'm' });
    expect(cablesDe({ cable1: { tipo: 'Coax', metros: '50' } })[0].tipo).toBe('Coax');
    expect(textoCable(cablesDe({ cables: [{ tipo: 'UTP Cat 6', calibre: '23 AWG', cantidad: '1', unidad: 'bobina' }] })[0])).toBe('UTP Cat 6 · cal. 23 AWG · 1 bobina');
  });
  it('soportería vacía en reportes viejos', () => {
    expect(soporteriaDe({})).toEqual([]);
  });
  it('cantidades solo numéricas', () => {
    expect(soloNumero('12 m')).toBe('12');
    expect(soloNumero('3,5')).toBe('3.5');
    expect(soloNumero('1.2.3')).toBe('1.23');
    expect(soloNumero('abc')).toBe('');
    expect(cantidadTexto('2', 'pza')).toBe('2 pzas');
    expect(cantidadTexto('', 'm')).toBe('—');
  });
  it('clasifica artículos del almacén', () => {
    expect(seccionDeArticulo('Tubo conduit 3/4', 'material')).toBe('tuberia');
    expect(seccionDeArticulo('Cable UTP Cat 6', 'material')).toBe('cable');
    expect(seccionDeArticulo('Taquete 1/4', 'material')).toBe('soporteria');
    expect(seccionDeArticulo('Cámara bala', 'equipo')).toBe('equipo');
  });
});

describe('texto sin medida repetida', () => {
  it('no repite la medida si el artículo ya la trae', () => {
    expect(textoTuberia({ tipo: '', medida: '3/4"', cantidad: '8', unidad: 'tramo', articulo: 'Tubo conduit 3/4"' })).toBe('Tubo conduit 3/4" · 8 tramos');
  });
});

import { inferirTuberia } from './materialesReporte';
describe('inferir tubería del almacén', () => {
  it('saca tipo y medida del nombre', () => {
    expect(inferirTuberia('Tubo conduit pared delgada 3/4"')).toEqual({ tipo: 'Conduit pared delgada', medida: '3/4"' });
    expect(inferirTuberia('Tubo PVC 1 1/2 pulg')).toEqual({ tipo: 'PVC', medida: '1 1/2"' });
    expect(inferirTuberia('Codo')).toEqual({ tipo: '', medida: '' });
  });
});
