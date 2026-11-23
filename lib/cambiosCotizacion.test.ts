import { describe, expect, it } from 'vitest';
import { describirCambiosCotizacion, textoAvisoAprobacion } from './cambiosCotizacion';

const base = {
  titulo_proyecto: 'CCTV', empresa: 'Hotel', atencion: 'Ana', telefono: null, correo: null, direccion: null,
  forma_pago: '50% anticipo', tiempo_entrega: '5 días', garantia: '1 año', vigencia_dias: 15, notas: null,
  moneda: 'MXN', iva_pct: 16, iva_incluido: false, total: 1160,
};
const camara = { sistema: 'CCTV', descripcion: 'Cámara bala', unidad: 'Pza', cantidad: 2, precio_unitario: 500 };

describe('describirCambiosCotizacion', () => {
  it('sin cambios no describe nada', () => {
    expect(describirCambiosCotizacion({ cotizacion: base, lineas: [camara] }, { cotizacion: { ...base }, lineas: [{ ...camara }] })).toEqual([]);
  });

  it('describe partidas cambiadas, agregadas, quitadas y el total', () => {
    const cable = { sistema: 'CCTV', descripcion: 'Cable UTP', unidad: 'm', cantidad: 100, precio_unitario: 10 };
    const disco = { sistema: 'CCTV', descripcion: 'Disco 2 TB', unidad: 'Pza', cantidad: 1, precio_unitario: 1500 };
    const cambios = describirCambiosCotizacion(
      { cotizacion: base, lineas: [camara, cable] },
      { cotizacion: { ...base, forma_pago: 'Contado', total: 4060 }, lineas: [{ ...camara, cantidad: 4 }, disco] },
    );
    expect(cambios).toEqual([
      'Forma de pago: 50% anticipo → Contado',
      'Cambió Cámara bala: cantidad 2 → 4',
      'Agregó: Disco 2 TB (1 Pza, $1,500.00 c/u)',
      'Quitó: Cable UTP (100 m)',
      'Total: $1,160.00 → $4,060.00',
    ]);
  });

  it('vacío y null cuentan igual', () => {
    expect(describirCambiosCotizacion({ cotizacion: { ...base, notas: '' }, lineas: [] }, { cotizacion: { ...base, notas: null }, lineas: [] })).toEqual([]);
  });
});

describe('textoAvisoAprobacion', () => {
  it('sin cambios, solo dice que aprobó', () => {
    expect(textoAvisoAprobacion('Clara', 'Hotel', [])).toBe('Clara aprobó en la app la cotización de Hotel.');
  });
  it('con muchos cambios muestra dos y cuenta el resto', () => {
    expect(textoAvisoAprobacion('Clara', 'Hotel', ['a', 'b', 'c', 'd'])).toBe('Clara la editó y aprobó (Hotel): a; b y 2 cambio(s) más (ver historial).');
  });
});
