'use client';

// Borrador del reporte que se está llenando, guardado en el dispositivo
// (IndexedDB). Si la página se recarga por accidente (el gesto de jalar
// hacia abajo en el celular, el navegador que cierra la pestaña, se acaba
// la batería…), al volver a abrir «Nuevo reporte» se recupera tal cual.
//
// Dos registros por usuario: los campos del formulario (se guardan seguido,
// pesan poco) y las fotos (Blobs, solo cuando cambian). Se borra al guardar
// el reporte o al empezar uno nuevo, y con todo lo demás al cerrar sesión
// (clearOfflineData borra todas las bases de IndexedDB).

const DB_NAME = 'reportes-borrador-db';
const STORE = 'borradores';
// Un borrador más viejo que esto ya no se ofrece.
const VIGENCIA_MS = 7 * 24 * 60 * 60 * 1000;

export type FotoBorrador = { name: string; type: string; blob: Blob; caption: string };

export type Borrador = {
  guardadoEn: number;
  campos: Record<string, unknown>;
};

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function operar<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  const db = await abrir();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, modo);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? (req.result as T) : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function guardarCamposBorrador(userId: string, campos: Record<string, unknown>): Promise<void> {
  const b: Borrador = { guardadoEn: Date.now(), campos };
  await operar('readwrite', (s) => s.put(b, `campos:${userId}`));
}

export async function guardarFotosBorrador(userId: string, fotos: FotoBorrador[]): Promise<void> {
  await operar('readwrite', (s) => s.put(fotos, `fotos:${userId}`));
}

export async function leerBorrador(userId: string): Promise<{ borrador: Borrador; fotos: FotoBorrador[] } | null> {
  const borrador = await operar<Borrador>('readonly', (s) => s.get(`campos:${userId}`));
  if (!borrador || Date.now() - borrador.guardadoEn > VIGENCIA_MS) return null;
  const fotos = (await operar<FotoBorrador[]>('readonly', (s) => s.get(`fotos:${userId}`))) || [];
  return { borrador, fotos };
}

export async function borrarBorrador(userId: string): Promise<void> {
  await operar('readwrite', (s) => {
    s.delete(`campos:${userId}`);
    s.delete(`fotos:${userId}`);
  });
}
