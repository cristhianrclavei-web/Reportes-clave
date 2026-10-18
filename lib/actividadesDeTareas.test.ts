import { describe, it, expect } from 'vitest';
import { actividadesDelDia, fusionarActividades, ultimoAvance, RegistroDeTarea, TareaParaActividad } from './actividadesDeTareas';

const tarea = (id: string, extra: Partial<TareaParaActividad> = {}): TareaParaActividad => ({
  id, descripcion: `Tarea ${id}`, completada: false, avance_pct: 0, completada_en: null, ...extra,
});
const DIA1 = { id: 'd1', fecha: '2026-10-11' };
const DIA2 = { id: 'd2', fecha: '2026-10-12' };
const reg = (tarea_id: string, dia: { id: string; fecha: string }, avance_pct: number | null, hora = '15:00'): RegistroDeTarea => ({
  tarea_id, servicio_id: dia.id, fecha: dia.fecha, avance_pct, created_at: `${dia.fecha}T${hora}:00Z`,
});

describe('actividadesDelDia', () => {
  // Servicio de 3 días: el día 1 se terminan 1 y 2 y la 3 queda al 50%;
  // el día 2 se terminan la 4 y la 5 y también la 3.
  const tareas = [
    tarea('1', { completada: true, avance_pct: 100 }),
    tarea('2', { completada: true, avance_pct: 100 }),
    tarea('3', { completada: true, avance_pct: 100 }),
    tarea('4', { completada: true, avance_pct: 100 }),
    tarea('5', { completada: true, avance_pct: 100 }),
    tarea('6'),
  ];
  const registros = [
    reg('1', DIA1, 100), reg('2', DIA1, 100), reg('3', DIA1, 50),
    reg('3', DIA2, 100), reg('4', DIA2, 100), reg('5', DIA2, 100),
  ];

  it('el día 1 dice el avance que tenía ese día, aunque hoy la tarea ya esté terminada', () => {
    expect(actividadesDelDia(tareas, registros, DIA1)).toEqual(['Tarea 1', 'Tarea 2', 'Tarea 3 (avance 50%)']);
  });
  it('el día 2 solo trae lo de ese día', () => {
    expect(actividadesDelDia(tareas, registros, DIA2)).toEqual(['Tarea 3', 'Tarea 4', 'Tarea 5']);
  });
  it('la corrección del supervisor (último registro del día) manda, aunque baje el avance', () => {
    const corregidos = [...registros, reg('3', DIA1, 80, '23:00'), reg('2', DIA1, 0, '23:00')];
    expect(actividadesDelDia(tareas, corregidos, DIA1)).toEqual(['Tarea 1', 'Tarea 3 (avance 80%)']);
  });
  it('una foto sin porcentaje lleva el avance que ya traía', () => {
    expect(actividadesDelDia([tarea('3')], [reg('3', DIA1, 50), reg('3', DIA2, null)], DIA2)).toEqual(['Tarea 3 (avance 50%)']);
  });
  it('una foto a una tarea terminada en otro día no la repite', () => {
    expect(actividadesDelDia([tarea('1', { completada: true })], [reg('1', DIA1, 100), reg('1', DIA2, null)], DIA2)).toEqual([]);
  });
  it('tareas viejas sin registros por día: se usa la fecha en que se completaron', () => {
    const vieja = tarea('v', { completada: true, avance_pct: 100, completada_en: '2026-10-11T18:00:00Z' });
    expect(actividadesDelDia([vieja], [], DIA1)).toEqual(['Tarea v']);
    expect(actividadesDelDia([vieja], [], DIA2)).toEqual([]);
  });
});

describe('ultimoAvance', () => {
  it('toma el último por día y hora, no el mayor', () => {
    expect(ultimoAvance([reg('a', DIA1, 100, '10:00'), reg('a', DIA1, 60, '12:00')])).toBe(60);
    expect(ultimoAvance([reg('a', DIA2, 30), reg('a', DIA1, 90)])).toBe(30);
    expect(ultimoAvance([reg('a', DIA1, null)])).toBeNull();
  });
});

describe('fusionarActividades', () => {
  const descripciones = new Map([['3', ['Tarea 3']], ['2', ['Tarea 2']], ['9', ['Cablear', 'Cableado nuevo']]]);
  it('reemplaza en su lugar, quita lo que ya no aplica, respeta lo escrito a mano y agrega lo nuevo', () => {
    const actuales = ['Tarea 2', 'Se revisó el panel', 'Tarea 3 (avance 50%)', ''];
    const nuevas = new Map([['3', 'Tarea 3 (avance 80%)'], ['9', 'Cableado nuevo']]);
    expect(fusionarActividades(actuales, descripciones, nuevas)).toEqual(['Se revisó el panel', 'Tarea 3 (avance 80%)', 'Cableado nuevo']);
  });
  it('reconoce la línea con el nombre anterior de la tarea', () => {
    expect(fusionarActividades(['Cablear (avance 20%)'], descripciones, new Map([['9', 'Cableado nuevo (avance 40%)']])))
      .toEqual(['Cableado nuevo (avance 40%)']);
  });
});

describe('sin ver los días anteriores (técnico que no estuvo)', () => {
  it('una foto a una tarea completada antes de este día no la repite', () => {
    const t = tarea('1', { completada: true, avance_pct: 100, completada_en: '2026-10-11T18:00:00Z' });
    expect(actividadesDelDia([t], [reg('1', DIA2, null)], DIA2)).toEqual([]);
  });
});
