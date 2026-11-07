'use client';

import { createClient } from './supabaseClient';
import type { Elemento, Lazo } from './lazos';
import { leerSembrado, sembradoSchema, type Plano, type Sembrado } from './planos';

// Datos de los planos (supabase/patch_lazos_planos.sql).
//
// El plano necesita señal para abrirse (la imagen viene de Storage), pero lo
// que se siembra nunca se pierde: cada cambio se guarda primero en este
// teléfono y solo se borra esa copia cuando el servidor confirma.

export type PlanoResumen = Pick<Plano, 'id' | 'cliente_id' | 'nombre' | 'actualizado_en'>;

export type LazoConElementos = Pick<Lazo, 'id' | 'codigo' | 'nombre' | 'tipo' | 'numero'> & { elementos: Elemento[] };

function mensajeError(error: { message?: string } | null | undefined, accion: string): string {
  const texto = error?.message || '';
  if (/does not exist|could not find the table|schema cache/i.test(texto)) return 'Los planos todavía no están activados: falta correr supabase/patch_lazos_planos.sql en la base.';
  if (/row-level security|permission|unauthorized/i.test(texto)) return `No tienes permiso para ${accion}.`;
  if (/violates check constraint/i.test(texto)) return `No se pudo ${accion}: algún dato no es válido.`;
  if (/fetch|network|load failed|timeout/i.test(texto)) return `No se pudo ${accion}: sin conexión. Revisa tu señal e intenta de nuevo.`;
  return `No se pudo ${accion}. ${texto}`.trim();
}

// ---------- Lista ----------

export async function listarPlanos(): Promise<{ planos: PlanoResumen[]; faltaPatch: boolean }> {
  const { data, error } = await createClient()
    .from('lazo_planos')
    .select('id, cliente_id, nombre, actualizado_en')
    .order('nombre');
  if (error) {
    // Sin el patch la sección de lazos sigue funcionando, solo sin planos.
    if (/does not exist|could not find the table|schema cache/i.test(error.message)) return { planos: [], faltaPatch: true };
    throw new Error(mensajeError(error, 'cargar los planos'));
  }
  return { planos: (data || []) as PlanoResumen[], faltaPatch: false };
}

export async function obtenerPlano(id: string): Promise<Plano> {
  const { data, error } = await createClient().from('lazo_planos').select('*').eq('id', id).single();
  if (error || !data) throw new Error(mensajeError(error, 'abrir el plano'));
  return { ...(data as Plano), sembrado: leerSembrado(data.sembrado) };
}

// Lazos del cliente con sus dispositivos, para sembrarlos en el plano.
export async function lazosDelCliente(clienteId: string): Promise<LazoConElementos[]> {
  const { data, error } = await createClient()
    .from('lazos')
    .select('id, codigo, nombre, tipo, numero, lazo_elementos(*)')
    .eq('cliente_id', clienteId)
    .order('codigo');
  if (error) throw new Error(mensajeError(error, 'cargar los lazos del cliente'));
  return (data || []).map((fila: any) => {
    const { lazo_elementos, ...lazo } = fila;
    return { ...lazo, elementos: (lazo_elementos || []) as Elemento[] };
  });
}

// ---------- Alta ----------

export type NuevoPlano = {
  clienteId: string;
  nombre: string;
  pdf: File;
  pagina: number;
  imagen: Blob;
  ancho: number;
  alto: number;
  metrosPorUnidad: number | null;
};

export async function crearPlano(datos: NuevoPlano): Promise<string> {
  if (!navigator.onLine) throw new Error('Subir un plano necesita señal. Intenta cuando tengas conexión.');
  const supabase = createClient();
  const id = crypto.randomUUID();
  const carpeta = `lazos/planos/${id}`;
  const extension = datos.imagen.type === 'image/webp' ? 'webp' : 'png';
  const pdfPath = `${carpeta}/plano.pdf`;
  const imagenPath = `${carpeta}/hoja-${datos.pagina}.${extension}`;

  const subidaPdf = await supabase.storage.from('evidencias').upload(pdfPath, datos.pdf, { contentType: 'application/pdf' });
  if (subidaPdf.error) throw new Error(mensajeError(subidaPdf.error, 'subir el PDF del plano'));
  const subidaImagen = await supabase.storage.from('evidencias').upload(imagenPath, datos.imagen, { contentType: datos.imagen.type });
  if (subidaImagen.error) throw new Error(mensajeError(subidaImagen.error, 'subir la imagen del plano'));

  const { error } = await supabase.from('lazo_planos').insert({
    id,
    cliente_id: datos.clienteId,
    nombre: datos.nombre,
    pdf_path: pdfPath,
    imagen_path: imagenPath,
    pagina: datos.pagina,
    ancho: datos.ancho,
    alto: datos.alto,
    metros_por_unidad: datos.metrosPorUnidad,
  });
  // shortcut: si falla aquí los archivos quedan huérfanos en Storage (no hay política de borrado en lazos/); limpiar a mano si pasa seguido.
  if (error) throw new Error(mensajeError(error, 'guardar el plano'));
  return id;
}

