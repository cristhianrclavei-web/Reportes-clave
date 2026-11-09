'use client';

import { createClient } from './supabaseClient';
import type { Elemento, Lazo } from './lazos';
import { elementosConPendientes } from './lazosDatos';
import { leerSembrado, sembradoSchema, type Plano, type Sembrado } from './planos';

// Datos de los planos (supabase/patch_lazos_planos.sql).
//
// Lo que se siembra nunca se pierde: cada cambio se guarda primero en este
// teléfono y solo se borra esa copia cuando el servidor confirma. Un plano
// que ya se abrió en este teléfono se puede volver a abrir sin señal (se
// guarda copia del plano, de su imagen y de los lazos del cliente).

export type PlanoResumen = Pick<Plano, 'id' | 'cliente_id' | 'nombre' | 'actualizado_en'>;

export type LazoConElementos = Lazo & { elementos: Elemento[] };

function esErrorDeRed(error: { message?: string } | null | undefined): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  return /fetch|network|load failed|timeout/i.test(error?.message || '');
}

function leerCopia<T>(clave: string): T | null {
  try {
    const texto = localStorage.getItem(clave);
    return texto ? (JSON.parse(texto) as T) : null;
  } catch {
    // Sin localStorage o copia dañada: se trabaja sin copia.
    return null;
  }
}

function guardarCopia(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Sin espacio: la copia es una ayuda para abrir sin señal, no la fuente.
  }
}

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

const copiaPlano = (id: string) => `planoCopia:${id}`;

export async function obtenerPlano(id: string): Promise<{ plano: Plano; sinConexion: boolean }> {
  const { data, error } = await createClient().from('lazo_planos').select('*').eq('id', id).single();
  if (error || !data) {
    const copia = leerCopia<Plano>(copiaPlano(id));
    if (copia && esErrorDeRed(error)) return { plano: { ...copia, sembrado: leerSembrado(copia.sembrado) }, sinConexion: true };
    if (esErrorDeRed(error)) throw new Error('Sin señal y este plano no se ha abierto antes en este teléfono. Ábrelo cuando tengas conexión.');
    throw new Error(mensajeError(error, 'abrir el plano'));
  }
  guardarCopia(copiaPlano(id), data);
  return { plano: { ...(data as Plano), sembrado: leerSembrado(data.sembrado) }, sinConexion: false };
}

const copiaLazos = (clienteId: string) => `planoLazos:${clienteId}`;

// Lazos del cliente con sus dispositivos, para sembrarlos y conectarlos en
// el plano. Lleva encima lo capturado sin señal que todavía no sube.
export async function lazosDelCliente(clienteId: string): Promise<{ lazos: LazoConElementos[]; sinConexion: boolean }> {
  const { data, error } = await createClient()
    .from('lazos')
    .select('*, lazo_elementos(*)')
    .eq('cliente_id', clienteId)
    .order('codigo');
  let lazos: LazoConElementos[];
  let sinConexion = false;
  if (error) {
    const copia = leerCopia<LazoConElementos[]>(copiaLazos(clienteId));
    if (!copia || !esErrorDeRed(error)) throw new Error(mensajeError(error, 'cargar los lazos del cliente'));
    lazos = copia;
    sinConexion = true;
  } else {
    lazos = (data || []).map((fila: any) => {
      const { lazo_elementos, ...lazo } = fila;
      return { ...lazo, elementos: (lazo_elementos || []) as Elemento[] };
    });
    guardarCopia(copiaLazos(clienteId), lazos);
  }
  return { lazos: lazos.map((l) => ({ ...l, elementos: elementosConPendientes(l.id, l.elementos) })), sinConexion };
}

// Los lazos del cliente cambian desde el plano (se capturan dispositivos):
// la copia se actualiza para que sin señal se vea lo mismo.
export function guardarCopiaLazos(clienteId: string, lazos: LazoConElementos[]) {
  guardarCopia(copiaLazos(clienteId), lazos);
}

const copiaOtros = (planoId: string) => `planoOtros:${planoId}`;

// En qué otro plano del cliente está sembrado cada dispositivo: un
// dispositivo va en un solo plano, y las flechas dicen a qué plano sigue el lazo.
export async function otrosPlanosDelCliente(clienteId: string, planoId: string): Promise<Map<string, string>> {
  const { data, error } = await createClient()
    .from('lazo_planos')
    .select('id, nombre, sembrado')
    .eq('cliente_id', clienteId)
    .neq('id', planoId);
  let pares: [string, string][];
  if (error) {
    if (!esErrorDeRed(error)) throw new Error(mensajeError(error, 'cargar los otros planos del cliente'));
    pares = leerCopia<[string, string][]>(copiaOtros(planoId)) || [];
  } else {
    pares = [];
    for (const otro of data || []) {
      for (const equipo of leerSembrado(otro.sembrado).equipos) {
        if (equipo.elementoId) pares.push([equipo.elementoId, otro.nombre]);
        if (equipo.panelId) pares.push([equipo.panelId, otro.nombre]);
      }
    }
    guardarCopia(copiaOtros(planoId), pares);
  }
  return new Map(pares);
}

const copiaPlanosCliente = (clienteId: string) => `planosCliente:${clienteId}`;

