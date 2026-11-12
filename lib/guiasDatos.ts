'use client';

import { createClient } from './supabaseClient';
import { reducirFoto } from './reducirFoto';
import {
  AVANCE_VACIO, copiaDeDatos, datosGuiaSchema, guiaSchema, leerAvance, leerDatos,
  type AvanceGuia, type DatosGuia, type Guia, type Marca, type MarcaPrueba,
} from './guias';

// Datos de las guías de conexión (supabase/patch_guias_conexion.sql).
//
// El técnico marca las conexiones en campo, muchas veces sin señal: cada
// marca se guarda al momento en el teléfono y, si no hay señal, se anota en
// una cola que se sube después. La cola solo suelta una marca cuando el
// servidor confirma que la guardó. También se guarda una copia de cada guía
// abierta para poder verla sin señal.

const CLAVE_COLA = 'guiasPendientes';
const CLAVE_LISTA = 'guiasLista';
const claveCopia = (id: string) => `guia:${id}`;

type MarcaPendiente = { guiaId: string; tipo: 'conexiones' | 'pruebas'; item: string; valor: Marca | MarcaPrueba | null };

function esErrorDeRed(error: { message?: string; code?: string } | null | undefined): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (!error) return false;
  if (error.code) return false;
  return /fetch|network|load failed|timeout|conexi/i.test(error.message || '');
}

function mensajeError(error: { message?: string } | null | undefined, accion: string): string {
  const texto = error?.message || '';
  if (/does not exist|could not find the (table|function)|schema cache/i.test(texto)) return 'Las guías de conexión todavía no están activadas: falta correr supabase/patch_guias_conexion.sql en la base.';
  if (/row-level security|permission|unauthorized/i.test(texto)) return `No tienes permiso para ${accion}.`;
  if (/violates check constraint/i.test(texto)) return `No se pudo ${accion}: algún dato no es válido.`;
  if (/fetch|network|load failed|timeout/i.test(texto)) return `No se pudo ${accion}: sin conexión. Revisa tu señal e intenta de nuevo.`;
  return `No se pudo ${accion}. ${texto}`.trim();
}

function leerLocal<T>(clave: string, porOmision: T): T {
  try {
    const texto = localStorage.getItem(clave);
    return texto ? (JSON.parse(texto) as T) : porOmision;
  } catch {
    return porOmision;
  }
}

function guardarLocal(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Sin espacio en el teléfono: la app sigue, solo no queda copia sin señal.
  }
}

function aGuia(fila: any): Guia {
  return { ...fila, datos: leerDatos(fila.datos), avance: leerAvance(fila.avance) } as Guia;
}

// ---------- Lista ----------

export type GuiaResumen = Pick<Guia, 'id' | 'nombre' | 'sistema' | 'descripcion' | 'es_plantilla' | 'cliente_id' | 'servicio_grupo_id' | 'datos' | 'avance' | 'actualizado_en'>;

export async function listarGuias(): Promise<{ guias: Guia[]; sinConexion: boolean; faltaPatch: boolean }> {
  const { data, error } = await createClient().from('guias_conexion').select('*').order('actualizado_en', { ascending: false }).limit(500);
  if (error) {
    if (/does not exist|could not find the table|schema cache/i.test(error.message)) return { guias: [], sinConexion: false, faltaPatch: true };
    if (esErrorDeRed(error)) return { guias: leerLocal<any[]>(CLAVE_LISTA, []).map(aGuia), sinConexion: true, faltaPatch: false };
    throw new Error(mensajeError(error, 'cargar las guías'));
  }
  guardarLocal(CLAVE_LISTA, data);
  return { guias: (data || []).map(aGuia), sinConexion: false, faltaPatch: false };
}

// Las guías de un cliente (para el servicio y para anexar al reporte).
export async function guiasDelCliente(clienteId: string): Promise<Guia[]> {
  const { data, error } = await createClient().from('guias_conexion').select('*').eq('cliente_id', clienteId).order('actualizado_en', { ascending: false });
  if (error) {
    if (/does not exist|could not find the table|schema cache/i.test(error.message)) return [];
    if (esErrorDeRed(error)) return leerLocal<any[]>(CLAVE_LISTA, []).filter((g) => g.cliente_id === clienteId).map(aGuia);
    throw new Error(mensajeError(error, 'cargar las guías del cliente'));
  }
  return (data || []).map(aGuia);
}