export async function renombrarPlano(id: string, nombre: string): Promise<void> {
  const { error } = await createClient().from('lazo_planos').update({ nombre }).eq('id', id);
  if (error) throw new Error(mensajeError(error, 'cambiar el nombre'));
}

export async function borrarPlano(id: string): Promise<void> {
  const { data, error } = await createClient().from('lazo_planos').delete().eq('id', id).select('id');
  if (error) throw new Error(mensajeError(error, 'borrar el plano'));
  if (!data || data.length === 0) throw new Error('No se pudo borrar el plano: solo supervisión puede borrarlo.');
}

// ---------- Guardar lo sembrado ----------

export type CambiosPlano = { sembrado: Sembrado; metros_por_unidad: number | null };

const clavePendiente = (id: string) => `planoPendiente:${id}`;

export function leerPendiente(id: string): CambiosPlano | null {
  try {
    const texto = localStorage.getItem(clavePendiente(id));
    if (!texto) return null;
    const copia = JSON.parse(texto);
    return { sembrado: leerSembrado(copia.sembrado), metros_por_unidad: copia.metros_por_unidad ?? null };
  } catch {
    return null;
  }
}

function guardarPendiente(id: string, texto: string) {
  try {
    localStorage.setItem(clavePendiente(id), texto);
  } catch {
    // Sin espacio o sin localStorage: se sigue intentando subir directo.
  }
}

// Solo se borra si la copia es la misma que se subió: si mientras tanto se
// hizo otro cambio, esa copia más nueva se queda hasta que suba.
function borrarPendiente(id: string, texto: string) {
  try {
    if (localStorage.getItem(clavePendiente(id)) === texto) localStorage.removeItem(clavePendiente(id));
  } catch {
    // Nada que hacer: la copia sobrante se vuelve a subir igual sin dañar nada.
  }
}

// Primero la copia local, luego el servidor. Si no hay señal regresa
// { pendiente: true } y la copia se queda para el siguiente intento.
// shortcut: gana el último que guarda; si dos personas editan el mismo plano a la vez se pisan. Agregar control de versión si llega a pasar.
export async function guardarSembrado(id: string, cambios: CambiosPlano): Promise<{ pendiente: boolean }> {
  const valido = sembradoSchema.safeParse(cambios.sembrado);
  if (!valido.success) throw new Error('Hay un dato del plano que no es válido; deshaz el último cambio e intenta de nuevo.');
  const texto = JSON.stringify(cambios);
  guardarPendiente(id, texto);
  if (!navigator.onLine) return { pendiente: true };
  const { error } = await createClient()
    .from('lazo_planos')
    .update({ sembrado: valido.data, metros_por_unidad: cambios.metros_por_unidad })
    .eq('id', id);
  if (error) {
    if (/fetch|network|load failed|timeout/i.test(error.message)) return { pendiente: true };
    throw new Error(mensajeError(error, 'guardar el plano'));
  }
  borrarPendiente(id, texto);
  return { pendiente: false };
}

// ---------- Archivos ----------

export async function urlArchivo(path: string): Promise<string> {
  const { data, error } = await createClient().storage.from('evidencias').createSignedUrl(path, 3600);
  if (error || !data) throw new Error(mensajeError(error, 'abrir el archivo del plano'));
  return data.signedUrl;
}

export async function descargarPdfOriginal(path: string): Promise<ArrayBuffer> {
  const { data, error } = await createClient().storage.from('evidencias').download(path);
  if (error || !data) throw new Error(mensajeError(error, 'descargar el PDF del plano'));
  return data.arrayBuffer();
}

// El PDF exportado se sube y se abre con un enlace firmado de otro dominio:
// así también funciona en la app de Android (su visor no abre blobs).
export async function entregarPdf(planoId: string, bytes: Uint8Array, nombreArchivo: string): Promise<string> {
  const supabase = createClient();
  // shortcut: cada exportación deja un archivo en lazos/planos/<id>/pdf/; limpiar con un cron si llegan a pesar.
  const ruta = `lazos/planos/${planoId}/pdf/${nombreArchivo}-${Date.now()}.pdf`;
  const subida = await supabase.storage.from('evidencias').upload(ruta, new Blob([bytes as BlobPart], { type: 'application/pdf' }), { contentType: 'application/pdf' });
  if (subida.error) throw new Error(mensajeError(subida.error, 'preparar el PDF para descargar'));
  const firmado = await supabase.storage.from('evidencias').createSignedUrl(ruta, 600, { download: `${nombreArchivo}.pdf` });
  if (firmado.error || !firmado.data) throw new Error(mensajeError(firmado.error, 'preparar el enlace del PDF'));
  return firmado.data.signedUrl;
}