// Todos los planos del cliente con su sembrado, para ver el lazo sobre el
// plano desde su diagrama. Sin señal sale la copia del teléfono.
export async function planosDelCliente(clienteId: string): Promise<{ planos: Plano[]; sinConexion: boolean }> {
  const { data, error } = await createClient()
    .from('lazo_planos')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('nombre');
  if (error) {
    const copia = leerCopia<Plano[]>(copiaPlanosCliente(clienteId));
    if (copia && esErrorDeRed(error)) return { planos: copia.map((p) => ({ ...p, sembrado: leerSembrado(p.sembrado) })), sinConexion: true };
    throw new Error(mensajeError(error, 'cargar los planos del cliente'));
  }
  guardarCopia(copiaPlanosCliente(clienteId), data);
  return { planos: (data || []).map((p) => ({ ...(p as Plano), sembrado: leerSembrado(p.sembrado) })), sinConexion: false };
}

// ---------- Alta ----------

export type NuevoPlano = {
  clienteId: string;
  nombre: string;
  // El archivo original: PDF, o DXF de AutoCAD (con `dxf`).
  pdf: File;
  dxf?: { x0: number; y1: number; k: number; unidad: number } | null;
  pagina: number;
  imagen: Blob;
  ancho: number;
  alto: number;
  metrosPorUnidad: number | null;
  // Equipos que ya vienen del DXF (lib/importarDxf.ts).
  sembrado?: Sembrado;
};

export async function crearPlano(datos: NuevoPlano): Promise<string> {
  if (!navigator.onLine) throw new Error('Subir un plano necesita señal. Intenta cuando tengas conexión.');
  let sembrado: Sembrado | undefined;
  if (datos.sembrado) {
    const revisado = sembradoSchema.safeParse(datos.sembrado);
    if (!revisado.success) throw new Error('Los dispositivos del DXF no se pudieron leer bien (demasiados o con datos raros). Sube el plano sin pasarlos y siémbralos a mano.');
    sembrado = revisado.data as Sembrado;
  }
  const supabase = createClient();
  const id = crypto.randomUUID();
  const carpeta = `lazos/planos/${id}`;
  const extension = datos.imagen.type === 'image/webp' ? 'webp' : 'png';
  const esDxf = Boolean(datos.dxf);
  const pdfPath = `${carpeta}/${esDxf ? 'plano.dxf' : 'plano.pdf'}`;
  const imagenPath = `${carpeta}/hoja-${datos.pagina}.${extension}`;

  const subidaPdf = await supabase.storage.from('evidencias').upload(pdfPath, datos.pdf, { contentType: esDxf ? 'application/dxf' : 'application/pdf' });
  if (subidaPdf.error) throw new Error(mensajeError(subidaPdf.error, esDxf ? 'subir el DXF del plano' : 'subir el PDF del plano'));
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
    // Solo los DXF llevan estas columnas: así un PDF se sube aunque falte el patch.
    ...(esDxf ? { formato: 'dxf', dxf: datos.dxf } : {}),
    ...(sembrado ? { sembrado } : {}),
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
  // Las copias de este teléfono ya no sirven.
  try {
    localStorage.removeItem(`planoPendiente:${id}`);
    localStorage.removeItem(copiaPlano(id));
    localStorage.removeItem(copiaOtros(id));
  } catch {
    // Sin localStorage: no hay copias que limpiar.
  }
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

// La imagen del plano: del servidor y, sin señal, la copia guardada en este
// teléfono la última vez que se abrió. Devuelve una dirección local (blob).
const CACHE_IMAGENES = 'planos-imagenes';

export async function imagenDelPlano(path: string): Promise<string> {
  const clave = `/copia-plano/${path}`;
  const { data, error } = await createClient().storage.from('evidencias').download(path);
  if (data && !error) {
    try {
      const cache = await caches.open(CACHE_IMAGENES);
      await cache.put(clave, new Response(data, { headers: { 'Content-Type': data.type } }));
    } catch {
      // Sin Cache Storage: se ve igual, solo no queda copia para abrir sin señal.
    }
    return URL.createObjectURL(data);
  }
  try {
    const cache = await caches.open(CACHE_IMAGENES);
    const copia = await cache.match(clave);
    if (copia) return URL.createObjectURL(await copia.blob());
  } catch {
    // Sin Cache Storage: se avisa abajo.
  }
  throw new Error(mensajeError(error, 'abrir la imagen del plano'));
}

export async function descargarPdfOriginal(path: string): Promise<ArrayBuffer> {
  const { data, error } = await createClient().storage.from('evidencias').download(path);
  if (error || !data) throw new Error(mensajeError(error, 'descargar el PDF del plano'));
  return data.arrayBuffer();
}

// El PDF (o DXF) exportado se sube y se abre con un enlace firmado de otro
// dominio: así también funciona en la app de Android (su visor no abre blobs).
export async function entregarPdf(planoId: string, bytes: Uint8Array, nombreArchivo: string, extension: 'pdf' | 'dxf' = 'pdf'): Promise<string> {
  const supabase = createClient();
  const tipo = extension === 'pdf' ? 'application/pdf' : 'application/dxf';
  const que = extension === 'pdf' ? 'el PDF' : 'el DXF';
  // shortcut: cada exportación deja un archivo en lazos/planos/<id>/pdf/; limpiar con un cron si llegan a pesar.
  const ruta = `lazos/planos/${planoId}/pdf/${nombreArchivo}-${Date.now()}.${extension}`;
  const subida = await supabase.storage.from('evidencias').upload(ruta, new Blob([bytes as BlobPart], { type: tipo }), { contentType: tipo });
  if (subida.error) throw new Error(mensajeError(subida.error, `preparar ${que} para descargar`));
  const firmado = await supabase.storage.from('evidencias').createSignedUrl(ruta, 600, { download: `${nombreArchivo}.${extension}` });
  if (firmado.error || !firmado.data) throw new Error(mensajeError(firmado.error, `preparar el enlace del ${extension.toUpperCase()}`));
  return firmado.data.signedUrl;
}
