import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { reporteAvancePdf } from './reporteAvancePdf';
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

  it('pone el plano completo en una hoja carta horizontal', async () => {
    const bytes = await reporteAvancePdf({
      cliente: 'Cliente', empresa: 'Clave',
      planos: [{ plano: { ...plano('n1', 'Nivel 1'), ancho: 3000, alto: 1170 }, avance: {}, pdfOriginal: null, fondoPng: PNG, etiquetas: new Map() }],
    });
    const doc = await PDFDocument.load(bytes);
    const ultima = doc.getPage(doc.getPageCount() - 1);
    expect(ultima.getSize()).toEqual({ width: 792, height: 612 });
  });
});
