'use client';

import { createClient } from './supabaseClient';
import { reducirFoto } from './reducirFoto';
import type { Cambio, Corte, Elemento, Falla, Lazo, TipoCircuito } from './lazos';
import { AnexoFallaTierra, resumirBusqueda } from './anexoFallaTierra';

// Datos de lazos y circuitos (supabase/patch_lazos.sql).
//
// La captura se hace en campo, muchas veces sin señal. Por eso los
// dispositivos, las búsquedas de falla y los cortes llevan un id generado en
// el teléfono y se guardan con «upsert»: si no hay señal, el cambio se anota
// en una cola local y se sube después; reintentar no duplica nada. La cola
// solo suelta un cambio cuando el servidor confirma que lo guardó.
//
// Además se guarda una copia de cada lazo abierto, para poder seguir
// viéndolo y capturando si se va la señal a medio trabajo.

export type LazoResumen = Lazo & { dispositivos: number; fallaAbierta: boolean };

export type DatosLazo = { lazo: Lazo; elementos: Elemento[]; falla: Falla | null; cortes: Corte[] };

type Tabla = 'lazo_elementos' | 'lazo_fallas' | 'lazo_cortes';

type Pendiente =
  | { accion: 'guardar'; tabla: Tabla; lazoId: string; fila: Record<string, unknown> }
  | { accion: 'borrar'; tabla: Tabla; lazoId: string; id: string };

const CLAVE_COLA = 'lazosPendientes';
const CLAVE_LISTA = 'lazosLista';
const clavePaquete = (lazoId: string) => `lazo:${lazoId}`;

// ---------- Copias locales ----------

function leerLocal<T>(clave: string): T | null {
  try {
    const texto = localStorage.getItem(clave);
    return texto ? (JSON.parse(texto) as T) : null;
  } catch {
    // Sin localStorage (modo privado) o copia dañada: se trabaja sin copia.
    return null;
  }
}

function guardarLocal(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Sin espacio o sin localStorage: la copia es una ayuda, no la fuente.
  }
}

function leerCola(): Pendiente[] {
  return leerLocal<Pendiente[]>(CLAVE_COLA) || [];
}

function escribirCola(cola: Pendiente[]) {
  localStorage.setItem(CLAVE_COLA, JSON.stringify(cola));
}

export function pendientesDeLazo(lazoId: string): number {
  return leerCola().filter((p) => p.lazoId === lazoId).length;
}

// ¿El error es por falta de señal (se reintenta) o el servidor rechazó el
// dato (no tiene caso reintentar: hay que corregirlo)?
function esErrorDeRed(error: { message?: string; code?: string } | null | undefined): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (!error) return false;
  if (error.code) return false;
  return /fetch|network|load failed|timeout|conexi/i.test(error.message || '');
}

function mensajeError(error: { message?: string; code?: string } | null | undefined, accion: string): string {
  const texto = error?.message || '';
  // La base todavía no tiene las tablas: falta el patch.
  if (/does not exist|could not find the table|schema cache/i.test(texto)) return 'Esta función todavía no está activada: falta correr supabase/patch_lazos.sql en la base.';
  if (/row-level security|permission/i.test(texto)) return `No tienes permiso para ${accion}.`;
  if (/violates check constraint/i.test(texto)) return `No se pudo ${accion}: algún dato no es válido.`;
  if (/duplicate key|unique/i.test(texto)) return `No se pudo ${accion}: ya existe uno igual.`;
  return `No se pudo ${accion}. ${texto}`.trim();
}

// ---------- Lista de lazos ----------

export async function listarLazos(): Promise<{ lazos: LazoResumen[]; sinConexion: boolean }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('lazos')
    .select('*, lazo_elementos(count), lazo_fallas(estado)')
    .order('creado_en', { ascending: true });

  if (error) {
    const copia = leerLocal<LazoResumen[]>(CLAVE_LISTA);
    if (esErrorDeRed(error) && copia) return { lazos: copia, sinConexion: true };
    throw new Error(mensajeError(error, 'cargar los lazos'));
  }

  const lazos: LazoResumen[] = (data || []).map((fila: any) => {
    const { lazo_elementos, lazo_fallas, ...lazo } = fila;
    return {
      ...(lazo as Lazo),
      dispositivos: lazo_elementos?.[0]?.count ?? 0,
      fallaAbierta: (lazo_fallas || []).some((f: { estado: string }) => f.estado === 'abierta'),
    };
  });
  guardarLocal(CLAVE_LISTA, lazos);
  return { lazos, sinConexion: false };
}

