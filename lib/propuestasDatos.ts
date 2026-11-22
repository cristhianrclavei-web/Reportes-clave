'use client';

import { createClient } from './supabaseClient';
import { notificar } from './push';
import { sembradoSchema, leerSembrado } from './planos';
import { datosUnifilarSchema, leerDatos as leerDatosUnifilar } from './unifilar';
import { datosGuiaSchema, leerDatos as leerDatosGuia } from './guias';
import { compararPropuesta, fusionar, NOMBRE_DOCUMENTO, type Cambio, type TipoDocumento } from './propuestas';

// Datos de las propuestas de cambio y de las versiones
// (supabase/patch_propuestas_cambio.sql). El técnico guarda su copia aquí
// en vez de tocar el original; supervisión la revisa y fusiona. Sin señal,
// la copia queda en el teléfono y se sube al volver.

type Doc = Record<string, unknown>;

export type Propuesta = {
  id: string;
  tipo: TipoDocumento;
  objeto_id: string;
  base: Doc;
  datos: Doc;
  estado: 'borrador' | 'enviada' | 'aceptada' | 'parcial' | 'rechazada' | 'descartada';
  comentario: string | null;
  autor_id: string;
  creado_en: string;
  actualizado_en: string;
  enviada_en: string | null;
  revisado_por: string | null;
  revisado_en: string | null;
  respuesta: string | null;
  resultado: { clave: string; texto: string; aceptado: boolean }[] | null;
};

export type Version = { id: string; tipo: TipoDocumento; objeto_id: string; datos: Doc; nota: string | null; creado_por: string; creado_en: string };

function mensaje(error: { message?: string } | null | undefined, accion: string): string {
  const texto = error?.message || '';
  if (/does not exist|could not find the table|schema cache/i.test(texto)) return `No se pudo ${accion}: falta correr supabase/patch_propuestas_cambio.sql en la base.`;
  if (/row-level security|permission/i.test(texto)) return `No tienes permiso para ${accion}.`;
  if (/fetch|network|load failed|timeout/i.test(texto) || (typeof navigator !== 'undefined' && !navigator.onLine)) return `No se pudo ${accion}: sin conexión. Revisa tu señal e intenta de nuevo.`;
  return `No se pudo ${accion}. ${texto}`.trim();
}

// ---------- El original de cada tipo ----------

export type Original = { nombre: string; clienteId: string | null; doc: Doc };

export async function leerOriginal(tipo: TipoDocumento, id: string): Promise<Original> {
  const s = createClient();
  if (tipo === 'plano') {
    const { data, error } = await s.from('lazo_planos').select('nombre, cliente_id, sembrado, metros_por_unidad').eq('id', id).single();
    if (error || !data) throw new Error(mensaje(error, 'leer el plano'));
    const sembrado = leerSembrado(data.sembrado);
    return { nombre: data.nombre, clienteId: data.cliente_id, doc: { equipos: sembrado.equipos, tuberias: sembrado.tuberias, metros: data.metros_por_unidad } };
  }
  if (tipo === 'unifilar') {
    const { data, error } = await s.from('unifilares').select('nombre, cliente_id, datos').eq('id', id).single();
    if (error || !data) throw new Error(mensaje(error, 'leer el unifilar'));
    return { nombre: data.nombre, clienteId: data.cliente_id, doc: leerDatosUnifilar(data.datos) as unknown as Doc };
  }
  const { data, error } = await s.from('guias_conexion').select('nombre, cliente_id, datos').eq('id', id).single();
  if (error || !data) throw new Error(mensaje(error, 'leer la guía'));
  return { nombre: data.nombre, clienteId: data.cliente_id, doc: leerDatosGuia(data.datos) as unknown as Doc };
}

