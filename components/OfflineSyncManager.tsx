'use client';

import { useEffect, useRef } from 'react';
import { syncPendingReports } from '@/lib/syncOfflineReports';
import { getOfflineReports, faltaSubir } from '@/lib/offlineQueue';
import { sincronizarFotosPendientes } from '@/lib/fotosPendientes';
import { showToast } from './Toast';

export default function OfflineSyncManager() {
  const syncingRef = useRef(false);

  useEffect(() => {
    async function trySync() {
      // Fotos rápidas de servicios tomadas sin señal (cola aparte).
      sincronizarFotosPendientes()
        .then(({ subidas }) => {
          if (subidas > 0) showToast(`${subidas} foto${subidas > 1 ? 's' : ''} pendiente${subidas > 1 ? 's' : ''} ya se subi${subidas > 1 ? 'eron' : 'ó'}`, 'success');
        })
        .catch(() => {});
      if (syncingRef.current) return; // evita sincronizar dos veces al mismo tiempo
      const pending = (await getOfflineReports()).filter(faltaSubir);
      if (pending.length === 0) return;

      syncingRef.current = true;
      try {
        const { synced, failed, rechazadas } = await syncPendingReports();
        if (synced > 0) {
          showToast(
            `${synced} reporte${synced > 1 ? 's' : ''} pendiente${synced > 1 ? 's' : ''} sincronizado${synced > 1 ? 's' : ''} correctamente`,
            'success'
          );
        }
        if (rechazadas > 0) {
          showToast(
            `${rechazadas} foto${rechazadas > 1 ? 's' : ''} o video${rechazadas > 1 ? 's' : ''} no se pudo${rechazadas > 1 ? 'ieron' : ''} subir: el servidor no acepta ese tipo o tamaño de archivo. El reporte sí se guardó y el archivo sigue en este teléfono; avisa a tu supervisor.`,
            'error'
          );
        }
        if (failed > 0) {
          showToast(
            `No se pudieron sincronizar ${failed} reporte${failed > 1 ? 's' : ''}. Siguen guardados en este teléfono y se reintentará al abrir la app o al recuperar la señal.`,
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
