import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { generateCotizacionXlsx } from './generateCotizacionXlsx';
import type { Cotizacion, LineaCotizacion } from './cotizaciones';

// Genera el Excel de verdad y lo vuelve a leer: revisa que salgan las tablas
// por sistema con su numeración, los totales y que nunca aparezca el costo.

function cotizacion(cambios: Partial<Cotizacion> = {}): Cotizacion {
  return {
    id: 'c1', folio: 'COT-55-FV', created_by: 'u1', created_at: '', updated_at: '', fecha: '2026-11-26',
    titulo_proyecto: 'Planta solar', atencion: 'Ing. Pérez', empresa: 'Cliente SA', telefono: '3312345678', correo: null, direccion: null,
    forma_pago: '50% anticipo', tiempo_entrega: '10 días', garantia: '1 año', vigencia_dias: 15, notas: null,
    firmante_nombre: 'Braulio', firmante_correo: null, iva_pct: 16, moneda: 'MXN', presentacion_precios: 'desglosado',
    tipo_cambio: 1, subtotal: 1000, iva: 160, total: 1160, estado: 'borrador', aprobada_por: null, aprobada_firma: null,
    ...cambios,
  } as Cotizacion;
}

function linea(sistema: string, descripcion: string, importe: number, cambios: Partial<LineaCotizacion> = {}): LineaCotizacion {
  return {
    id: descripcion, cotizacion_id: 'c1', sistema, orden: 0, descripcion, unidad: 'Pza', cantidad: 1,
    costo: 123.45, margen_pct: 30, precio_unitario: importe, importe, ...cambios,
  } as LineaCotizacion;
}

async function textosDe(buffer: Buffer): Promise<string[]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as any);
  const textos: string[] = [];
  libro.getWorksheet('COTIZACIÓN')!.eachRow((fila) => {
    fila.eachCell((celda) => textos.push(String(celda.value)));
  });
  return textos;
}

describe('generateCotizacionXlsx', () => {
  it('arma una tabla por sistema, reinicia la numeración y pone los totales', async () => {
    const lineas = [
      linea('Paneles solares', 'Módulo 645 W', 600),
      linea('Paneles solares', 'Inversor 5 kW', 400),
      linea('Mantenimiento', 'Limpieza de paneles', 300, { opcional: true }),
    ];
    const textos = await textosDe(await generateCotizacionXlsx(cotizacion(), lineas));
    expect(textos).toContain('COTIZACIÓN: PANELES SOLARES');
    expect(textos).toContain('COTIZACIÓN OPCIONAL: MANTENIMIENTO');
    expect(textos).toContain('PLANTA SOLAR');
    // La partida del opcional vuelve a empezar en 01.
    expect(textos.filter((t) => t === '01')).toHaveLength(2);
    expect(textos).toContain('SUBTOTAL');
    expect(textos).toContain('1160');
    expect(textos).toContain('Total con esta opción');
    // El costo interno nunca sale.
    expect(textos).not.toContain('123.45');
  });

  it('en modo kit junta unidad, cantidad y precio en una sola celda', async () => {
    const lineas = [linea('CCTV', 'Cámara', 700), linea('CCTV', 'Cable', 300)];
    const textos = await textosDe(await generateCotizacionXlsx(cotizacion({ presentacion_precios: 'kit' }), lineas));
    expect(textos).toContain('Kit');
    expect(textos).not.toContain('Pza');
  });
});
