import { describe, expect, it } from 'vitest';
import { aplicarImportacion, compararImportacion } from './reimportarDxf';
import type { EquipoPlano } from './planos';

const eq = (id: string, tipo: string, x: number, y: number, etiqueta: string | null = null, extra: Partial<EquipoPlano> = {}): EquipoPlano =>
  ({ id, tipo, x, y, etiqueta, ...extra });

describe('reimportar el DXF', () => {
  const existentes = [
    eq('a', 'SH', 10, 10, 'L01D001', { elementoId: 'el-1', tamano: 0.75 }),
    eq('b', 'SH', 20, 10, 'L01D002'),
    eq('c', 'EMA', 30, 10, null),
    eq('d', 'SH', 40, 10, 'L01D004'),
    eq('panel', 'FACP', 0, 0, null, { panelId: 'p1' }),
  ];

  it('separa nuevos, actualizados, sin cambio y eliminados sin duplicar', () => {
    const importados = [
      eq('n1', 'SH', 15, 12, 'D001'), // misma dirección escrita sin lazo; se movió
      eq('n2', 'SH', 20, 10, 'L01D002'), // igual
      eq('n3', 'EMA', 30.1, 10, null), // por posición; 0.1 es redondeo
      eq('n4', 'SH', 60, 10, 'L01D005'), // nuevo
    ];
    const r = compararImportacion(existentes, importados, 3);
    expect(r.nuevos.map((e) => e.id)).toEqual(['n4']);
    expect(r.actualizados.map((c) => [c.anterior.id, c.motivo])).toEqual([['a', 'se movió']]);
    expect(r.sinCambio).toBe(2);
    expect(r.eliminados.map((e) => e.id)).toEqual(['d']);
  });

  it('dos direcciones distintas en el mismo lugar no se confunden', () => {
    const r = compararImportacion([eq('a', 'SH', 10, 10, 'L01D001')], [eq('n', 'SH', 10, 10, 'L01D009')], 3);
    expect(r.nuevos.map((e) => e.id)).toEqual(['n']);
    expect(r.eliminados.map((e) => e.id)).toEqual(['a']);
  });

  it('al aplicar conserva la liga, el tamaño y el panel', () => {
    const r = compararImportacion(existentes, [eq('n1', 'SC', 11, 10, 'L01D001', { rotacion: 90 })], 3);
    const final = aplicarImportacion(existentes, { nuevos: r.nuevos, actualizados: r.actualizados, eliminados: [] });
    const a = final.find((e) => e.id === 'a')!;
    expect([a.tipo, a.x, a.elementoId, a.tamano, a.rotacion]).toEqual(['SC', 11, 'el-1', 0.75, 90]);
    expect(final.some((e) => e.id === 'panel')).toBe(true);
    expect(final).toHaveLength(existentes.length);
  });
});
