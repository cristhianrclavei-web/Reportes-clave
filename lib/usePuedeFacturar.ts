'use client';

import { useEffect, useState } from 'react';
import { createClient } from './supabaseClient';

// Igual que usePuedeAlmacen: la sección Facturación solo aparece para quien
// tiene el permiso de facturación. Se cachea en sessionStorage.
export function usePuedeFacturar(): boolean {
  const [puede, setPuede] = useState(false);

  useEffect(() => {
    const guardado = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('puedeFacturar') : null;
    if (guardado !== null) {
      setPuede(guardado === 'true');
      return;
    }
    createClient()
      .rpc('puedo_gestionar_facturacion')
      .then(({ data }) => {
        const valor = !!data;
        setPuede(valor);
        try { sessionStorage.setItem('puedeFacturar', String(valor)); } catch { /* modo privado */ }
      });
  }, []);

  return puede;
}
