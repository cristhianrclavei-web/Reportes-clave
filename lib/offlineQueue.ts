'use client';

import type { MetaFoto, EvidenciaGuardada } from './evidencias';

// Almacén local (IndexedDB) para reportes creados sin conexión a internet.
// Se guarda todo lo necesario para poder terminarlo de subir después: los
// datos del formulario, quién lo creó, y las fotos (como dataURL, ya que
// los objetos File no viajan de forma confiable entre sesiones del navegador).

const DB_NAME = 'reportes-offline-db';
const DB_VERSION = 1;
const STORE_NAME = 'pending-reports';

export type PendingFoto = {
  fileName: string;
  fileType: string;
  fileDataUrl: string;
  caption: string;
  // Etapa, área, «solo en la app» y cuándo se tomó (lib/evidencias).
  meta?: MetaFoto;
  // Evidencia en video: lo de arriba es su portada y esto, el video.
  videoDataUrl?: string;
  videoType?: string;
  dur?: number;
};

export type PendingReport = {
  localId: string; // clave local, no es el id final del reporte
  createdAtLocal: string;
  userId: string;
  userName: string;
  userEmail: string;
  empresaCliente: string;
  // Cliente elegido de la lista (opcional: si falta, la base lo resuelve
  // por nombre al sincronizar).
  clienteId?: string | null;
  fecha: string;
  tipoServicio: string | null;
  subTipoServicio: string | null;
  data: Record<string, any>; // igual a "baseData" pero sin claveFormato todavía
  fotos: PendingFoto[];
  // Fotos que ya estaban subidas al servicio (avances, evidencia, tareas) al
  // momento de guardar sin conexión: solo llevan su path, no dataURL, porque
  // ya viven en Storage y no hace falta volver a subirlas al sincronizar.
  fotosExistentes?: EvidenciaGuardada[];
  servicioProgramadoId?: string | null;
  // Avance de la sincronización (lib/syncOfflineReports.ts). Se guarda aquí
  // para que un reintento continúe donde se quedó en vez de crear otro
  // reporte o volver a subir las fotos que ya subieron.
  sync?: AvanceSync;
};

export type AvanceSync = {
  // Id y folio del reporte en el servidor: se fijan una sola vez.
  reportId: string;
  claveFormato: string;
  // Evidencias ya subidas, por posición en `fotos`.
  subidas: Record<number, EvidenciaGuardada>;
  // true = el reporte ya está completo en el servidor y aquí solo quedan
  // guardadas las fotos que el servidor no aceptó (para no perderlas).
  terminado?: boolean;
};

// ¿Todavía hay que subir este reporte?
export function faltaSubir(reporte: PendingReport): boolean {
  return !reporte.sync?.terminado;
}

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

export async function saveOfflineReport(report: PendingReport): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(report);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOfflineReports(): Promise<PendingReport[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteOfflineReport(localId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(localId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function countOfflineReports(): Promise<number> {
  try {
    const reports = await getOfflineReports();
    return reports.filter(faltaSubir).length;
  } catch {
    return 0;
  }
}

// Convierte un File (foto tomada en el formulario) a dataURL para poder
// guardarlo en IndexedDB de forma segura.
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
