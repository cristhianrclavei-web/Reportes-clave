import { describe, expect, it } from 'vitest';
import {
  insigniaDe, necesitaAutorizacion, ordenarParaLista, porcentajes, resumenPorLazo, siguienteEstado, errorDeBloqueo,
  colorDeAvance, contar, equiposEnRecuadro, alMenos, instalados, leerAvance, marcaNueva, pasaFiltro, porcentaje,
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
    // Lo probado también cuenta como direccionado.
    expect(alMenos(total, 'direccionado')).toBe(total.porEstado.direccionado + total.porEstado.probado);
    expect(total.bloqueados).toBe(1);
    // El bloqueado no cuenta en su estado.
    expect(total.porEstado.pendiente).toBe(1);
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

describe('avance: flujo y cuentas', () => {
  it('avanza un paso y pide autorización para probar sin direccionar', () => {
    expect(siguienteEstado('pendiente')).toBe('canalizado');
    expect(siguienteEstado('direccionado')).toBe('probado');
    expect(siguienteEstado('probado')).toBeNull();
    expect(necesitaAutorizacion('instalado', 'probado')).toBe(true);
    expect(necesitaAutorizacion('direccionado', 'probado')).toBe(false);
    expect(necesitaAutorizacion('probado', 'instalado')).toBe(false);
  });

  it('da los dos porcentajes sin contar lo que no se puede instalar', () => {
    // El ejemplo del Nivel -2: 25 equipos, 3 probados, 21 con algo de avance (18 + 3).
    const equipos = Array.from({ length: 25 }, (_, i) => equipo(`e${i}`));
    const avance: AvancePlano = {};
    for (let i = 0; i < 3; i++) avance[`e${i}`] = { estado: 'probado' };
    for (let i = 3; i < 21; i++) avance[`e${i}`] = { estado: 'canalizado' };
    expect(porcentajes(contar(equipos, avance))).toMatchObject({ probado: 12, avance: 84, aplicables: 25 });
    avance.e24 = { estado: 'pendiente', bloqueo: { motivo: 'Dañado', foto: 'lazos/x.jpg' } };
    expect(porcentajes(contar(equipos, avance))).toMatchObject({ aplicables: 24, probado: 13 });
  });

  it('letra y color: no depende solo del color', () => {
    expect(insigniaDe(undefined)).toMatchObject({ letra: 'P' });
    expect(insigniaDe({ estado: 'probado' })).toMatchObject({ letra: '✓' });
    expect(insigniaDe({ estado: 'instalado', bloqueo: { motivo: 'Dañado' } })).toMatchObject({ letra: '✕', color: COLOR_BLOQUEADO });
  });

  it('pide motivo, nota con «Otro» y foto para «no se puede instalar»', () => {
    expect(errorDeBloqueo({ motivo: '', nota: '', foto: null })).toContain('Elige');
    expect(errorDeBloqueo({ motivo: 'Otro', nota: '', foto: 'x' })).toContain('Otro');
    expect(errorDeBloqueo({ motivo: 'Sin acceso', nota: '', foto: null })).toContain('foto');
    expect(errorDeBloqueo({ motivo: 'Sin acceso', nota: '', foto: 'x' })).toBeNull();
  });

  it('ordena lo que falta primero y filtra por estado, lazo, tipo y dirección', () => {
    const equipos = [equipo('a', { etiqueta: 'L01D003' }), equipo('b', { etiqueta: 'L01D001' }), equipo('c', { etiqueta: 'L02D002', tipo: 'EMA' })];
    const avance: AvancePlano = { a: { estado: 'probado' }, b: { estado: 'instalado' } };
    expect(ordenarParaLista(equipos, avance, (e) => e.etiqueta || '').map((e) => e.id)).toEqual(['c', 'b', 'a']);
    const lazoDe = (e: EquipoPlano) => (e.id === 'c' ? 'lz2' : 'lz1');
    expect(equipos.filter((e) => pasaFiltro(e, avance, { etapa: 'todas', soloFaltan: false, lazo: 'lz1' }, lazoDe)).map((e) => e.id)).toEqual(['a', 'b']);
    expect(equipos.filter((e) => pasaFiltro(e, avance, { etapa: 'todas', soloFaltan: false, estado: 'instalado' })).map((e) => e.id)).toEqual(['b']);
    expect(equipos.filter((e) => pasaFiltro(e, avance, { etapa: 'todas', soloFaltan: false, tipo: 'EMA' })).map((e) => e.id)).toEqual(['c']);
    expect(equipos.filter((e) => pasaFiltro(e, avance, { etapa: 'todas', soloFaltan: false, texto: 'd00 1' })).map((e) => e.id)).toEqual(['b']);
    expect(resumenPorLazo(equipos, avance, (e) => ({ id: lazoDe(e), nombre: lazoDe(e).toUpperCase() })).map((r) => [r.nombre, r.cuenta.total])).toEqual([['LZ1', 2], ['LZ2', 1]]);
  });
});