export type DatosNuevoLazo = {
  cliente_id: string;
  tipo: TipoCircuito;
  codigo: string;
  nombre: string;
  numero: number | null;
  clase: 'A' | 'B' | null;
  panel: string | null;
};

// Crear y editar un lazo pide señal: es un paso corto que se hace una vez.
export async function crearLazo(datos: DatosNuevoLazo): Promise<Lazo> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Tu sesión terminó. Vuelve a entrar.');
  const { data, error } = await supabase.from('lazos').insert({ ...datos, creado_por: user.id }).select('*').single();
  if (error) {
    if (esErrorDeRed(error)) throw new Error('Sin conexión. Crea el lazo cuando tengas señal.');
    throw new Error(mensajeError(error, 'crear el lazo'));
  }
  return data as Lazo;
}

export async function actualizarLazo(id: string, cambios: Partial<DatosNuevoLazo>): Promise<void> {
  const { error } = await createClient().from('lazos').update(cambios).eq('id', id);
  if (error) {
    if (esErrorDeRed(error)) throw new Error('Sin conexión. Guarda los cambios cuando tengas señal.');
    throw new Error(mensajeError(error, 'guardar el lazo'));
  }
}

export async function borrarLazo(id: string): Promise<void> {
  const { error } = await createClient().from('lazos').delete().eq('id', id);
  if (error) throw new Error(mensajeError(error, 'borrar el lazo'));
}

// ---------- Un lazo ----------

// Aplica sobre los datos lo que todavía está en la cola, para que lo
// capturado sin señal se vea en la lista y en el diagrama.
function aplicarPendientes(datos: DatosLazo): DatosLazo {
  const cola = leerCola().filter((p) => p.lazoId === datos.lazo.id);
  let elementos = [...datos.elementos];
  let falla = datos.falla;
  let cortes = [...datos.cortes];

  for (const p of cola) {
    if (p.tabla === 'lazo_elementos') {
      if (p.accion === 'guardar') {
        const fila = p.fila as unknown as Elemento;
        elementos = elementos.filter((e) => e.id !== fila.id).concat(fila);
      } else {
        elementos = elementos.filter((e) => e.id !== p.id && e.padre_id !== p.id);
      }
    }
    if (p.tabla === 'lazo_fallas' && p.accion === 'guardar') {
      const fila = p.fila as unknown as Falla;
      falla = fila.estado === 'abierta' ? fila : null;
      if (!falla) cortes = [];
    }
    if (p.tabla === 'lazo_cortes') {
      if (p.accion === 'guardar') {
        const fila = p.fila as unknown as Corte;
        cortes = cortes.filter((c) => c.id !== fila.id).concat(fila);
      } else {
        cortes = cortes.filter((c) => c.id !== p.id);
      }
    }
  }
  return { lazo: datos.lazo, elementos, falla, cortes };
}

export async function obtenerLazo(lazoId: string): Promise<{ datos: DatosLazo; sinConexion: boolean }> {
  const supabase = createClient();
  const [rLazo, rElementos, rFalla] = await Promise.all([
    supabase.from('lazos').select('*').eq('id', lazoId).single(),
    supabase.from('lazo_elementos').select('*').eq('lazo_id', lazoId).order('orden'),
    supabase.from('lazo_fallas').select('*').eq('lazo_id', lazoId).eq('estado', 'abierta').maybeSingle(),
  ]);

  const primerError = rLazo.error || rElementos.error || rFalla.error;
  if (primerError) {
    const copia = leerLocal<DatosLazo>(clavePaquete(lazoId));
    if (esErrorDeRed(primerError) && copia) return { datos: aplicarPendientes(copia), sinConexion: true };
    throw new Error(mensajeError(primerError, 'cargar el lazo'));
  }

  let cortes: Corte[] = [];
  const falla = (rFalla.data as Falla) || null;
  if (falla) {
    const { data, error } = await supabase.from('lazo_cortes').select('*').eq('falla_id', falla.id).order('creado_en');
    if (error) throw new Error(mensajeError(error, 'cargar los cortes'));
    cortes = (data as Corte[]) || [];
  }

  const datos: DatosLazo = { lazo: rLazo.data as Lazo, elementos: (rElementos.data as Elemento[]) || [], falla, cortes };
  guardarLocal(clavePaquete(lazoId), datos);
  return { datos: aplicarPendientes(datos), sinConexion: false };
}

