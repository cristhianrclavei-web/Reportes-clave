import { describe, expect, it } from 'vitest';
import { agruparPorSistema, calcularTotales, opcionesDeCotizacion } from './cotizaciones';

describe('agruparPorSistema', () => {
  it('separa dos sistemas con el mismo nombre y distinto título', () => {
    const lineas = [
      { sistema: 'CCTV', titulo_sistema: 'Respaldo de energía' },
      { sistema: 'CCTV', titulo_sistema: 'Respaldo de energía' },
      { sistema: 'CCTV', titulo_sistema: 'Póliza de mantenimiento' },
      { sistema: 'CCTV', titulo_sistema: null },
    ];
    expect(agruparPorSistema(lineas).map((g) => g.lineas.length)).toEqual([2, 1, 1]);
  });
});

describe('sistemas opcionales', () => {
  const obra = { sistema: 'CCTV', titulo_sistema: 'Obra', cantidad: 1, precio_unitario: 1000, unidad: 'Pza', descripcion: 'a', costo: 0, margen_pct: 0 };
  const opcionA = { ...obra, titulo_sistema: 'Opción A', precio_unitario: 3000, opcional: true };
  const opcionB = { ...obra, titulo_sistema: 'Opción B', precio_unitario: 500, opcional: true };

  it('no suman al total', () => {
    expect(calcularTotales([obra, opcionA, opcionB], 16)).toEqual({ subtotal: 1000, iva: 160, total: 1160 });
  });

  it('un opcional con el mismo sistema y título que uno normal es otro grupo', () => {
    expect(agruparPorSistema([obra, { ...obra, opcional: true }]).map((g) => g.opcional)).toEqual([false, true]);
  });

  it('cada opción dice cómo quedaría el total, con IVA aparte o incluido', () => {
    expect(opcionesDeCotizacion([obra, opcionA, opcionB], { total: 1160, iva_pct: 16 })).toEqual([
      { nombre: 'Opción A', importe: 3000, totalConOpcion: 4640 },
      { nombre: 'Opción B', importe: 500, totalConOpcion: 1740 },
    ]);
    expect(opcionesDeCotizacion([obra, opcionA], { total: 1000, iva_pct: 16, iva_incluido: true })[0].totalConOpcion).toBe(4000);
  });
});