// ---------- Una guía ----------

export async function leerGuia(id: string): Promise<{ guia: Guia; sinConexion: boolean }> {
  const { data, error } = await createClient().from('guias_conexion').select('*').eq('id', id).maybeSingle();
  if (error) {
    const copia = leerLocal<any | null>(claveCopia(id), null);
    if (copia && esErrorDeRed(error)) return { guia: conPendientes(aGuia(copia)), sinConexion: true };
    throw new Error(mensajeError(error, 'abrir la guía'));
  }
  if (!data) throw new Error('Esa guía ya no existe.');
  guardarLocal(claveCopia(id), data);
  return { guia: conPendientes(aGuia(data)), sinConexion: false };
}

// ---------- Crear, guardar y borrar ----------

export type GuiaNueva = {
  nombre: string;
  sistema: string;
  descripcion?: string | null;
  es_plantilla: boolean;
  cliente_id: string | null;
  servicio_grupo_id: string | null;
  datos: DatosGuia;
};

export async function crearGuia(nueva: GuiaNueva): Promise<Guia> {
  const meta = guiaSchema.safeParse(nueva);
  if (!meta.success) throw new Error(meta.error.issues[0].message);
  const datos = datosGuiaSchema.safeParse(nueva.datos);
  if (!datos.success) throw new Error(`La guía tiene un dato que no es válido: ${datos.error.issues[0].message}`);
  if (!nueva.es_plantilla && !nueva.cliente_id) throw new Error('Elige el cliente de la lista.');
  const { data, error } = await createClient().from('guias_conexion').insert({
    nombre: meta.data.nombre,
    sistema: meta.data.sistema,
    descripcion: meta.data.descripcion || null,
    es_plantilla: nueva.es_plantilla,
    cliente_id: nueva.es_plantilla ? null : nueva.cliente_id,
    servicio_grupo_id: nueva.es_plantilla ? null : nueva.servicio_grupo_id,
    datos: copiaDeDatos(datos.data as DatosGuia),
    avance: AVANCE_VACIO,
  }).select('*').single();
  if (error) throw new Error(mensajeError(error, 'crear la guía'));
  return aGuia(data);
}

export type CambiosGuia = { nombre: string; sistema: string; descripcion: string | null; servicio_grupo_id: string | null; datos: DatosGuia };

// Guarda el dibujo (equipos, conexiones, pruebas, notas). El avance no se toca aquí.
export async function guardarGuia(id: string, cambios: CambiosGuia): Promise<Guia> {
  const meta = guiaSchema.safeParse(cambios);
  if (!meta.success) throw new Error(meta.error.issues[0].message);
  const datos = datosGuiaSchema.safeParse(cambios.datos);
  if (!datos.success) throw new Error(`Revisa la guía: ${datos.error.issues[0].message}`);
  const { data, error } = await createClient().from('guias_conexion').update({
    nombre: meta.data.nombre,
    sistema: meta.data.sistema,
    descripcion: meta.data.descripcion || null,
    servicio_grupo_id: cambios.servicio_grupo_id,
    datos: datos.data,
    actualizado_en: new Date().toISOString(),
  }).eq('id', id).select('*').single();
  if (error) throw new Error(mensajeError(error, 'guardar la guía'));
  guardarLocal(claveCopia(id), data);
  return conPendientes(aGuia(data));
}

export async function borrarGuia(id: string): Promise<void> {
  const { error, count } = await createClient().from('guias_conexion').delete({ count: 'exact' }).eq('id', id);
  if (error) throw new Error(mensajeError(error, 'borrar la guía'));
  if (count === 0) throw new Error('No tienes permiso para borrar la guía (solo supervisión).');
  try {
    localStorage.removeItem(claveCopia(id));
  } catch {
    // Sin acceso al almacenamiento: no pasa nada, la copia se queda huérfana.
  }
}

// ---------- Marcar conexiones y pruebas ----------

function cola(): MarcaPendiente[] {
  return leerLocal<MarcaPendiente[]>(CLAVE_COLA, []);
}

export function marcasPendientes(guiaId?: string): number {
  return cola().filter((m) => !guiaId || m.guiaId === guiaId).length;
}

