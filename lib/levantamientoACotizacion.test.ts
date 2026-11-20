import { describe, expect, it } from 'vitest';
import { cotizacionDesdeLevantamiento, leerCantidad, propuestasDeLevantamiento } from './levantamientoACotizacion';
import type { Levantamiento, SistemaLevantamiento } from './levantamientos';

describe('leerCantidad', () => {
  it('lee metros en cualquier parte del texto', () => {
    expect(leerCantidad('Considerar 50 mts de cable belden 2x18 y 5 metros de tuberia')).toEqual({ cantidad: 50, unidad: 'Mts' });
    expect(leerCantidad('Cablear cada cámara con cable UTP Cat6 blanco para intemperie, unos 120 m en total.')).toEqual({ cantidad: 120, unidad: 'Mts' });
  });
  it('lee piezas y no confunde características', () => {
    expect(leerCantidad('Instalar 6 cámaras bala')).toEqual({ cantidad: 6, unidad: 'Pza' });
    expect(leerCantidad('Instalar un switch de 8 puertos')).toEqual({ cantidad: 1, unidad: 'Pza' });
    expect(leerCantidad('Instalar un arreglo de 4 paneles de 450 W (1.8 kWp)')).toEqual({ cantidad: 1, unidad: 'Pza' });
    expect(leerCantidad('Cambiar bateria por una de 12v 7 A')).toEqual({ cantidad: 1, unidad: 'Pza' });
    expect(leerCantidad('Colocar 3 detectores de humo')).toEqual({ cantidad: 3, unidad: 'Pza' });
  });
});

function sistema(parcial: Partial<SistemaLevantamiento>): SistemaLevantamiento {
  return { id: 's', levantamiento_id: 'l', orden: 0, sistema: 'CCTV', estado_actual: null, observaciones: null, equipos: [], recomendaciones: [], fotos: [], ...parcial };
}

describe('propuestasDeLevantamiento', () => {
  let n = 0;
  const nuevoId = () => `id${n++}`;

  it('recomendaciones y mano de obra marcadas; reemplazos sin marcar', () => {
    const p = propuestasDeLevantamiento([sistema({
      recomendaciones: ['Instalar 2 cámaras domo', '  '],
      equipos: [
        { cantidad: 3, descripcion: 'Cámara bala', modelo: 'DS-2CE', estado: 'No funciona' },
        { cantidad: 1, descripcion: 'DVR', modelo: '', estado: 'Funciona' },
      ],
    })], nuevoId);
    expect(p.map((c) => [c.origen, c.incluir, c.cantidad])).toEqual([
      ['recomendacion', true, 2],
      ['reemplazo', false, 3],
      ['mano_obra', true, 1],
    ]);
    expect(p[1].descripcion).toBe('Reemplazo de Cámara bala');
  });

  it('sin recomendaciones usa los renglones de las observaciones y les pega el enlace', () => {
    const p = propuestasDeLevantamiento([sistema({
      sistema: 'Alarma de Intrusión',
      observaciones: 'Cambiar bateria por una de 12v 7 A\nhttps://www.syscom.mx/products/225961',
    })], nuevoId);
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ origen: 'observacion', incluir: false, enlace: 'https://www.syscom.mx/products/225961' });
  });
});

describe('cotizacionDesdeLevantamiento', () => {
  it('solo pasa lo marcado, con datos del cliente y título por sistemas', () => {
    const lev = { empresa: 'Hotel Sol', atencion: 'Ana', telefono: '33', correo: null, direccion: 'Av 1' } as Levantamiento;
    let n = 0;
    const conceptos = propuestasDeLevantamiento([
      sistema({ recomendaciones: ['Instalar 2 cámaras'] }),
      sistema({ sistema: 'Paneles Solares', equipos: [{ cantidad: 1, descripcion: 'Inversor', modelo: '', estado: 'Obsoleto' }] }),
    ], () => `x${n++}`);
    const { cotizacion, lineas } = cotizacionDesdeLevantamiento(lev, conceptos, '2026-11-19', { nombre: 'Braulio', correo: '' });
    expect(cotizacion.empresa).toBe('Hotel Sol');
    expect(cotizacion.titulo_proyecto).toBe('CCTV, Paneles Solares');
    expect(lineas.map((l) => l.sistema)).toEqual(['CCTV', 'CCTV', 'Paneles Solares']);
    expect(lineas[2].unidad).toBe('Serv');
  });
});