// Guarda la copia local con lo que se ve en pantalla, para que lo guardado
// en esta visita siga ahí si se recarga la página sin señal.
export function guardarCopiaLazo(datos: DatosLazo) {
  guardarLocal(clavePaquete(datos.lazo.id), datos);
}

// Fallas resueltas del lazo, para el historial de cada dispositivo.
export async function fallasResueltas(lazoId: string): Promise<Falla[]> {
  const { data, error } = await createClient()
    .from('lazo_fallas')
    .select('*')
    .eq('lazo_id', lazoId)
    .eq('estado', 'resuelta')
    .order('resuelta_en', { ascending: false });
  if (error) {
    if (esErrorDeRed(error)) return [];
    throw new Error(mensajeError(error, 'cargar el historial de fallas'));
  }
  return (data as Falla[]) || [];
}

// Historial de cambios del lazo (supabase/patch_lazos_historial.sql), lo
// más reciente primero. Sin señal se devuelve vacío y se avisa.
export async function historialDeLazo(lazoId: string): Promise<{ cambios: Cambio[]; aviso: string | null }> {
  const { data, error } = await createClient()
    .from('lazo_historial')
    .select('*, profiles(full_name)')
    .eq('lazo_id', lazoId)
    .order('creado_en', { ascending: false })
    .limit(300);
  if (error) {
    if (esErrorDeRed(error)) return { cambios: [], aviso: 'Sin señal: el historial se ve al tener conexión.' };
    if (/does not exist|could not find the table|schema cache/i.test(error.message || '')) {
      return { cambios: [], aviso: 'El historial todavía no está activado: falta correr supabase/patch_lazos_historial.sql.' };
    }
    return { cambios: [], aviso: mensajeError(error, 'cargar el historial') };
  }
  const cambios = (data || []).map((fila: any) => {
    const { profiles, ...resto } = fila;
    return { ...resto, usuario_nombre: profiles?.full_name || null } as Cambio;
  });
  return { cambios, aviso: null };
}

// ---------- Guardar (con cola sin conexión) ----------

export type ResultadoGuardar = { pendiente: boolean };

async function ejecutar(p: Pendiente) {
  const supabase = createClient();
  if (p.accion === 'guardar') return supabase.from(p.tabla).upsert(p.fila);
  return supabase.from(p.tabla).delete().eq('id', p.id);
}

// Intenta guardar directo. Sin señal, lo deja en la cola y avisa que quedó
// pendiente. Si el servidor lo rechaza, lanza el error para corregirlo.
async function guardarOEncolar(p: Pendiente, accion: string): Promise<ResultadoGuardar> {
  // Si ya hay cambios en cola de este lazo, este va detrás de ellos: un
  // dispositivo puede colgar de otro que todavía no sube.
  const hayCola = leerCola().some((x) => x.lazoId === p.lazoId);
  if (!hayCola) {
    const { error } = await ejecutar(p);
    if (!error) return { pendiente: false };
    if (!esErrorDeRed(error)) throw new Error(mensajeError(error, accion));
  }
  escribirCola([...leerCola(), p]);
  return { pendiente: true };
}

async function usuarioActual(): Promise<string> {
  const { data } = await createClient().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Tu sesión terminó. Vuelve a entrar para guardar.');
  return id;
}

