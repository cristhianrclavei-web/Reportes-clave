import { describe, it, expect } from 'vitest';
import { segmentosDelDia, minutosPorClaseTiempo, tramosLibres, claseDePausa } from './jornada';
import { estadisticasJornada } from './jornadaDatos';

// Horas del día como milisegundos (el día empieza en 0).
const h = (hora: number, min = 0) => (hora * 60 + min) * 60000;
const JORNADA = { inicio: h(8), fin: h(18) };

describe('segmentosDelDia', () => {
  it('lo de antes de salir y lo del final del día sin nada queda sin registrar', () => {
    const seg = segmentosDelDia({
      servicios: [{ id: 's', titulo: 'Bodega', inicio: h(9), fin: h(17), pausas: [] }],
      actividades: [{ id: 't', titulo: 'Traslado', tipo: 'traslado', inicio: h(8, 30), fin: h(9) }],
      jornada: JORNADA,
      tope: h(23),
    });
    expect(seg.map((s) => [s.clase, s.inicio / 60000, s.fin / 60000])).toEqual([
      ['sin_registrar', 480, 510],
      ['traslado', 510, 540],
      ['servicio', 540, 1020],
      ['sin_registrar', 1020, 1080],
    ]);
  });

  it('la comida y la salida por material se descuentan del servicio; la actividad de bitácora encima también', () => {
    const seg = segmentosDelDia({
      servicios: [{
        id: 's', titulo: 'Bodega', inicio: h(9), fin: h(17),
        pausas: [{ inicio: h(13), fin: h(14), tipo: 'comida' }, { inicio: h(15), fin: h(15, 20), tipo: 'material' }],
      }],
      actividades: [{ id: 'c', titulo: 'Compra en ferretería', tipo: 'compra', inicio: h(11), fin: h(11, 30) }],
      jornada: JORNADA,
      tope: h(23),
    });
    const minutos = minutosPorClaseTiempo(seg);
    expect(minutos.servicio).toBe(8 * 60 - 60 - 20 - 30);
    expect(minutos.comida).toBe(60);
    expect(minutos.compra).toBe(50);
    expect(minutos.sin_registrar).toBe(60 + 60);
  });

  it('hoy no cuenta más allá de «ahora»', () => {
    const seg = segmentosDelDia({
      servicios: [{ id: 's', titulo: 'Bodega', inicio: h(9), fin: null, pausas: [] }],
      actividades: [],
      jornada: JORNADA,
      tope: h(10),
    });
    expect(minutosPorClaseTiempo(seg)).toEqual({ sin_registrar: 60, servicio: 60 });
  });

  it('un día sin registros no tiene jornada que mostrar', () => {
    expect(segmentosDelDia({ servicios: [], actividades: [], jornada: JORNADA, tope: h(23) })).toEqual([]);
  });

  it('sin jornada (fin de semana) solo va de lo primero a lo último registrado', () => {
    const seg = segmentosDelDia({
      servicios: [],
      actividades: [{ id: 'a', titulo: 'Guardia', tipo: 'apoyo_cliente', inicio: h(10), fin: h(12) }],
      jornada: null,
      tope: h(23),
    });
    expect(minutosPorClaseTiempo(seg)).toEqual({ apoyo_cliente: 120 });
  });

  it('los huecos de menos de 5 minutos no cuentan', () => {
    const seg = segmentosDelDia({
      servicios: [],
      actividades: [
        { id: 'a', titulo: 'Oficina', tipo: 'oficina', inicio: h(8), fin: h(9) },
        { id: 'b', titulo: 'Traslado', tipo: 'traslado', inicio: h(9, 3), fin: h(18) },
      ],
      jornada: JORNADA,
      tope: h(23),
    });
    expect(seg.some((s) => s.clase === 'sin_registrar')).toBe(false);
  });
});

describe('tramosLibres', () => {
  it('quita lo ocupado y deja lo libre', () => {
    const libres = tramosLibres({ inicio: h(14), fin: h(15) }, [{ inicio: h(14, 20), fin: h(14, 40) }]);
    expect(libres).toEqual([{ inicio: h(14), fin: h(14, 20) }, { inicio: h(14, 40), fin: h(15) }]);
  });
  it('si todo está ocupado no queda nada', () => {
    expect(tramosLibres({ inicio: h(14), fin: h(15) }, [{ inicio: h(13), fin: h(16) }])).toEqual([]);
  });
});

describe('claseDePausa', () => {
  it('comida, material y el resto', () => {
    expect(claseDePausa('comida')).toBe('comida');
    expect(claseDePausa('material')).toBe('compra');
    expect(claseDePausa('espera_cliente')).toBe('pausa');
  });
});


describe('estadisticasJornada', () => {
  it('promedia por día con registro y saca porcentajes de la jornada', () => {
    const e = estadisticasJornada({ servicio: 600, traslado: 120, sin_registrar: 80 }, 2);
    expect(e.total).toBe(800);
    expect(e.registrado).toBe(720);
    expect(e.registradoPorDia).toBe(360);
    expect(e.servicioPorDia).toBe(300);
    expect(e.sinRegistrarPorDia).toBe(40);
    expect(e.pct('servicio')).toBe(75);
    expect(e.pct('sin_registrar')).toBe(10);
  });
  it('sin días no divide entre cero', () => {
    expect(estadisticasJornada({}, 0).registradoPorDia).toBe(0);
  });
});
