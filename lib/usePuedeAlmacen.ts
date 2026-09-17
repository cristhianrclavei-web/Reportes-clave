'use client';

import { useEffect, useState } from 'react';
import { createClient } from './supabaseClient';

// Compartido entre DashboardTabs y SupervisorShell: ambos necesitan saber si
// este supervisor puede gestionar almacén para decidir si muestran esa
// sección. Se cachea en sessionStorage para no repetir el RPC en cada
// pantalla dentro de la misma sesión.
export function usePuedeAlmacen(forzado?: boolean): boolean {
  const [puedeAlmacen, setPuedeAlmacen] = useState(forzado ?? false);

  useEffect(() => {
    if (forzado) return;
    const guardado = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('puedeAlmacen') : null;
    if (guardado !== null) {
      setPuedeAlmacen(guardado === 'true');
      return;
    }
    createClient()
      .rpc('puedo_gestionar_almacen')
      .then(({ data }) => {
        const valor = !!data;
        setPuedeAlmacen(valor);
        try { sessionStorage.setItem('puedeAlmacen', String(valor)); } catch { /* modo privado */ }
      });
  }, [forzado]);

  return puedeAlmacen;
}
