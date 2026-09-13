/**
 * Utilidad para limpiar datos offline (IndexedDB, localStorage, Service Worker cache)
 * OWASP A04:2021 - Insecure Design (offline data retention)
 * 
 * IMPORTANTE: llamarla DESPUES de signOut(), no antes ni en paralelo.
 * El PASO 2 hace localStorage.clear(), y ahi es donde supabase-js guarda
 * el token de sesion. Si se borra mientras signOut() esta en vuelo, esa
 * llamada se queda esperando un token que ya no existe y el logout se
 * cuelga sin redirigir.
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
        if (db.name) {
          const req = indexedDB.deleteDatabase(db.name);
          // deleteDatabase se queda en 'blocked' mientras haya alguna
          // conexion abierta a esa base, y en ese caso no dispara ni
          // onsuccess ni onerror. Sin manejarlo, la promesa quedaba
          // colgada para siempre y la limpieza nunca terminaba.
          await new Promise<void>((resolve) => {
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => resolve();
            // Red de seguridad por si el navegador no dispara ninguno.
            setTimeout(resolve, 2000);
          });
        }
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
      const countReq = tx.objectStore('pending-reports').count();
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
