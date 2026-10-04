'use client';

import { useEffect, useRef } from 'react';
import { createClient } from './supabaseClient';

// Mantiene una pantalla al día sin recargarla.
//
//   1. Tiempo real: se suscribe a los cambios de las tablas indicadas. La
//      base avisa al instante si esas tablas están publicadas
//      (supabase/patch_tiempo_real.sql); si no lo están, la suscripción
//      simplemente no recibe nada y queda el respaldo de abajo.
//   2. Respaldo: cada `cadaMs` (y al volver a la pestaña) pregunta por una
//      `huella` barata — p. ej. cuántos reportes hay y el más reciente — y
//      solo si cambió llama a `alCambiar`. Sin `huella`, llama directo.
//
// `alCambiar` recarga los datos de la pantalla (router.refresh(), cargar()…).
export function useEnVivo({
  tablas,
  alCambiar,
  huella,
  cadaMs = 20000,
}: {
  tablas: string[];
  alCambiar: () => void;
  huella?: () => Promise<string>;
  // 0 = sin respaldo por tiempo (la pantalla ya tiene el suyo).
  cadaMs?: number;
}) {
  const alCambiarRef = useRef(alCambiar);
  alCambiarRef.current = alCambiar;
  const huellaRef = useRef(huella);
  huellaRef.current = huella;
  const clave = tablas.join(',');

  useEffect(() => {
    const supabase = createClient();
    let vivo = true;
    let espera: ReturnType<typeof setTimeout> | null = null;
    let ultima: string | null = null;

    // Varios cambios seguidos (un reporte toca varias tablas) = una recarga.
    const avisar = () => {
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => { if (vivo) alCambiarRef.current(); }, 500);
    };

    const revisar = async () => {
      if (!vivo || document.visibilityState !== 'visible') return;
      const h = huellaRef.current;
      if (!h) { avisar(); return; }
      try {
        const actual = await h();
        if (!vivo) return;
        if (ultima !== null && actual !== ultima) avisar();
        ultima = actual;
      } catch { /* sin red: se intenta en la siguiente vuelta */ }
    };

    const canal = supabase.channel(`en-vivo-${clave}-${Math.random().toString(36).slice(2, 8)}`);
    clave.split(',').forEach((tabla) => {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, () => {
        // La huella se actualiza para que el respaldo no recargue otra vez.
        huellaRef.current?.().then((h) => { ultima = h; }).catch(() => {});
        avisar();
      });
    });
    canal.subscribe();

    if (huellaRef.current) revisar();
    const t = cadaMs > 0 ? setInterval(revisar, cadaMs) : null;
    const alVolver = () => { if (document.visibilityState === 'visible' && cadaMs > 0) revisar(); };
    document.addEventListener('visibilitychange', alVolver);

    return () => {
      vivo = false;
      if (espera) clearTimeout(espera);
      if (t) clearInterval(t);
      document.removeEventListener('visibilitychange', alVolver);
      supabase.removeChannel(canal);
    };
  }, [clave, cadaMs]);
}

// Huella de los reportes: cuántos hay y cuál fue el último. Cambia cuando
// llega uno nuevo o se borra alguno.
export async function huellaReportes(): Promise<string> {
  const supabase = createClient();
  const [{ count }, { data }] = await Promise.all([
    supabase.from('reports').select('id', { count: 'exact', head: true }),
    supabase.from('reports').select('id, created_at').order('created_at', { ascending: false }).limit(1),
  ]);
  return `${count ?? '?'}:${data?.[0]?.id || ''}`;
}
