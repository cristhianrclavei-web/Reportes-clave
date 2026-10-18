import { describe, it, expect } from 'vitest';
import { limpiarEquipos, limpiarRecomendaciones } from './levantamientos';

describe('limpiarEquipos', () => {
  it('quita renglones sin descripción y recorta espacios', () => {
    const r = limpiarEquipos([
      { cantidad: 4, descripcion: ' Cámara bala ', modelo: ' DS-2CE ', estado: 'Funciona' },
      { cantidad: 2, descripcion: '   ', modelo: 'X', estado: '' },
    ]);
    expect(r).toEqual([{ cantidad: 4, descripcion: 'Cámara bala', modelo: 'DS-2CE', estado: 'Funciona' }]);
  });

  it('una cantidad vacía o en cero se guarda como 1', () => {
    const r = limpiarEquipos([{ cantidad: 0, descripcion: 'DVR', modelo: '', estado: '' }]);
    expect(r[0].cantidad).toBe(1);
  });
});

describe('limpiarRecomendaciones', () => {
  it('quita los puntos en blanco y conserva el orden', () => {
    expect(limpiarRecomendaciones([' Cambiar DVR ', '', '  ', 'Agregar UPS'])).toEqual(['Cambiar DVR', 'Agregar UPS']);
  });
});
