'use client';

import { useEffect, useState } from 'react';
import { createClient } from './supabaseClient';

// La sección Facturación solo aparece para quien tiene el permiso de
// facturación. Se muestra al instante lo último que se supo y siempre se
// vuelve a consultar: antes un «no» guardado (otra cuenta en la misma
// pestaña, o una consulta que falló) escondía la sección hasta cerrar el
// navegador.
export function usePuedeFacturar(): boolean {
  const [puede, setPuede] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('puedeFacturar') === 'true') setPuede(true);
    } catch { /* sin almacenamiento: se consulta */ }
    createClient()
      .rpc('puedo_gestionar_facturacion')
      .then(({ data, error }) => {
        // Si la consulta falla se deja lo que ya se sabía.
        if (error) return;
        const valor = !!data;
        setPuede(valor);
        try { sessionStorage.setItem('puedeFacturar', String(valor)); } catch { /* modo privado */ }
      });
  }, []);

  return puede;
}
