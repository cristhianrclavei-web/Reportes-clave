'use client';

import { useEffect, useRef } from 'react';
import { syncPendingReports } from '@/lib/syncOfflineReports';
import { getOfflineReports } from '@/lib/offlineQueue';
import { showToast } from './Toast';

export default function OfflineSyncManager() {
  const syncingRef = useRef(false);

  useEffect(() => {
    async function trySync() {
      if (syncingRef.current) return; // evita sincronizar dos veces al mismo tiempo
      const pending = await getOfflineReports();
      if (pending.length === 0) return;

      syncingRef.current = true;
      try {
        const { synced, failed } = await syncPendingReports();
        if (synced > 0) {
          showToast(
            `✓ ${synced} reporte${synced > 1 ? 's' : ''} pendiente${synced > 1 ? 's' : ''} sincronizado${synced > 1 ? 's' : ''} correctamente`,
            'success'
          );
        }
        if (failed > 0) {
          showToast(
            `No se pudieron sincronizar ${failed} reporte${failed > 1 ? 's' : ''}. Se reintentará más tarde.`,
            'error'
          );
        }
      } finally {
        syncingRef.current = false;
      }
    }

    // Si la app se abre ya con conexión y hay reportes pendientes, sincroniza de inmediato.
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      trySync();
    }

    // Escucha el momento exacto en que la conexión se recupera.
    function handleOnline() {
      trySync();
    }
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  return null;
}
