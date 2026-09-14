import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { generateReportXlsx } from './generateReportXlsx';

// Estas pruebas generan el Excel de verdad (con la plantilla real embebida en
// base64) y lo vuelven a leer con ExcelJS para revisar el resultado. No hay
// red ni Supabase de por medio — solo el mismo cálculo que corre en
// producción — así que sirven como red real contra "se rompe callado".

function baseReport(overrides: Partial<Parameters<typeof generateReportXlsx>[0]> = {}) {
  return {
    id: 'r1',
    created_at: '2026-09-10T12:00:00-06:00',
    empresa_cliente: 'Cliente de prueba',
    fecha: '2026-09-10',
    tipo_servicio: null,
    sub_tipo_servicio: null,
    data: {},
    profiles: undefined,
    ...overrides,
  };
}

async function generarYLeer(overrides: Partial<Parameters<typeof generateReportXlsx>[0]> = {}) {
  const buf = await generateReportXlsx(baseReport(overrides));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const sheet = wb.getWorksheet('REPORTE')!;
  return sheet;
}

describe('generateReportXlsx', () => {
  it('no truena con un reporte casi vacío', async () => {
    const buf = await generateReportXlsx(baseReport());
    expect(buf.length).toBeGreaterThan(0);
  });

  it('usa el personal manual (Ing a cargo + adicional) antes que el técnico de la cuenta', async () => {
    const sheet = await generarYLeer({
      data: { personal: ['Juan Pérez', 'Ana López'] },
      profiles: { full_name: 'Cuenta que no debería aparecer' },
    });
    expect(sheet.getCell('B9').value).toBe('Juan Pérez');
    expect(sheet.getCell('B10').value).toBe('Ana López');
  });

  it('cae al técnico de la cuenta cuando no hay personal manual', async () => {
    const sheet = await generarYLeer({
      data: {},
      profiles: [{ full_name: 'Técnico de la cuenta' }],
    });
    expect(sheet.getCell('B9').value).toBe('Técnico de la cuenta');
  });

  it('"Otro" tipo de servicio reemplaza el texto de la celda con la aclaración', async () => {
    const sheet = await generarYLeer({
      tipo_servicio: 'Otro',
      data: { tipoServicioOtroTexto: 'Diagnóstico especial' },
    });
    const cell = sheet.getCell('F20');
    expect(cell.value).toBe('Otro: Diagnóstico especial');
    expect(cell.font?.bold).toBe(true);
  });

  it('un tipo de servicio normal solo resalta la celda, sin tocar su texto', async () => {
    const sheet = await generarYLeer({ tipo_servicio: 'Mantenimiento' });
    expect(sheet.getCell('D20').font?.bold).toBe(true);
  });

  it('sin casoPuntos, oculta todo el bloque de caso de problema', async () => {
    const sheet = await generarYLeer({ data: {} });
    for (let r = 55; r <= 67; r++) {
      expect(sheet.getRow(r).hidden).toBe(true);
    }
  });

  it('con casoPuntos, muestra el bloque y numera cada punto por su posición original', async () => {
    const sheet = await generarYLeer({
      data: {
        casoPuntos: [
          { definicion: 'Falla intermitente' },
          { definicion: 'Cámara sin señal', descripcion: 'Se revisó el switch' },
        ],
      },
    });
    expect(sheet.getRow(55).hidden).toBeFalsy();
    // Fila 57: contenido de "definicion". Ambos puntos la tienen.
    expect(sheet.getCell('A57').value).toBe('1. Falla intermitente\n2. Cámara sin señal');
    // Fila 59: contenido de "descripcion". Solo el punto 2 la tiene, pero
    // conserva su número de posición (2), no se recorre a 1.
    expect(sheet.getCell('A59').value).toBe('2. Se revisó el switch');
  });

  it('prefiere data.cables sobre los campos viejos cable1/cable2', async () => {
    const sheet = await generarYLeer({
      data: {
        cables: [{ tipo: 'THHN', calibre: '12', metros: '50' }],
        cable1: { tipo: 'NO DEBERÍA APARECER' },
      },
    });
    expect(sheet.getCell('B29').value).toBe('THHN');
  });

  it('sin data.cables, cae a los campos viejos cable1 (izquierda) y cable2 (derecha)', async () => {
    const sheet = await generarYLeer({
      data: {
        cable1: { tipo: 'THHN' },
        cable2: { tipo: 'XHHW' },
      },
    });
    expect(sheet.getCell('B29').value).toBe('THHN');
    expect(sheet.getCell('F29').value).toBe('XHHW');
  });

  it('limita el listado de equipo a 8 filas, sin derramarse a la siguiente sección', async () => {
    const equipos = Array.from({ length: 10 }, (_, i) => ({ desc: `Equipo ${i + 1}` }));
    const sheet = await generarYLeer({ data: { equipos } });
    expect(sheet.getCell('C34').value).toBe('Equipo 1');
    expect(sheet.getCell('C41').value).toBe('Equipo 8');
    expect(sheet.getCell('C42').value).toBeFalsy();
  });

  it('limita las actividades a 11 filas numeradas, sin invadir el bloque de caso de problema', async () => {
    const actividades = Array.from({ length: 13 }, (_, i) => `Actividad ${i + 1}`);
    const sheet = await generarYLeer({ data: { actividades } });
    expect(sheet.getCell('A44').value).toBe('1. Actividad 1');
    expect(sheet.getCell('A54').value).toBe('11. Actividad 11');
    expect(sheet.getCell('A55').value).not.toBe('12. Actividad 12');
  });

  it('encoge la fuente cuando el texto no cabe, y usa el tamaño base cuando sí', async () => {
    const corto = await generarYLeer({ data: { claveFormato: 'CRM1' } });
    expect(corto.getCell('G8').font?.size).toBe(10);

    const largo = await generarYLeer({ data: { claveFormato: 'CRM-EXPEDIENTE-MUY-LARGO-0000000001' } });
    expect(largo.getCell('G8').font?.size).toBeLessThan(10);
  });

  it('usa CRM0851 como folio por defecto si el reporte no trae claveFormato', async () => {
    const sheet = await generarYLeer({ data: {} });
    expect(sheet.getCell('G8').value).toBe('CRM0851');
  });

  it('no intenta insertar una firma si el dato no es una imagen data:', async () => {
    // Antes de guardar firmas, algunos reportes viejos traían el nombre como
    // valor de la firma (bug ya corregido en captura). No debe truene el xlsx.
    const buf = await generateReportXlsx(
      baseReport({ data: { firmaIngNombre: 'Ing. Prueba', firmaIngData: 'no-es-una-imagen' } })
    );
    expect(buf.length).toBeGreaterThan(0);
  });
});