async function escribirOriginal(tipo: TipoDocumento, id: string, doc: Doc): Promise<void> {
  const s = createClient();
  if (tipo === 'plano') {
    const sembrado = sembradoSchema.safeParse({ equipos: doc.equipos, tuberias: doc.tuberias });
    if (!sembrado.success) throw new Error('La fusión dejó un dato del plano que no es válido. No se guardó nada.');
    const { error } = await s.from('lazo_planos').update({ sembrado: sembrado.data, metros_por_unidad: doc.metros ?? null }).eq('id', id);
    if (error) throw new Error(mensaje(error, 'guardar el plano'));
    return;
  }
  if (tipo === 'unifilar') {
    const datos = datosUnifilarSchema.safeParse(doc);
    if (!datos.success) throw new Error('La fusión dejó un dato del unifilar que no es válido. No se guardó nada.');
    const { error } = await s.from('unifilares').update({ datos: datos.data, actualizado_en: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(mensaje(error, 'guardar el unifilar'));
    return;
  }
  const datos = datosGuiaSchema.safeParse(doc);
  if (!datos.success) throw new Error('La fusión dejó un dato de la guía que no es válido. No se guardó nada.');
  const { error } = await s.from('guias_conexion').update({ datos: datos.data, actualizado_en: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(mensaje(error, 'guardar la guía'));
}

export function enlaceDe(tipo: TipoDocumento, id: string): string {
  if (tipo === 'plano') return `/lazos/plano/${id}`;
  if (tipo === 'unifilar') return `/unifilares/${id}`;
  return `/guias/${id}`;
}

// ---------- La copia del técnico ----------

const claveLocal = (tipo: TipoDocumento, id: string) => `propuesta:${tipo}:${id}`;

function leerLocal(tipo: TipoDocumento, id: string): { base: Doc; datos: Doc } | null {
  try {
    const t = localStorage.getItem(claveLocal(tipo, id));
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}
function escribirLocal(tipo: TipoDocumento, id: string, valor: { base: Doc; datos: Doc } | null) {
  try {
    if (valor) localStorage.setItem(claveLocal(tipo, id), JSON.stringify(valor));
    else localStorage.removeItem(claveLocal(tipo, id));
  } catch {
    // Sin espacio: se sigue intentando subir.
  }
}

// Mi copia abierta de este documento (o la última que se cerró, para
// avisar si se aceptó o se rechazó).
export async function miPropuesta(tipo: TipoDocumento, id: string): Promise<{ abierta: Propuesta | null; ultima: Propuesta | null; local: { base: Doc; datos: Doc } | null }> {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  const local = leerLocal(tipo, id);
  if (!user) return { abierta: null, ultima: null, local };
  const { data, error } = await s.from('propuestas_cambio').select('*').eq('tipo', tipo).eq('objeto_id', id).eq('autor_id', user.id)
    .order('actualizado_en', { ascending: false }).limit(5);
  if (error) {
    if (/fetch|network|load failed|timeout/i.test(error.message)) return { abierta: null, ultima: null, local };
    throw new Error(mensaje(error, 'leer tu copia'));
  }
  const lista = (data || []) as Propuesta[];
  return { abierta: lista.find((p) => p.estado === 'borrador' || p.estado === 'enviada') || null, ultima: lista.find((p) => p.estado !== 'borrador' && p.estado !== 'enviada') || null, local };
}

// Guarda la copia (la crea la primera vez con `base` = el original de
// cuando se empezó). Sin señal queda en el teléfono: devuelve pendiente.
export async function guardarMiCopia(tipo: TipoDocumento, id: string, base: Doc, datos: Doc, propuestaId: string | null): Promise<{ id: string | null; pendiente: boolean }> {
  escribirLocal(tipo, id, { base, datos });
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { id: propuestaId, pendiente: true };
  const s = createClient();
  if (propuestaId) {
    const { error } = await s.from('propuestas_cambio').update({ datos }).eq('id', propuestaId);
    if (error) {
      if (/fetch|network|load failed|timeout/i.test(error.message)) return { id: propuestaId, pendiente: true };
      throw new Error(mensaje(error, 'guardar tu copia'));
    }
    escribirLocal(tipo, id, null);
    return { id: propuestaId, pendiente: false };
  }
  const { data, error } = await s.from('propuestas_cambio').insert({ tipo, objeto_id: id, base, datos }).select('id').single();
  if (error || !data) {
    if (error && /fetch|network|load failed|timeout/i.test(error.message)) return { id: null, pendiente: true };
    // Ya había una copia abierta (se abrió sin señal y no se supo): se actualiza esa.
    if (error?.code === '23505') {
      const { data: abierta } = await s.from('propuestas_cambio').select('id').eq('tipo', tipo).eq('objeto_id', id)
        .in('estado', ['borrador', 'enviada']).eq('autor_id', (await s.auth.getUser()).data.user?.id || '').maybeSingle();
      if (abierta) return guardarMiCopia(tipo, id, base, datos, abierta.id);
    }
    throw new Error(mensaje(error, 'guardar tu copia'));
  }
  escribirLocal(tipo, id, null);
  return { id: data.id, pendiente: false };
}

export async function enviarARevision(p: { id: string; tipo: TipoDocumento; objeto_id: string }, comentario: string, nombreDocumento: string, autor: string): Promise<void> {
  const { error } = await createClient().from('propuestas_cambio')
    .update({ estado: 'enviada', enviada_en: new Date().toISOString(), comentario: comentario.trim() || null }).eq('id', p.id);
  if (error) throw new Error(mensaje(error, 'enviar tus cambios'));
  await notificar({
    destino: 'supervisores', tipo: 'cambio_propuesto', tag: `propuesta-${p.id}`,
    titulo: `Cambios por revisar: ${nombreDocumento}`,
    mensaje: `${autor} propone cambios en ${NOMBRE_DOCUMENTO[p.tipo].toLowerCase()} «${nombreDocumento}».`,
    url: `/dashboard/revisiones/${p.id}`,
  });
}

export async function descartarMiCopia(p: { id: string; tipo: TipoDocumento; objeto_id: string } | null, tipo: TipoDocumento, objetoId: string): Promise<void> {
  escribirLocal(tipo, objetoId, null);
  if (!p) return;
  const { error } = await createClient().from('propuestas_cambio').update({ estado: 'descartada' }).eq('id', p.id);
  if (error) throw new Error(mensaje(error, 'descartar tu copia'));
}

// ---------- Revisión (supervisión) ----------

export type PropuestaEnLista = Propuesta & { autor: string; documento: string };

export async function propuestasPorRevisar(): Promise<PropuestaEnLista[]> {
  const s = createClient();
  const { data, error } = await s.from('propuestas_cambio').select('*, profiles!propuestas_cambio_autor_id_fkey(full_name)')
    .eq('estado', 'enviada').order('enviada_en', { ascending: true }).limit(200);
  if (error) {
    if (/does not exist|could not find the table|schema cache/i.test(error.message)) return [];
    throw new Error(mensaje(error, 'cargar los cambios por revisar'));
  }
  const lista = (data || []) as any[];
  // Nombre de cada documento, una consulta por tipo.
  const nombres = new Map<string, string>();
  for (const [tipo, tabla] of [['plano', 'lazo_planos'], ['unifilar', 'unifilares'], ['guia', 'guias_conexion']] as const) {
    const ids = lista.filter((p) => p.tipo === tipo).map((p) => p.objeto_id);
    if (ids.length === 0) continue;
    const { data: filas } = await s.from(tabla).select('id, nombre').in('id', ids);
    for (const f of (filas || []) as any[]) nombres.set(f.id, f.nombre);
  }
  return lista.map((p) => ({
    ...p,
    autor: (Array.isArray(p.profiles) ? p.profiles[0]?.full_name : p.profiles?.full_name) || 'Técnico',
    documento: nombres.get(p.objeto_id) || 'Documento borrado',
  }));
}

export async function leerPropuesta(id: string): Promise<{ propuesta: Propuesta; autor: string; original: Original; cambios: Cambio[] }> {
  const s = createClient();
  const { data, error } = await s.from('propuestas_cambio').select('*, profiles!propuestas_cambio_autor_id_fkey(full_name)').eq('id', id).single();
  if (error || !data) throw new Error(mensaje(error, 'abrir la propuesta'));
  const propuesta = data as any as Propuesta;
  const original = await leerOriginal(propuesta.tipo, propuesta.objeto_id);
  const autor = ((data as any).profiles?.full_name as string) || 'Técnico';
  return { propuesta, autor, original, cambios: compararPropuesta(propuesta.tipo, propuesta.base, propuesta.datos, original.doc) };
}

// Fusiona lo aceptado: guarda la versión de antes, escribe el original,
// cierra la propuesta y le avisa al técnico. Si ningún cambio se acepta, es
// un rechazo.
export async function resolverPropuesta(p: Propuesta, cambios: Cambio[], aceptados: Set<string>, respuesta: string, nombreDocumento: string): Promise<void> {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) throw new Error('Tu sesión terminó. Vuelve a entrar.');
  const cuantos = cambios.filter((c) => aceptados.has(c.clave)).length;
  if (cuantos > 0) {
    // Se relee el original justo antes: si cambió mientras se revisaba, se fusiona sobre lo de ahora.
    const actual = await leerOriginal(p.tipo, p.objeto_id);
    const { error: eVersion } = await s.from('versiones_documento').insert({
      tipo: p.tipo, objeto_id: p.objeto_id, datos: actual.doc, propuesta_id: p.id, nota: `Antes de fusionar ${cuantos} ${cuantos === 1 ? 'cambio' : 'cambios'} de una propuesta`,
    });
    if (eVersion) throw new Error(mensaje(eVersion, 'guardar la versión anterior'));
    await escribirOriginal(p.tipo, p.objeto_id, fusionar(p.tipo, actual.doc, cambios, aceptados));
  }
  const estado = cuantos === 0 ? 'rechazada' : cuantos === cambios.length ? 'aceptada' : 'parcial';
  const { error } = await s.from('propuestas_cambio').update({
    estado, revisado_por: user.id, revisado_en: new Date().toISOString(), respuesta: respuesta.trim() || null,
    resultado: cambios.map((c) => ({ clave: c.clave, texto: c.texto, aceptado: aceptados.has(c.clave) })),
  }).eq('id', p.id);
  if (error) throw new Error(mensaje(error, 'cerrar la propuesta'));
  const que = estado === 'aceptada' ? 'aceptó tus cambios' : estado === 'parcial' ? `aceptó ${cuantos} de ${cambios.length} cambios` : 'no aceptó tus cambios';
  await notificar({
    usuarios: [p.autor_id], tipo: 'cambio_propuesto', tag: `propuesta-${p.id}`,
    titulo: `${NOMBRE_DOCUMENTO[p.tipo]} «${nombreDocumento}»`,
    mensaje: `Supervisión ${que}${respuesta.trim() ? `: ${respuesta.trim()}` : '.'}`,
    url: enlaceDe(p.tipo, p.objeto_id),
  });
}

// ---------- Versiones ----------

export async function listarVersiones(tipo: TipoDocumento, id: string): Promise<(Version & { autor: string })[]> {
  const { data, error } = await createClient().from('versiones_documento').select('*, profiles(full_name)').eq('tipo', tipo).eq('objeto_id', id)
    .order('creado_en', { ascending: false }).limit(50);
  if (error) {
    if (/does not exist|could not find the table|schema cache/i.test(error.message)) return [];
    throw new Error(mensaje(error, 'cargar las versiones'));
  }
  return ((data || []) as any[]).map((v) => ({ ...v, autor: (Array.isArray(v.profiles) ? v.profiles[0]?.full_name : v.profiles?.full_name) || '—' }));
}

// Regresa el original a una versión; lo que había se guarda antes como otra versión.
export async function restaurarVersion(v: Version): Promise<void> {
  const actual = await leerOriginal(v.tipo, v.objeto_id);
  const { error } = await createClient().from('versiones_documento').insert({
    tipo: v.tipo, objeto_id: v.objeto_id, datos: actual.doc,
    nota: `Antes de regresar a la versión del ${new Date(v.creado_en).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`,
  });
  if (error) throw new Error(mensaje(error, 'guardar la versión actual'));
  await escribirOriginal(v.tipo, v.objeto_id, v.datos);
}

export async function guardarVersionManual(tipo: TipoDocumento, id: string, nota: string): Promise<void> {
  const actual = await leerOriginal(tipo, id);
  const { error } = await createClient().from('versiones_documento').insert({ tipo, objeto_id: id, datos: actual.doc, nota: nota.trim().slice(0, 300) || 'Versión guardada a mano' });
  if (error) throw new Error(mensaje(error, 'guardar la versión'));
}
