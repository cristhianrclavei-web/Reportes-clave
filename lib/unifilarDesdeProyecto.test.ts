import { describe, expect, it } from 'vitest';
import { repartirCadenas, unifilarDeProyecto } from './unifilarDesdeProyecto';
import { datosArreglo, kwpTotal, mpptDeArreglo, revisar } from './unifilar';

let n = 0;
const id = () => `u${n++}`;

describe('unifilar desde el proyecto', () => {
  it('reparte los módulos en cadenas parejas', () => {
    expect(repartirCadenas(9)).toEqual([9]);
    expect(repartirCadenas(14)).toEqual([7, 7]);
    expect(repartirCadenas(17)).toEqual([9, 8]);
    expect(repartirCadenas(30)).toEqual([10, 10, 10]);
  });

  it('una sola cadena: un arreglo, un MPPT, sin errores', () => {
    const d = unifilarDeProyecto({ modulo_w: 550, inversor: 'Solis 5K' }, 10, 5.5, id);
    const arreglos = d.equipos.filter((e) => e.tipo === 'arreglo');
    expect(arreglos).toHaveLength(1);
    expect(datosArreglo(arreglos[0]).modulos).toBe(10);
    expect(mpptDeArreglo(d, arreglos[0])?.mppt).toBe('MPPT1');
    expect(revisar(d).filter((a) => a.nivel === 'error')).toEqual([]);
  });

  it('dos cadenas suman los módulos del sistema y no pasan del voltaje', () => {
    const d = unifilarDeProyecto({ modulo_w: 550, inversor: null }, 14, 7.7, id);
    expect(kwpTotal(d)).toBeCloseTo(7.7);
    expect(revisar(d).filter((a) => a.nivel === 'error')).toEqual([]);
  });
});
