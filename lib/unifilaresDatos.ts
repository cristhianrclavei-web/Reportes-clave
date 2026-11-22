'use client';

import { createClient } from './supabaseClient';
import { datosUnifilarSchema, leerDatos, type DatosUnifilar, type TipoSistema, type Unifilar } from './unifilar';

// Datos de los diagramas unifilares (supabase/patch_unifilares.sql).
// Se editan en la oficina: si se va la señal, el editor guarda una copia en
// el navegador (copiaLocal) y reintenta; no hay cola como en los reportes.

function mensajeError(error: { message?: string } | null | undefined, accion: string): string {
  const texto = error?.message || '';
  if (/does not exist|could not find the table|schema cache/i.test(texto)) return 'Los diagramas unifilares todavía no están activados: falta correr supabase/patch_unifilares.sql en la base.';
  if (/row-level security|permission|unauthorized/i.test(texto)) return `No tienes permiso para ${accion}. Solo supervisión maneja los unifilares.`;
  if (/violates check constraint/i.test(texto)) return `No se pudo ${accion}: algún dato no es válido o el diagrama es demasiado grande.`;
  if (/fetch|network|load failed|timeout/i.test(texto) || (typeof navigator !== 'undefined' && !navigator.onLine)) return `No se pudo ${accion}: sin conexión. Revisa tu señal e intenta de nuevo.`;
  return `No se pudo ${accion}. ${texto}`.trim();
}

function aUnifilar(fila: any): Unifilar {
  return { ...fila, datos: leerDatos(fila.datos) } as Unifilar;
}

export async function listarUnifilares(): Promise<{ unifilares: Unifilar[]; faltaPatch: boolean }> {
  const { data, error } = await createClient().from('unifilares').select('*').order('actualizado_en', { ascending: false }).limit(500);
  if (error) {
    if (/does not exist|could not find the table|schema cache/i.test(error.message)) return { unifilares: [], faltaPatch: true };
    throw new Error(mensajeError(error, 'cargar los unifilares'));
  }
  return { unifilares: (data || []).map(aUnifilar), faltaPatch: false };
}

export async function leerUnifilar(id: string): Promise<Unifilar> {
  const { data, error } = await createClient().from('unifilares').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(mensajeError(error, 'abrir el unifilar'));
  if (!data) throw new Error('No se encontró el unifilar. Puede que lo hayan borrado.');
  return aUnifilar(data);
}

export async function crearUnifilar(nuevo: { nombre: string; tipo: TipoSistema; cliente_id: string | null; datos: DatosUnifilar }): Promise<string> {
  const datos = datosUnifilarSchema.parse(nuevo.datos);
  const { data, error } = await createClient().from('unifilares')
    .insert({ nombre: nuevo.nombre.trim(), tipo: nuevo.tipo, cliente_id: nuevo.cliente_id, datos })
    .select('id').single();
  if (error || !data) throw new Error(mensajeError(error, 'crear el unifilar'));
  return data.id;
}

export async function guardarUnifilar(id: string, cambios: { nombre: string; datos: DatosUnifilar }): Promise<void> {
  const revision = datosUnifilarSchema.safeParse(cambios.datos);
  if (!revision.success) throw new Error(`No se pudo guardar: ${revision.error.issues[0]?.message || 'hay un dato no válido'}.`);
  const nombre = cambios.nombre.trim();
  if (!nombre) throw new Error('No se pudo guardar: ponle nombre al unifilar.');
  const { error } = await createClient().from('unifilares')
    .update({ nombre, datos: revision.data, actualizado_en: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(mensajeError(error, 'guardar el unifilar'));
}

export async function borrarUnifilar(id: string): Promise<void> {
  const { error } = await createClient().from('unifilares').delete().eq('id', id);
  if (error) throw new Error(mensajeError(error, 'borrar el unifilar'));
}

// Dirección y ubicación del cliente para llenar el cuadro del plano.
export async function datosDelCliente(clienteId: string): Promise<{ direccion: string; lat: string; lng: string } | null> {
  const { data, error } = await createClient().from('clientes').select('direccion, calle, num_exterior, colonia, codigo_postal, ciudad, estado, ubicacion').eq('id', clienteId).maybeSingle();
  if (error || !data) return null;
  const partes = [
    [data.calle, data.num_exterior].filter(Boolean).join(' '),
    data.colonia,
    data.codigo_postal,
    [data.ciudad, data.estado].filter(Boolean).join(', '),
  ].filter(Boolean);
  const direccion = partes.length >= 2 ? partes.join(', ') : data.direccion || partes.join(', ');
  const ubicacion = data.ubicacion as { lat?: number; lng?: number } | null;
  return {
    direccion: direccion || '',
    lat: typeof ubicacion?.lat === 'number' ? String(ubicacion.lat) : '',
    lng: typeof ubicacion?.lng === 'number' ? String(ubicacion.lng) : '',
  };
}

// Copia en el navegador de lo último que se editó, por si se va la señal o
// se cierra la pestaña antes de guardar.
const claveCopia = (id: string) => `unifilar:${id}`;

export function copiaLocal(id: string): { nombre: string; datos: DatosUnifilar; en: string } | null {
  try {
    const texto = localStorage.getItem(claveCopia(id));
    if (!texto) return null;
    const v = JSON.parse(texto);
    return { nombre: v.nombre, datos: leerDatos(v.datos), en: v.en };
  } catch {
    return null;
  }
}

export function guardarCopiaLocal(id: string, nombre: string, datos: DatosUnifilar) {
  try {
    localStorage.setItem(claveCopia(id), JSON.stringify({ nombre, datos, en: new Date().toISOString() }));
  } catch {
    // Sin espacio: el editor sigue; solo no queda copia.
  }
}

export function borrarCopiaLocal(id: string) {
  try {
    localStorage.removeItem(claveCopia(id));
  } catch {
    // Nada que hacer.
  }
}
