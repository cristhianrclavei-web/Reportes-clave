import { describe, expect, it } from 'vitest';
import {
  colorDeAvance, contar, equiposEnRecuadro, instalados, leerAvance, marcaNueva, pasaFiltro, porcentaje,
  resumenPorEtapa, COLOR_BLOQUEADO, type AvancePlano,
} from './avancePlano';
import type { EquipoPlano } from './planos';

const equipo = (id: string, extra: Partial<EquipoPlano> = {}): EquipoPlano => ({ id, tipo: 'SH', x: 0, y: 0, ...extra });

describe('avancePlano', () => {
  it('ignora marcas que no se entienden', () => {
    const avance = leerAvance({ a: { estado: 'probado' }, b: { estado: 'volando' }, c: 'x' });
    expect(Object.keys(avance)).toEqual(['a']);
    expect(leerAvance(null)).toEqual({});
  });

  it('instalar quita el «no se puede instalar»; bloquear conserva el estado', () => {
    const bloqueada = marcaNueva({ estado: 'canalizado' }, { bloqueo: { motivo: 'Obra civil' } }, 'hoy');
    expect(bloqueada).toMatchObject({ estado: 'canalizado', bloqueo: { motivo: 'Obra civil' } });
    expect(colorDeAvance(bloqueada)).toBe(COLOR_BLOQUEADO);
    expect(marcaNueva(bloqueada, { estado: 'instalado' }, 'hoy').bloqueo).toBeNull();
    expect(marcaNueva(bloqueada, { estado: 'pendiente' }, 'hoy').bloqueo).toEqual({ motivo: 'Obra civil' });
  });

  it('cuenta por estado y por etapa, sin el panel', () => {
    const equipos = [equipo('a', { etapa: 1 }), equipo('b', { etapa: 1 }), equipo('c', { etapa: 4 }), equipo('d'), equipo('p', { tipo: 'FACP' })];
    const avance: AvancePlano = { a: { estado: 'probado' }, b: { estado: 'instalado' }, c: { estado: 'pendiente', bloqueo: { motivo: 'Obra civil' } } };
    const total = contar(equipos, avance);
    expect(total.total).toBe(4);
    expect(instalados(total)).toBe(2);
    expect(total.bloqueados).toBe(1);
    expect(porcentaje(total.porEstado.probado, total.total)).toBe(25);
    expect(resumenPorEtapa(equipos, avance).map((r) => [r.etapa, r.cuenta.total])).toEqual([[1, 2], [4, 1], [null, 1]]);
  });

  it('filtra por etapa y por lo que falta', () => {
    const avance: AvancePlano = { a: { estado: 'probado' } };
    expect(pasaFiltro(equipo('a', { etapa: 2 }), avance, { etapa: 2, soloFaltan: false })).toBe(true);
    expect(pasaFiltro(equipo('a', { etapa: 2 }), avance, { etapa: 2, soloFaltan: true })).toBe(false);
    expect(pasaFiltro(equipo('b', { etapa: 2 }), avance, { etapa: 'sin', soloFaltan: false })).toBe(false);
  });

  it('elige los equipos dentro del recuadro, en cualquier orden de esquinas', () => {
    const equipos = [equipo('a', { x: 5, y: 5 }), equipo('b', { x: 50, y: 50 })];
    expect(equiposEnRecuadro(equipos, [10, 10], [0, 0]).map((e) => e.id)).toEqual(['a']);
  });
});
