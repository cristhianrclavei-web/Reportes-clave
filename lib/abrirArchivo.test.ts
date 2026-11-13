import { describe, expect, it, vi } from 'vitest';

// El módulo importa piezas de navegador que aquí no hacen falta.
vi.mock('@/components/Toast', () => ({ showToast: () => {} }));
vi.mock('./rastreoUbicacion', () => ({ esAppAndroid: () => false }));
vi.mock('./supabaseClient', () => ({ createClient: () => ({}) }));

import { nombreDeEncabezado, nombreSeguro } from './abrirArchivo';

describe('abrirArchivo', () => {
  it('deja el nombre sin acentos ni espacios', () => {
    expect(nombreSeguro('reporte 2026 Lucía.pdf')).toBe('reporte-2026-Lucia.pdf');
    expect(nombreSeguro('¿?')).toBe('archivo');
  });

  it('saca el nombre del encabezado del servidor', () => {
    expect(nombreDeEncabezado('inline; filename="vale-123.pdf"', 'archivo.pdf')).toBe('vale-123.pdf');
    expect(nombreDeEncabezado('attachment; filename=reporte.xlsx', 'archivo.pdf')).toBe('reporte.xlsx');
    expect(nombreDeEncabezado(null, 'archivo.pdf')).toBe('archivo.pdf');
  });
});