// Al corregir un dispositivo de otra persona se conserva quién lo capturó.
export async function guardarElemento(elemento: Elemento): Promise<ResultadoGuardar> {
  const creadoPor = await usuarioActual();
  const { creado_en, ...fila } = elemento;
  return guardarOEncolar(
    { accion: 'guardar', tabla: 'lazo_elementos', lazoId: elemento.lazo_id, fila: { ...fila, creado_por: elemento.creado_por || creadoPor } },
    'guardar el dispositivo',
  );
}

export async function borrarElemento(lazoId: string, id: string): Promise<ResultadoGuardar> {
  return guardarOEncolar({ accion: 'borrar', tabla: 'lazo_elementos', lazoId, id }, 'borrar el dispositivo');
}

export async function guardarFalla(falla: Falla): Promise<ResultadoGuardar> {
  const abiertaPor = await usuarioActual();
  return guardarOEncolar(
    { accion: 'guardar', tabla: 'lazo_fallas', lazoId: falla.lazo_id, fila: { ...falla, abierta_por: falla.abierta_por || abiertaPor } },
    'guardar la búsqueda de falla',
  );
}

export async function guardarCorte(lazoId: string, corte: Corte): Promise<ResultadoGuardar> {
  const creadoPor = await usuarioActual();
  return guardarOEncolar(
    { accion: 'guardar', tabla: 'lazo_cortes', lazoId, fila: { ...corte, creado_por: creadoPor } },
    'guardar el corte',
  );
}

export async function borrarCorte(lazoId: string, id: string): Promise<ResultadoGuardar> {
  return guardarOEncolar({ accion: 'borrar', tabla: 'lazo_cortes', lazoId, id }, 'borrar el corte');
}

// Sube la cola en el orden en que se capturó. Se detiene en el primer cambio
// que no sube, para no subir un dispositivo antes que aquel del que cuelga.
// Devuelve cuántos quedan y, si el servidor rechazó uno, por qué.
export async function subirPendientes(): Promise<{ quedan: number; rechazo: string | null }> {
  let cola = leerCola();
  while (cola.length > 0) {
    const siguiente = cola[0];
    const { error } = await ejecutar(siguiente);
    if (error) {
      if (esErrorDeRed(error)) return { quedan: cola.length, rechazo: null };
      return { quedan: cola.length, rechazo: mensajeError(error, 'subir un cambio guardado sin señal') };
    }
    // Se relee: mientras subía, pudo entrar otro cambio a la cola.
    cola = leerCola().slice(1);
    escribirCola(cola);
  }
  return { quedan: 0, rechazo: null };
}

// Último recurso para un cambio que el servidor rechaza siempre: lo quita de
// la cola (el usuario lo confirma antes).
export function descartarPrimerPendiente() {
  escribirCola(leerCola().slice(1));
}

// ---------- Fotos ----------