// Lo que está en cola se ve ya aplicado, aunque todavía no suba.
function conPendientes(guia: Guia): Guia {
  const avance: AvanceGuia = leerAvance(guia.avance);
  for (const m of cola()) {
    if (m.guiaId !== guia.id) continue;
    if (m.valor === null) delete avance[m.tipo][m.item];
    else (avance[m.tipo] as Record<string, Marca>)[m.item] = m.valor;
  }
  return { ...guia, avance };
}

async function subirMarca(m: MarcaPendiente): Promise<{ ok: boolean; red: boolean; mensaje: string }> {
  const { error } = await createClient().rpc('marcar_guia_conexion', { p_guia: m.guiaId, p_tipo: m.tipo, p_item: m.item, p_valor: m.valor });
  if (!error) return { ok: true, red: false, mensaje: '' };
  return { ok: false, red: esErrorDeRed(error), mensaje: mensajeError(error, 'guardar la marca') };
}

// Marca o desmarca. Devuelve si quedó guardada en el servidor o en espera de señal.
export async function marcar(guiaId: string, tipo: 'conexiones' | 'pruebas', item: string, valor: Marca | MarcaPrueba | null): Promise<{ pendiente: boolean }> {
  const marca: MarcaPendiente = { guiaId, tipo, item, valor };
  // Primero a la cola (por si se cierra la app a media subida) y luego se intenta subir.
  const sinEsta = cola().filter((m) => !(m.guiaId === guiaId && m.tipo === tipo && m.item === item));
  guardarLocal(CLAVE_COLA, [...sinEsta, marca]);
  const resultado = await subirMarca(marca);
  if (resultado.ok) {
    guardarLocal(CLAVE_COLA, cola().filter((m) => m !== marca && !(m.guiaId === guiaId && m.tipo === tipo && m.item === item && JSON.stringify(m.valor) === JSON.stringify(valor))));
    return { pendiente: false };
  }
  if (resultado.red) return { pendiente: true };
  // El servidor la rechazó (permiso, guía borrada): no tiene caso reintentar.
  guardarLocal(CLAVE_COLA, cola().filter((m) => !(m.guiaId === guiaId && m.tipo === tipo && m.item === item)));
  throw new Error(resultado.mensaje);
}

// Sube lo que quedó en cola. Devuelve cuántas siguen pendientes.
export async function subirMarcasPendientes(): Promise<number> {
  for (const m of cola()) {
    const resultado = await subirMarca(m);
    // Sin señal: se deja todo como está y se reintenta después.
    if (!resultado.ok && resultado.red) break;
    // Guardada, o rechazada sin remedio: sale de la cola.
    guardarLocal(CLAVE_COLA, cola().filter((x) => !(x.guiaId === m.guiaId && x.tipo === m.tipo && x.item === m.item)));
  }
  return cola().length;
}

// ---------- Fotos «así debe quedar» ----------

export async function subirFotoGuia(guiaId: string, archivo: File): Promise<string> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('La foto necesita señal. Intenta cuando tengas señal.');
  const reducida = await reducirFoto(archivo);
  // Carpeta «lazos»: ya tiene sus permisos de almacenamiento (patch_lazos.sql).
  const path = `lazos/guias/${guiaId}/${Date.now()}.jpg`;
  const { error } = await createClient().storage.from('evidencias').upload(path, reducida, { contentType: reducida.type || 'image/jpeg' });
  if (error) throw new Error(mensajeError(error, 'subir la foto'));
  return path;
}

export async function urlDeFotoGuia(path: string): Promise<string | null> {
  const { data, error } = await createClient().storage.from('evidencias').createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

// ---------- Servicios del cliente (para pegar la guía a uno) ----------

export type ServicioParaGuia = { grupo_id: string; proyecto: string; fecha: string };

// Los proyectos del cliente, del más reciente al más viejo (uno por proyecto).
export async function serviciosDelCliente(clienteId: string): Promise<ServicioParaGuia[]> {
  const { data, error } = await createClient().from('servicios_programados')
    .select('grupo_id, proyecto, fecha').eq('cliente_id', clienteId).order('fecha', { ascending: false }).limit(60);
  if (error) throw new Error(mensajeError(error, 'cargar los servicios del cliente'));
  const vistos = new Set<string>();
  const lista: ServicioParaGuia[] = [];
  for (const s of (data || []) as ServicioParaGuia[]) {
    if (vistos.has(s.grupo_id)) continue;
    vistos.add(s.grupo_id);
    lista.push(s);
  }
  return lista;
}
