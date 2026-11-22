import { describe, expect, it } from 'vitest';
import { comidaExcedida, paradaEnBitacora } from './jornadaDatos';

describe('paradaEnBitacora', () => {
  it('comida y desayuno/tienda cuentan como comida', () => {
    expect(paradaEnBitacora({ motivo: 'comida', estado: 'aprobada' })).toEqual({ clase: 'comida', titulo: 'Comida' });
    expect(paradaEnBitacora({ motivo: 'desayuno_tienda', estado: 'aprobada' })?.clase).toBe('comida');
    expect(paradaEnBitacora({ motivo: 'comida', estado: 'aprobada', reporte_id: 'r', cliente: 'MAQUISA' })?.titulo).toBe('Comida en MAQUISA');
  });
  it('después de la firma sin justificar o por autorizar sale como sin registrar', () => {
    expect(paradaEnBitacora({ motivo: null, estado: null, reporte_id: 'r', cliente: 'MAQUISA' }))
      .toEqual({ clase: 'sin_registrar', titulo: 'Después de la firma en MAQUISA: falta justificar' });
    expect(paradaEnBitacora({ motivo: 'otro', estado: 'pendiente', reporte_id: 'r' })?.titulo).toContain('por autorizar');
  });
  it('después de la firma, cargar material o seguir trabajando cuenta como servicio', () => {
    expect(paradaEnBitacora({ motivo: 'material_herramienta', estado: 'aprobada', reporte_id: 'r', cliente: 'MAQUISA' }))
      .toEqual({ clase: 'servicio', titulo: 'Cierre en MAQUISA: material y herramienta' });
    expect(paradaEnBitacora({ motivo: 'personal', estado: 'aprobada', reporte_id: 'r' })?.clase).toBe('pausa');
  });
  it('a media ruta, lo no justificado no se pinta (queda el hueco) y lo autorizado ya es actividad', () => {
    expect(paradaEnBitacora({ motivo: null, estado: null })).toBeNull();
    expect(paradaEnBitacora({ motivo: 'combustible', estado: 'aprobada' })).toBeNull();
  });
});

describe('comidaExcedida', () => {
  it('pasa de la comida permitida más la tolerancia', () => {
    const comida = { minutos: 60, tolerancia: 10 };
    expect(comidaExcedida(70, comida)).toBe(false);
    expect(comidaExcedida(71, comida)).toBe(true);
    expect(comidaExcedida(200, undefined)).toBe(false);
  });
});
