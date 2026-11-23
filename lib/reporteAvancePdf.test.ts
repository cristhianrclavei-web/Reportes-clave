import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { frasesDelResumen, reporteAvancePdf } from './reporteAvancePdf';
import { cuentaVacia } from './avancePlano';
import type { Plano } from './planos';

// PNG de 1×1 para la foto de evidencia.
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

function plano(id: string, nombre: string): Plano {
  return {
    id, cliente_id: 'c', nombre, pdf_path: 'lazos/planos/x', imagen_path: 'lazos/planos/x', pagina: 1, ancho: 100, alto: 100,
    metros_por_unidad: null, creado_en: '', actualizado_en: '',
    sembrado: { equipos: [{ id: 'a', tipo: 'SH', x: 1, y: 1, etiqueta: 'L01D001' }, { id: 'b', tipo: 'SH', x: 2, y: 2, etiqueta: 'L01D002' }], tuberias: [] },
  };
}

describe('reporte de avance', () => {
  it('se arma con portada, tablas, fotos y firmas aunque no haya fondo del plano', async () => {
    const bytes = await reporteAvancePdf({
      cliente: 'HSMCH Capital Norte',
      empresa: 'Clave',
      paneles: ['Panel Capital Norte'],
      lazoDe: (e) => ({ id: e.id === 'a' ? 'l1' : 'l2', nombre: e.id === 'a' ? 'SLC 1 · LZ1' : 'SLC 2 · LZ2' }),
      fotos: new Map([['lazos/planos/n1/avance/f.jpg', PNG]]),
      planos: [
        { plano: plano('n1', 'Nivel 1'), avance: { a: { estado: 'probado' }, b: { estado: 'pendiente', bloqueo: { motivo: 'Dañado', foto: 'lazos/planos/n1/avance/f.jpg' } } }, pdfOriginal: null, fondoPng: null, etiquetas: new Map() },
        { plano: plano('n2', 'Nivel -2'), avance: {}, pdfOriginal: null, fondoPng: null, etiquetas: new Map() },
      ],
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toContain('HSMCH');
  });

  it('pone el plano completo girado en una hoja carta vertical (se imprime a hoja completa)', async () => {
    const bytes = await reporteAvancePdf({
      cliente: 'Cliente', empresa: 'Clave',
      planos: [{ plano: { ...plano('n1', 'Nivel 1'), ancho: 3000, alto: 1170 }, avance: {}, pdfOriginal: null, fondoPng: PNG, etiquetas: new Map() }],
    });
    const doc = await PDFDocument.load(bytes);
    const ultima = doc.getPage(doc.getPageCount() - 1);
    expect(ultima.getSize()).toEqual({ width: 612, height: 792 });
    // El plano y el pie van dentro, sin páginas de más.
    expect(doc.getPages().every((p) => p.getWidth() === 612)).toBe(true);
  });

  it('dice el estado del proyecto en palabras', () => {
    const nivel1 = { ...cuentaVacia(), total: 10, bloqueados: 2, porEstado: { pendiente: 3, canalizado: 1, instalado: 1, direccionado: 1, probado: 2 } };
    const nivel2 = { ...cuentaVacia(), total: 4, porEstado: { pendiente: 0, canalizado: 0, instalado: 0, direccionado: 0, probado: 4 } };
    const total = { total: 14, bloqueados: 2, porEstado: { pendiente: 3, canalizado: 1, instalado: 1, direccionado: 1, probado: 6 } };
    const frases = frasesDelResumen(total, [{ nombre: 'Nivel 1', cuenta: nivel1 }, { nombre: 'Nivel 2', cuenta: nivel2 }], [['Falta plafón', 2]]);
    expect(frases[0]).toBe('El proyecto tiene 14 equipos. 6 de 12 ya están probados y funcionando (sin contar 2 equipos que no se pueden instalar).');
    expect(frases[1]).toBe('3 equipos están en proceso (ya tienen trabajo, falta terminarlos) y 3 no se han empezado.');
    expect(frases[2]).toContain('Falta plafón (2)');
    expect(frases[3]).toBe('Más avanzado: Nivel 2 (100% terminado). Más atrasado: Nivel 1 (25%).');
  });
});
