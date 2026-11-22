import { describe, expect, it } from 'vitest';
import {
  caidaDeTension, conductoresPorOmision, sugerirCalibre, datosArreglo, electricoDeTramo, kwpTotal, leerDatos, lineasDeEquipo,
  mpptDeArreglo, nuevoEquipo, nuevoTramo, plantilla, revisar, textoConductor, datosUnifilarSchema,
  type DatosUnifilar,
} from './unifilar';
import { dibujarDiagrama, rutaDeTramo } from './unifilarDibujo';

let n = 0;
const nuevoId = () => `id${n++}`;

describe('arreglo', () => {
  it('calcula P, Voc e Imax como en el plano de CFE', () => {
    const e = nuevoEquipo('arreglo', 0, 0, nuevoId);
    e.valores = { ...e.valores, watts: '630', serie: '9', paralelo: '1', voc: '53.28', isc: '16.2', factorVoc: '1' };
    const a = datosArreglo(e);
    expect(a.kwp).toBeCloseTo(5.67);
    expect(a.vocMax).toBeCloseTo(479.52);
    expect(a.imax).toBeCloseTo(20.25);
  });
});

describe('tramos', () => {
  it('la caída de tensión de un tramo de CD sale de los paneles', () => {
    const d: DatosUnifilar = plantilla('interconectado', nuevoId);
    const primero = d.tramos[0];
    expect(primero.circuito).toBe('cd');
    const { voltaje, corriente } = electricoDeTramo(d, primero);
    expect(voltaje).toBeGreaterThan(0);
    expect(corriente).toBeCloseTo(17.5);
    // 2 × 50 m × 17.5 A × 3.97 Ω/km / 1000 = 6.95 V
    expect(caidaDeTension(d, primero)).toBeCloseTo((6.9475 / voltaje) * 100, 3);
  });

  it('el tramo de CA toma la corriente del inversor a través del tablero', () => {
    const d = plantilla('interconectado', nuevoId);
    const salida = d.tramos.find((t) => t.titulo === 'Circuito de salida inversor')!;
    expect(salida.circuito).toBe('2f');
    expect(electricoDeTramo(d, salida).corriente).toBeCloseTo(8000 / 220);
    const alimentador = d.tramos.find((t) => t.titulo === 'Alimentador principal')!;
    expect(electricoDeTramo(d, alimentador).corriente).toBeCloseTo(8000 / 220);
  });

  it('lo capturado a mano gana sobre lo calculado', () => {
    const d = plantilla('interconectado', nuevoId);
    const t = { ...d.tramos[0], voltaje: '400', corriente: '10', metros: '100' };
    expect(caidaDeTension(d, t)).toBeCloseTo((2 * 100 * 10 * 3.97) / 1000 / 400 * 100);
  });

  it('un tramo al puerto de tierra es de tierra', () => {
    const d = plantilla('interconectado', nuevoId);
    const arreglo = d.equipos.find((e) => e.tipo === 'arreglo')!;
    const tierra = d.equipos.find((e) => e.tipo === 'tierra')!;
    const t = nuevoTramo(d, { equipo: arreglo.id, puerto: 'tierra' }, { equipo: tierra.id, puerto: 'conexion' }, nuevoId);
    expect(t.tierra).toBe(true);
    expect(t.conductores[0].funcion).toBe('CPT');
  });

  it('texto del conductor', () => {
    expect(textoConductor(conductoresPorOmision('cd', false)[0])).toBe('Positivo: 10 AWG XLPE - 5.26 mm² Rojo');
  });
});

describe('plantillas', () => {
  it('cada plantilla es válida, se dibuja y conecta los arreglos a un MPPT', () => {
    for (const tipo of ['interconectado', 'aislado', 'hibrido'] as const) {
      const d = plantilla(tipo, nuevoId);
      expect(datosUnifilarSchema.safeParse(d).success).toBe(true);
      expect(d.tramos.every((t) => rutaDeTramo(d, t))).toBe(true);
      expect(dibujarDiagrama(d).length).toBeGreaterThan(20);
      for (const a of d.equipos.filter((e) => e.tipo === 'arreglo')) expect(mpptDeArreglo(d, a)?.mppt).toMatch(/^MPPT\d$/);
      expect(revisar(d).filter((x) => x.nivel === 'error')).toEqual([]);
    }
    const d = plantilla('interconectado', nuevoId);
    expect(kwpTotal(d)).toBeCloseTo(17 * 0.55);
    expect(lineasDeEquipo(d, d.equipos[0])[0]).toBe('P máx (MPPT2) = 4.95 kWp');
  });

  it('avisa si el Voc pasa del máximo del inversor', () => {
    const d = plantilla('interconectado', nuevoId);
    d.equipos[0].valores.serie = '14';
    expect(revisar(d).some((x) => x.nivel === 'error' && /Voc/.test(x.texto))).toBe(true);
  });

  it('leerDatos completa datos viejos', () => {
    const d = leerDatos({ equipos: [{ id: 'a', tipo: 'cfe', x: 0, y: 0, nombre: '', modelo: '', valores: {} }] });
    expect(d.equipos[0].etiqueta).toEqual({ dx: 0, dy: 0 });
    expect(d.proyecto.tamano).toBe('carta');
  });
});

describe('sugerir calibre', () => {
  it('el más delgado que aguanta la corriente y la caída', () => {
    let n = 0;
    const d = plantilla('interconectado', () => `s${n++}`);
    const salida = d.tramos.find((t) => t.titulo === 'Circuito de salida inversor')!;
    // 36.4 A × 1.25 = 45.5 A → 8 AWG (50 A); a 20 m cae 1.66 %.
    expect(sugerirCalibre(d, salida)).toBe('8');
    // A 80 m con 8 AWG pasa del 3 %: sube a 6 o más.
    expect(['6', '4']).toContain(sugerirCalibre(d, { ...salida, metros: '80' }));
    expect(sugerirCalibre(d, { ...salida, metros: '' })).toBeNull();
  });
});
