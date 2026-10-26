import { describe, it, expect } from 'vitest';
import { plazoDelProyecto, enRiesgo, agruparPorProyecto, resumenPlazos, DiaPlazo } from './plazosProyecto';

// Un día de proyecto con lo mínimo; lo demás se ajusta en cada prueba.
function dia(grupo: string, n: number, extra: Partial<DiaPlazo> = {}): DiaPlazo {
  return {
    id: `${grupo}-${n}`, grupo_id: grupo, proyecto: `Proyecto ${grupo}`, fecha: `2026-10-${String(10 + n).padStart(2, '0')}`,
    numero_dia: n, estado: 'concluido', resultado: 'terminado', resultado_motivo: null, dias_planeados: 3, ampliacion_motivo: null,
    ...extra,
  };
}

describe('plazoDelProyecto', () => {
  it('terminó en los días cotizados', () => {
    const p = plazoDelProyecto([dia('a', 1), dia('a', 2), dia('a', 3)]);
    expect(p.estado).toBe('a_tiempo');
    expect(p.extra).toBe(0);
  });

  it('terminó antes: cerró anticipado y se cancelaron días', () => {
    const p = plazoDelProyecto([dia('a', 1), dia('a', 2), dia('a', 3, { estado: 'cancelado' })]);
    expect(p.estado).toBe('antes');
  });

  it('desfase por causa ajena: 1 día extra por clima', () => {
    const p = plazoDelProyecto([dia('a', 1), dia('a', 2), dia('a', 3), dia('a', 4, { ampliacion_motivo: 'clima' })]);
    expect(p.estado).toBe('desfase_externo');
    expect(p).toMatchObject({ extra: 1, extraExternos: 1, extraPropios: 0 });
  });

  it('desfase propio: basta un día extra por retrabajo', () => {
    const p = plazoDelProyecto([
      dia('a', 1), dia('a', 2), dia('a', 3),
      dia('a', 4, { ampliacion_motivo: 'permiso' }),
      dia('a', 5, { ampliacion_motivo: 'retrabajo' }),
    ]);
    expect(p.estado).toBe('desfase_propio');
    expect(p).toMatchObject({ extra: 2, extraExternos: 1, extraPropios: 1 });
  });

  it('un día extra sin motivo cuenta como propio', () => {
    const p = plazoDelProyecto([dia('a', 1), dia('a', 2), dia('a', 3), dia('a', 4)]);
    expect(p.estado).toBe('desfase_propio');
    expect(p.motivosExtra).toEqual([{ clave: 'sin_motivo', origen: 'propio', dias: 1 }]);
  });

  it('proyecto anterior al parche: sin medir', () => {
    expect(plazoDelProyecto([dia('a', 1, { dias_planeados: null })]).estado).toBe('sin_medir');
  });

  it('en curso y último día con trabajo pendiente: falta ampliar con el motivo del técnico', () => {
    const p = plazoDelProyecto([dia('a', 1), dia('a', 2), dia('a', 3, { resultado: 'pendiente', resultado_motivo: 'permiso' }), dia('a', 4, { estado: 'cancelado' })]);
    expect(p.faltaAmpliar).toEqual({ motivo: 'permiso', diaId: 'a-3' });
    // No cuenta como terminado (ni «a tiempo») mientras no se amplíe.
    expect(p.terminado).toBe(false);
    expect(p.estado).toBe('en_curso');
    expect(enRiesgo(p, 90)).toBe(true);
  });
});

describe('enRiesgo', () => {
  const enCurso = (concluidos: number, planeados = 4) => plazoDelProyecto(
    Array.from({ length: planeados }, (_, i) => dia('a', i + 1, { dias_planeados: planeados, estado: i < concluidos ? 'concluido' : 'programado' }))
  );
  it('a la mitad del plazo con 20 % de avance va en riesgo', () => {
    expect(enRiesgo(enCurso(2), 20)).toBe(true);
  });
  it('a la mitad del plazo con 40 % va bien (margen de 20 puntos)', () => {
    expect(enRiesgo(enCurso(2), 40)).toBe(false);
  });
  it('antes de trabajar el primer día no se juzga', () => {
    expect(enRiesgo(enCurso(0), 0)).toBe(false);
  });
});

describe('resumenPlazos', () => {
  it('cuenta, separa causas y deja fuera lo ajeno del cumplimiento', () => {
    const proyectos = agruparPorProyecto([
      dia('a', 1), dia('a', 2), dia('a', 3),
      dia('b', 1), dia('b', 2), dia('b', 3), dia('b', 4, { ampliacion_motivo: 'clima' }),
      dia('c', 1), dia('c', 2), dia('c', 3), dia('c', 4, { ampliacion_motivo: 'olvido' }),
      dia('d', 1, { dias_planeados: null }),
      dia('e', 1, { estado: 'programado' }),
    ]);
    const r = resumenPlazos(proyectos, '2026-10-01', '2026-10-31');
    expect(r).toMatchObject({ terminados: 3, aTiempo: 1, desfaseExterno: 1, desfasePropio: 1, sinMedir: 1, diasExtraPropios: 1, diasExtraExternos: 1 });
    expect(Math.round(r.aTiempoPct!)).toBe(33);
    expect(r.cumplimientoPct).toBe(50);
    expect(r.motivos.map((m) => m.texto)).toEqual(['Clima', 'Se olvidó herramienta o equipo']);
  });
});
