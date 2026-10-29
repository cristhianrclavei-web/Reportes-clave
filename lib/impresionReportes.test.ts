import { describe, it, expect } from 'vitest';
import {
  rangoDelPeriodo, filtrarParaImprimir, ordenarParaImprimir, paginasEnBlancoDespues,
  FiltrosImpresion, ReporteImprimible,
} from './impresionReportes';

function reporte(parcial: Partial<ReporteImprimible> & { id: string }): ReporteImprimible {
  return {
    fecha: '2026-10-20',
    empresa_cliente: 'Cliente',
    tipo_servicio: 'Mantenimiento',
    created_by: 'tec-1',
    data: { firmaRevisionData: 'firma' },
    profiles: { full_name: 'Luis Hernández' },
    ...parcial,
  };
}

const TODO: FiltrosImpresion = {
  desde: '2026-01-01', hasta: '2026-12-31', texto: '', tecnicoId: '', tipo: '', estado: 'todos', soloSinImprimir: false,
};

describe('rangoDelPeriodo', () => {
  // 2026-10-28 es miércoles.
  it('semana de lunes a domingo, y la anterior', () => {
    expect(rangoDelPeriodo('semana', '2026-10-28')).toEqual({ desde: '2026-10-26', hasta: '2026-11-01' });
    expect(rangoDelPeriodo('semana_pasada', '2026-10-28')).toEqual({ desde: '2026-10-19', hasta: '2026-10-25' });
  });
  it('el domingo pertenece a la semana que empezó el lunes anterior', () => {
    expect(rangoDelPeriodo('semana', '2026-11-01')).toEqual({ desde: '2026-10-26', hasta: '2026-11-01' });
  });
  it('mes actual y mes pasado (cruza de año)', () => {
    expect(rangoDelPeriodo('mes', '2026-10-28')).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' });
    expect(rangoDelPeriodo('mes_pasado', '2026-01-15')).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
    expect(rangoDelPeriodo('mes_pasado', '2026-03-31')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
  });
  it('ayer cruza de mes', () => {
    expect(rangoDelPeriodo('ayer', '2026-11-01')).toEqual({ desde: '2026-10-31', hasta: '2026-10-31' });
  });
});

describe('filtrarParaImprimir', () => {
  const lista = [
    reporte({ id: 'a', empresa_cliente: 'Hospital García', fecha: '2026-10-20' }),
    reporte({ id: 'b', empresa_cliente: 'Plaza Norte', fecha: '2026-10-21', data: {} }),
    reporte({ id: 'c', empresa_cliente: 'Bodega Sur', fecha: '2026-09-30', created_by: 'tec-2' }),
  ];

  it('rango de fechas, estado y técnico', () => {
    const octubre = { ...TODO, desde: '2026-10-01', hasta: '2026-10-31' };
    expect(filtrarParaImprimir(lista, octubre, {}).map((r) => r.id)).toEqual(['a', 'b']);
    expect(filtrarParaImprimir(lista, { ...octubre, estado: 'revisados' }, {}).map((r) => r.id)).toEqual(['a']);
    expect(filtrarParaImprimir(lista, { ...octubre, estado: 'pendientes' }, {}).map((r) => r.id)).toEqual(['b']);
    expect(filtrarParaImprimir(lista, { ...TODO, tecnicoId: 'tec-2' }, {}).map((r) => r.id)).toEqual(['c']);
  });

  it('busca sin importar acentos y quita los ya impresos', () => {
    expect(filtrarParaImprimir(lista, { ...TODO, texto: 'garcia' }, {}).map((r) => r.id)).toEqual(['a']);
    const impresos = { a: { en: '2026-10-22T10:00:00Z', por: 'Braulio' } };
    expect(filtrarParaImprimir(lista, { ...TODO, soloSinImprimir: true }, impresos).map((r) => r.id)).toEqual(['b', 'c']);
  });
});

describe('ordenarParaImprimir', () => {
  it('por fecha del más antiguo al más reciente; empate por cliente', () => {
    const lista = [
      reporte({ id: '1', fecha: '2026-10-21', empresa_cliente: 'Zeta' }),
      reporte({ id: '2', fecha: '2026-10-20', empresa_cliente: 'Beta' }),
      reporte({ id: '3', fecha: '2026-10-20', empresa_cliente: 'Alfa' }),
    ];
    expect(ordenarParaImprimir(lista, 'fecha').map((r) => r.id)).toEqual(['3', '2', '1']);
    expect(ordenarParaImprimir(lista, 'cliente').map((r) => r.id)).toEqual(['3', '2', '1']);
  });
});

describe('paginasEnBlancoDespues', () => {
  it('solo a doble cara y cuando el reporte termina en página impar', () => {
    expect(paginasEnBlancoDespues(3, true)).toBe(1);
    expect(paginasEnBlancoDespues(4, true)).toBe(0);
    expect(paginasEnBlancoDespues(3, false)).toBe(0);
  });
});
