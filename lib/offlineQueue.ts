'use client';

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
};

export type PendingReport = {
  localId: string; // clave local, no es el id final del reporte
  createdAtLocal: string;
  userId: string;
  userName: string;
  userEmail: string;
  empresaCliente: string;
  fecha: string;
  tipoServicio: string | null;
  subTipoServicio: string | null;
  data: Record<string, any>; // igual a "baseData" pero sin claveFormato todavía
  fotos: PendingFoto[];
  servicioProgramadoId?: string | null;
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
    return reports.length;
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
