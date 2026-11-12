import { describe, expect, it } from 'vitest';
import { equiposDeLineas, sistemaDeGuia } from './guiaDesdeCotizacion';

describe('guía a partir de una cotización', () => {
  it('lleva el sistema de la cotización al nombre que usan las guías', () => {
    expect(sistemaDeGuia('Control de Acceso Vehicular')).toBe('Control de acceso');
    expect(sistemaDeGuia('Alarma & Detección de Humo')).toBe('Alarma&Det');
    expect(sistemaDeGuia('Paneles Solares')).toBe('Paneles solares');
    expect(sistemaDeGuia('Mano de obra')).toBeNull();
  });

  it('toma como equipos los conceptos con enlace y corrige el enlace viejo de SYSCOM', () => {
    const equipos = equiposDeLineas([
      { descripcion: 'Terminal facial DS-K1T342\nIncluye montaje', sistema: 'Control de Acceso', enlace: 'https://www.syscom.mx/producto/231391', orden: 1 },
      { descripcion: 'Mano de obra', sistema: 'Control de Acceso', enlace: null, orden: 2 },
    ]);
    expect(equipos).toEqual([{ id: 'eq1', nombre: 'Terminal facial DS-K1T342', enlace: 'https://www.syscom.mx/products/231391', bornes: [] }]);
  });
});
