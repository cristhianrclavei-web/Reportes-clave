import { describe, expect, it } from 'vitest';
import {
  acomodar, conexionesRotas, datosGuiaSchema, equipoPrincipal, estadoDePrueba, experienciaPorTecnico, progresoDe,
  rangoDePrueba, textoConexion, tonosDeCable, type AvanceGuia,
} from './guias';
import { PLANTILLAS_BASE } from './guiasPlantillas';

const datos = PLANTILLAS_BASE[0].datos;
const marca = (por: string, nombre: string) => ({ por, nombre, en: '2026-11-11T10:00:00Z' });

describe('guías de conexión', () => {
  it('las plantillas de la app son válidas y no tienen conexiones al aire', () => {
    for (const plantilla of PLANTILLAS_BASE) {
      expect(datosGuiaSchema.safeParse(plantilla.datos).success, plantilla.nombre).toBe(true);
      expect(conexionesRotas(plantilla.datos), plantilla.nombre).toEqual([]);
    }
  });

  it('describe una conexión con sus bornes y su cable', () => {
    const boton = datos.conexiones.find((c) => c.id === 'c-boton-btn')!;
    expect(textoConexion(datos, boton)).toBe('Terminal · D6 · BTN → Botón de salida · NO, cable amarillo/gris');
  });

  it('un cable de dos colores da dos tonos; uno desconocido, gris', () => {
    expect(tonosDeCable('blanco/rojo')).toEqual(['#f8fafc', '#dc2626']);
    expect(tonosDeCable('turquesa')).toEqual(['#64748b']);
    expect(tonosDeCable(null)).toHaveLength(1);
  });

  it('avisa cuando una medición sale del rango', () => {
    const prueba = datos.pruebas[0];
    expect(estadoDePrueba(prueba, 12.1)).toBe('bien');
    expect(estadoDePrueba(prueba, 9.5)).toBe('fuera');
    expect(estadoDePrueba(prueba, null)).toBe('sin-medir');
    expect(rangoDePrueba(prueba)).toBe('11 a 13 V');
    expect(rangoDePrueba({ id: 'x', texto: 'x', unidad: 'Ω', max: 5 })).toBe('máx. 5 Ω');
  });

  it('el avance cuenta conexiones y pruebas, y no da por terminado con una medición mala', () => {
    const avance: AvanceGuia = { conexiones: {}, pruebas: {} };
    for (const c of datos.conexiones) avance.conexiones[c.id] = marca('u1', 'Ana');
    expect(progresoDe(datos, avance).porcentaje).toBe(82);
    avance.pruebas['p-alim'] = { ...marca('u1', 'Ana'), valor: 12 };
    avance.pruebas['p-chapa'] = { ...marca('u1', 'Ana'), valor: 8 };
    const progreso = progresoDe(datos, avance);
    expect(progreso.porcentaje).toBe(100);
    expect(progreso.pruebasFuera).toBe(1);
    expect(progreso.terminado).toBe(false);
  });

  it('saca quién ha trabajado en qué sistema', () => {
    const avance: AvanceGuia = { conexiones: { a: marca('u1', 'Ana'), b: marca('u1', 'Ana'), c: marca('u2', 'Beto') }, pruebas: {} };
    const lista = experienciaPorTecnico([
      { sistema: 'Control de acceso', es_plantilla: false, avance },
      { sistema: 'Control de acceso', es_plantilla: false, avance: { conexiones: { a: marca('u1', 'Ana') }, pruebas: {} } },
      { sistema: 'CCTV', es_plantilla: true, avance },
    ]);
    expect(lista).toEqual([
      { por: 'u1', nombre: 'Ana', sistema: 'Control de acceso', guias: 2, conexiones: 3 },
      { por: 'u2', nombre: 'Beto', sistema: 'Control de acceso', guias: 1, conexiones: 1 },
    ]);
  });

  it('acomoda el equipo con más cables a la izquierda y dibuja todos los cables', () => {
    expect(equipoPrincipal(datos)?.id).toBe('terminal');
    const acomodo = acomodar(datos);
    expect(acomodo.cajas[0].lado).toBe('izquierda');
    expect(acomodo.cajas).toHaveLength(datos.equipos.length);
    expect(acomodo.cables).toHaveLength(datos.conexiones.length);
    // Nada se sale del ancho del dibujo.
    for (const caja of acomodo.cajas) expect(caja.x + caja.ancho).toBeLessThanOrEqual(acomodo.ancho);
    // La fuente (bornes de arriba) queda antes que el botón (borne de abajo).
    const y = (id: string) => acomodo.cajas.find((c) => c.equipo.id === id)!.y;
    expect(y('fuente')).toBeLessThan(y('boton'));
  });
});
