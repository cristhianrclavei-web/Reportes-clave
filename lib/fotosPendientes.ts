'use client';

// Fotos rápidas de un servicio tomadas sin señal. Se guardan en el teléfono
// (IndexedDB) con la hora y la ubicación del momento en que se tomaron, y se
// suben solas cuando vuelve la conexión.
//
// Cada foto lleva un id propio que se usa como id del evento y como nombre
// del archivo: si la subida se corta a medias y se reintenta, no se duplica.
// Base aparte de la de reportes para no tocar su versión; al cerrar sesión
// se borra junto con las demás (clearOfflineData).

import { createClient } from './supabaseClient';
import { reducirFoto } from './reducirFoto';
import { getCurrentLocation, GeoPoint } from './geolocation';
import { fileToDataUrl } from './offlineQueue';
import { generarUUID } from './uuid';

const DB_NAME = 'fotos-servicio-offline-db';
const DB_VERSION = 1;
const STORE_NAME = 'pendientes';

// Se avisa por evento para que la pantalla del servicio se entere de lo que
// sube el sincronizador general (components/OfflineSyncManager).
export const EVENTO_FOTOS_PENDIENTES = 'fotos-servicio-pendientes';

export type FotoPendiente = {
  localId: string;
  servicioId: string;
  userId: string;
  tomadaEn: string;
  ubicacion: GeoPoint;
  fileType: string;
  fileDataUrl: string;
  // Último error que no fue de conexión (permiso, servicio borrado…): se
  // muestra para que la foto no se quede atorada sin explicación.
  error?: string;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'localId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function guardar(foto: FotoPendiente): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(foto);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function quitar(localId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(localId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function listarFotosPendientes(servicioId?: string): Promise<FotoPendiente[]> {
  if (typeof indexedDB === 'undefined') return [];
  try {
    const db = await openDB();
    const todas = await new Promise<FotoPendiente[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => { db.close(); resolve(req.result || []); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
    return todas
      .filter((f) => !servicioId || f.servicioId === servicioId)
      .sort((a, b) => b.tomadaEn.localeCompare(a.tomadaEn));
  } catch {
    return [];
  }
}

export async function contarFotosPendientes(): Promise<number> {
  return (await listarFotosPendientes()).length;
}

function avisar() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_FOTOS_PENDIENTES));
}

export async function descartarFotoPendiente(localId: string): Promise<void> {
  await quitar(localId);
  avisar();
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return new Blob([array], { type: mime });
}

// Falla de conexión (se reintenta sola) contra un rechazo del servidor (hay
// que avisar). Sin señal, fetch lanza TypeError con textos distintos según
// el navegador.
function esFallaDeRed(err: any): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const texto = String(err?.message || err || '').toLowerCase();
  return err?.name === 'TypeError'
    || /failed to fetch|networkerror|load failed|network request failed|fetch failed|timeout|timed out/.test(texto);
}

async function subir(foto: FotoPendiente): Promise<void> {
  const supabase = createClient();
  const path = `servicios/${foto.servicioId}/${foto.localId}.jpg`;
  const { error: e1 } = await supabase.storage
    .from('evidencias')
    .upload(path, dataUrlToBlob(foto.fileDataUrl), { contentType: foto.fileType || 'image/jpeg' });
  // «Ya existe»: el archivo subió en un intento anterior que se cortó
  // antes de registrar el evento.
  if (e1 && !/exists|duplicate/i.test(e1.message || '')) throw e1;

  const { error: e2 } = await supabase.from('servicio_eventos').insert({
    id: foto.localId,
    servicio_id: foto.servicioId,
    tipo: 'evidencia',
    nota: null,
    foto_path: path,
    ubicacion: foto.ubicacion,
    created_by: foto.userId,
    // La hora en que se tomó, no la de la subida.
    created_at: foto.tomadaEn,
  });
  if (e2 && e2.code !== '23505') throw e2;
}

// Foto rápida: primero queda guardada en el teléfono y luego se intenta
// subir. Así no se pierde aunque la señal se caiga a media subida.
export async function tomarFotoRapida(servicioId: string, file: File): Promise<'subida' | 'pendiente'> {
  const supabase = createClient();
  // getSession y no getUser: lee la sesión guardada, sin pedirla a la red.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Tu sesión se cerró; vuelve a entrar.');

  const tomadaEn = new Date().toISOString();
  const [reducida, ubicacion] = await Promise.all([reducirFoto(file), getCurrentLocation()]);
  const foto: FotoPendiente = {
    localId: generarUUID(),
    servicioId,
    userId: session.user.id,
    tomadaEn,
    ubicacion,
    fileType: reducida.type || 'image/jpeg',
    fileDataUrl: await fileToDataUrl(reducida as File),
  };
  await guardar(foto);

  try {
    // Con señal muy débil la subida puede quedarse colgada sin fallar: a los
    // 25 s se deja en la cola (si al final sí llegó, el reintento no duplica).
    await Promise.race([
      subir(foto),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 25000)),
    ]);
  } catch (err: any) {
    if (!esFallaDeRed(err)) {
      await quitar(foto.localId).catch(() => {});
      throw err;
    }
    avisar();
    return 'pendiente';
  }
  await quitar(foto.localId).catch(() => {});
  return 'subida';
}

let enCurso: Promise<{ subidas: number; fallidas: number }> | null = null;

// Sube lo que haya en la cola. Solo las fotos de quien tiene la sesión
// abierta (las de otra cuenta las rechazaría la base). Si ya hay una
// sincronización corriendo, se espera esa en vez de empezar otra.
export function sincronizarFotosPendientes(): Promise<{ subidas: number; fallidas: number }> {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    let subidas = 0;
    let fallidas = 0;
    try {
      const pendientes = await listarFotosPendientes();
      if (pendientes.length === 0) return { subidas, fallidas };
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return { subidas, fallidas };
      const { data: { session } } = await createClient().auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return { subidas, fallidas };

      // De la más vieja a la más nueva, una por una: con señal débil varias
      // subidas a la vez se estorban.
      for (const foto of pendientes.filter((f) => f.userId === userId).reverse()) {
        try {
          await subir(foto);
          await quitar(foto.localId);
          subidas++;
        } catch (err: any) {
          if (esFallaDeRed(err)) break;
          fallidas++;
          await guardar({ ...foto, error: err?.message || 'El servidor rechazó la foto' }).catch(() => {});
        }
      }
    } finally {
      enCurso = null;
    }
    if (subidas > 0 || fallidas > 0) avisar();
    return { subidas, fallidas };
  })();
  return enCurso;
}