// La foto necesita señal: es pesada para guardarla en la cola.
async function subirFoto(lazoId: string, nombre: string, archivo: File, avisoSinSenal: string): Promise<string> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error(avisoSinSenal);
  const supabase = createClient();
  const reducida = await reducirFoto(archivo);
  const path = `lazos/${lazoId}/${nombre}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('evidencias').upload(path, reducida, { contentType: reducida.type || 'image/jpeg' });
  if (error) throw new Error(mensajeError(error, 'subir la foto'));
  return path;
}

export function subirFotoElemento(elemento: Elemento, archivo: File): Promise<string> {
  return subirFoto(elemento.lazo_id, elemento.id, archivo, 'La foto necesita señal. Puedes agregarla después desde la ficha del dispositivo.');
}

export function subirFotoCorte(lazoId: string, corte: Corte, archivo: File): Promise<string> {
  return subirFoto(lazoId, `corte-${corte.id}`, archivo, 'La foto necesita señal. Intenta cuando tengas señal, o quítala para guardar el corte sin foto.');
}

export function subirFotoFalla(falla: Falla, archivo: File): Promise<string> {
  return subirFoto(falla.lazo_id, `falla-${falla.id}`, archivo, 'La foto necesita señal. Intenta cuando tengas señal, o quítala para cerrar sin foto.');
}

export async function urlFotoElemento(path: string): Promise<string | null> {
  const { data, error } = await createClient().storage.from('evidencias').createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

// ---------- Búsquedas para la tarjeta del lazo y el reporte ----------

// Cortes de una búsqueda (abierta o ya cerrada), en el orden en que se hicieron.
export async function cortesDeFalla(fallaId: string): Promise<Corte[]> {
  const { data, error } = await createClient().from('lazo_cortes').select('*').eq('falla_id', fallaId).order('creado_en');
  if (error) throw new Error(mensajeError(error, 'cargar los cortes'));
  return (data as Corte[]) || [];
}

const DIAS_RECIENTES = 30;

// Búsquedas de falla de los lazos de un cliente para anexarlas al reporte:
// las abiertas y las cerradas en los últimos 30 días, ya resumidas.
// Sin señal se usan las copias locales de los lazos que se abrieron en este
// teléfono (solo traen la búsqueda abierta).
export async function busquedasDelCliente(clienteId: string): Promise<{ busquedas: AnexoFallaTierra[]; sinConexion: boolean }> {
  const supabase = createClient();
  const ahora = new Date().toISOString();

  const rLazos = await supabase.from('lazos').select('*').eq('cliente_id', clienteId);
  if (rLazos.error) {
    if (esErrorDeRed(rLazos.error)) return { busquedas: busquedasLocales(clienteId, ahora), sinConexion: true };
    throw new Error(mensajeError(rLazos.error, 'cargar los lazos del cliente'));
  }
  const lazos = (rLazos.data as Lazo[]) || [];
  if (lazos.length === 0) return { busquedas: [], sinConexion: false };
  const lazoIds = lazos.map((l) => l.id);

  const desde = new Date(Date.now() - DIAS_RECIENTES * 24 * 3600 * 1000).toISOString();
  const rFallas = await supabase
    .from('lazo_fallas')
    .select('*')
    .in('lazo_id', lazoIds)
    .or(`estado.eq.abierta,resuelta_en.gte.${desde}`)
    .order('abierta_en', { ascending: false });
  if (rFallas.error) {
    if (esErrorDeRed(rFallas.error)) return { busquedas: busquedasLocales(clienteId, ahora), sinConexion: true };
    throw new Error(mensajeError(rFallas.error, 'cargar las búsquedas de falla'));
  }
  const fallas = (rFallas.data as Falla[]) || [];
  if (fallas.length === 0) return { busquedas: [], sinConexion: false };

  const lazosConFalla = [...new Set(fallas.map((f) => f.lazo_id))];
  const [rElementos, rCortes] = await Promise.all([
    supabase.from('lazo_elementos').select('*').in('lazo_id', lazosConFalla),
    supabase.from('lazo_cortes').select('*').in('falla_id', fallas.map((f) => f.id)),
  ]);
  const errorDetalle = rElementos.error || rCortes.error;
  if (errorDetalle) {
    if (esErrorDeRed(errorDetalle)) return { busquedas: busquedasLocales(clienteId, ahora), sinConexion: true };
    throw new Error(mensajeError(errorDetalle, 'cargar los cortes'));
  }
  const elementos = (rElementos.data as Elemento[]) || [];
  const cortes = (rCortes.data as Corte[]) || [];

  const busquedas = fallas.map((falla) => {
    const lazo = lazos.find((l) => l.id === falla.lazo_id) as Lazo;
    return resumirBusqueda(
      lazo,
      elementos.filter((e) => e.lazo_id === lazo.id),
      falla,
      cortes.filter((c) => c.falla_id === falla.id),
      ahora,
    );
  });
  return { busquedas, sinConexion: false };
}

function busquedasLocales(clienteId: string, ahora: string): AnexoFallaTierra[] {
  const lista = leerLocal<LazoResumen[]>(CLAVE_LISTA) || [];
  const resultado: AnexoFallaTierra[] = [];
  for (const lazo of lista.filter((l) => l.cliente_id === clienteId)) {
    const copia = leerLocal<DatosLazo>(clavePaquete(lazo.id));
    if (!copia) continue;
    const datos = aplicarPendientes(copia);
    if (!datos.falla) continue;
    resultado.push(resumirBusqueda(datos.lazo, datos.elementos, datos.falla, datos.cortes, ahora));
  }
  return resultado;
}
