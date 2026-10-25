'use client';

import { useEffect, useState } from 'react';
import { createClient } from './supabaseClient';

// ¿La cuenta de supervisión tiene el permiso «Sale a servicios»? Con él ve
// el botón para hacer un reporte. Sin el SQL (patch_sale_a_servicios.sql) o
// si la consulta falla, no se muestra: no hay nada que romper.
export function useSaleAServicios(): boolean {
  const [sale, setSale] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('sale_a_servicios').eq('id', user.id).single()
        .then(({ data, error }) => {
          if (error) return;
          setSale(!!(data as { sale_a_servicios?: boolean } | null)?.sale_a_servicios);
        });
    });
  }, []);

  return sale;
}
