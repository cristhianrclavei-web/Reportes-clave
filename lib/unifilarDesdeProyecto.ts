'use client';

import { createClient } from './supabaseClient';
import type { Proyecto } from './proyectos';
import type { DatosSolar } from './solar';
import { descripcionPorOmision, esInversor, plantilla, sugerirCalibre, type DatosUnifilar, type TipoSistema } from './unifilar';
import { crearUnifilar, datosDelCliente } from './unifilaresDatos';

// Unifilar (interconectado, híbrido o aislado) armado desde el
// dimensionamiento del proyecto: los módulos se
// reparten en 1 o 2 cadenas (una por MPPT), el inversor toma los kW del
// sistema y el cuadro del plano lleva el cliente y la dirección. Lo demás
// (calibres, metros, protecciones) se ajusta en el editor.

// Cadenas de hasta 12 módulos: con módulos de ~49.5 V de Voc quedan en
// 594 V, abajo de los 600 V de un inversor residencial. La revisión del
// editor avisa si el inversor elegido no los aguanta.
const MAXIMO_EN_SERIE = 12;

export function repartirCadenas(modulos: number): number[] {
  if (modulos <= MAXIMO_EN_SERIE) return [modulos];
  const cadenas = Math.ceil(modulos / MAXIMO_EN_SERIE);
  const base = Math.floor(modulos / cadenas);
  const sobran = modulos % cadenas;
  return Array.from({ length: cadenas }, (_, i) => base + (i < sobran ? 1 : 0));
}

export function unifilarDeProyecto(datos: Pick<DatosSolar, 'modulo_w' | 'inversor'>, modulos: number, kwp: number, nuevoId: () => string, tipo: TipoSistema = 'interconectado'): DatosUnifilar {
  const d = plantilla(tipo, nuevoId);
  const cadenas = repartirCadenas(modulos);
  const arreglos = d.equipos.filter((e) => e.tipo === 'arreglo');
  const inversor = d.equipos.find((e) => esInversor(e.tipo));
  const fusibles = d.equipos.find((e) => e.tipo === 'fusibles');
  // La plantilla trae 2 arreglos: con una sola cadena se quita el segundo.
  if (cadenas.length === 1 && arreglos[1]) {
    const quitar = arreglos[1].id;
    d.equipos = d.equipos.filter((e) => e.id !== quitar);
    d.tramos = d.tramos.filter((t) => t.a.equipo !== quitar && t.b.equipo !== quitar);
    // Su vía de fusibles y su MPPT también sobran.
    d.tramos = d.tramos.filter((t) => !(fusibles && t.a.equipo === fusibles.id && t.a.puerto === 'salida2'));
    if (fusibles) fusibles.valores.vias = '1';
    if (inversor) {
      inversor.valores.mppts = '1';
      for (const t of d.tramos) {
        if (t.b.equipo === inversor.id && t.b.puerto === 'mppt2') t.b = { ...t.b, puerto: 'mppt1' };
      }
    }
  }
  arreglos.slice(0, Math.min(2, cadenas.length)).forEach((a, i) => {
    a.valores.serie = String(cadenas[i]);
    a.valores.paralelo = '1';
    if (datos.modulo_w) a.valores.watts = String(datos.modulo_w);
  });
  // Más de 2 cadenas: la segunda lleva las demás en paralelo.
  if (cadenas.length > 2 && arreglos[1]) arreglos[1].valores.paralelo = String(cadenas.length - 1);
  if (inversor) {
    inversor.valores.potencia = String(Math.max(1, Math.round(kwp * 10) / 10));
    if (datos.inversor) inversor.modelo = datos.inversor.slice(0, 80);
  }
  // Con la potencia real cambian las corrientes: cada tramo toma el calibre
  // más delgado que aguanta y deja la caída dentro del límite.
  for (const t of d.tramos) {
    const calibre = sugerirCalibre(d, t);
    if (calibre) t.conductores = t.conductores.map((c) => (/^CPT/i.test(c.funcion) ? c : { ...c, calibre }));
  }
  return d;
}

export async function crearUnifilarDesdeProyecto({ proyecto, clienteNombre, datos, modulos, kwp, tipo = 'interconectado' }: {
  proyecto: Proyecto;
  tipo?: TipoSistema;
  clienteNombre: string;
  datos: DatosSolar;
  modulos: number;
  kwp: number;
}): Promise<string> {
  if (modulos < 1) throw new Error('Primero dimensiona el sistema (módulos y watts).');
  const d = unifilarDeProyecto(datos, modulos, kwp, () => crypto.randomUUID(), tipo);
  d.proyecto.descripcion = descripcionPorOmision(tipo);
  d.proyecto.fecha = new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }).toUpperCase();
  const cliente = await datosDelCliente(proyecto.cliente_id);
  if (cliente) Object.assign(d.proyecto, cliente);
  if (datos.direccion_servicio) d.proyecto.direccion = datos.direccion_servicio;
  const id = await crearUnifilar({ nombre: `${clienteNombre} · ${proyecto.nombre}`.slice(0, 120), tipo, cliente_id: proyecto.cliente_id, datos: d });
  // La liga al proyecto va aparte: el alta de unifilares no la conoce.
  const { error } = await createClient().from('unifilares').update({ proyecto_id: proyecto.id }).eq('id', id);
  if (error) throw new Error('El unifilar se creó pero no quedó en el proyecto. Muévelo desde la ficha del cliente.');
  return id;
}
