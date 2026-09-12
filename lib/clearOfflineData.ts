/**
 * Utilidad para limpiar datos offline (IndexedDB, localStorage, Service Worker cache)
 * OWASP A04:2021 - Insecure Design (offline data retention)
 * 
 * Debe llamarse ANTES de cerrar sesión para garantizar que no queden
 * datos sensibles (firmas, fotos) en el dispositivo.
 */

export async function clearOfflineData(): Promise<{
  success: boolean;
  cleared: { indexedDb: boolean; localStorage: boolean; cache: boolean };
  error?: string;
}> {
  const result = {
    success: true,
    cleared: { indexedDb: false, localStorage: false, cache: false },
  };

  try {
    // ===== PASO 1: Limpiar IndexedDB =====
    try {
      const dbNames = await indexedDB.databases();
      for (const db of dbNames) {
        const req = indexedDB.deleteDatabase(db.name);
        await new Promise((resolve, reject) => {
          req.onsuccess = resolve;
          req.onerror = reject;
        });
      }
      result.cleared.indexedDb = true;
      console.log('[CLEANUP] IndexedDB borrada completamente');
    } catch (err: any) {
      console.warn('[CLEANUP] Error borrando IndexedDB:', err.message);
      result.success = false;
    }

    // ===== PASO 2: Limpiar localStorage =====
    try {
      localStorage.clear();
      result.cleared.localStorage = true;
      console.log('[CLEANUP] localStorage borrada completamente');
    } catch (err: any) {
      console.warn('[CLEANUP] Error borrando localStorage:', err.message);
      result.success = false;
    }

    // ===== PASO 3: Limpiar Service Worker caches =====
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
        result.cleared.cache = true;
        console.log('[CLEANUP] Service Worker caches borradas');
      }
    } catch (err: any) {
      console.warn('[CLEANUP] Error borrando caches:', err.message);
      result.success = false;
    }

    // ===== PASO 4: Notificar Service Worker =====
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'CLEAR_ALL_DATA',
          timestamp: new Date().toISOString(),
        });
        console.log('[CLEANUP] Service Worker notificado');
      }
    } catch (err: any) {
      console.warn('[CLEANUP] Error notificando Service Worker:', err.message);
    }

    return result;
  } catch (err: any) {
    return {
      success: false,
      cleared: result.cleared,
      error: err.message || 'Error desconocido',
    };
  }
}

/**
 * Versión segura que pide confirmación si hay datos pendientes
 * Muestra modal si hay reportes sin enviar
 */
export async function safeLogout(): Promise<boolean> {
  // 1. Revisar si hay reportes pendientes
  let hasPendingReports = false;
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('reportes-offline-db');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    await new Promise<void>((resolve) => {
      const tx = db.transaction('pending-reports', 'readonly');
      const countReq = tx.store.count();
      countReq.onsuccess = (e: any) => {
        hasPendingReports = (e.target.result as number) > 0;
        resolve();
      };
      countReq.onerror = () => resolve();
    });

    db.close();
  } catch (err) {
    console.warn('[LOGOUT] Error verificando reportes pendientes:', err);
  }

  // 2. Si hay reportes, pedir confirmación
  if (hasPendingReports) {
    const confirmed = window.confirm(
      '⚠️ Tienes reportes sin enviar.\n\n' +
      'Al cerrar sesión se BORRARÁN todos los datos locales ' +
      '(reportes, fotos, firmas).\n\n' +
      '¿Deseas continuar?'
    );
    if (!confirmed) {
      return false;
    }
  }

  // 3. Limpiar
  const cleanupResult = await clearOfflineData();
  console.log('[LOGOUT] Limpieza completada:', cleanupResult);

  return true;
}
