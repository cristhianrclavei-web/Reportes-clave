'use client';

import { ReactNode, useSyncExternalStore } from 'react';

export type VistaSupervisor = 'clasica' | 'nueva';

export const KEY_VISTA_SUPERVISOR = 'vistaSupervisorPreferida';

// Preferencia de listas: tarjetas ('clasica') o tabla ('nueva'). Vive en un
// almacén propio (localStorage + avisos) y no en un contexto, para que la
// lea cualquier pantalla: las del supervisor, las del técnico y el menú de la
// cuenta, que no comparten envoltura. Quien la cambie avisa a todos los
// que la están leyendo, también en otras pestañas.
//
// En el servidor y en el primer dibujo del navegador vale 'clasica'; React
// la corrige al montar, así no hay diferencia de hidratación.

const oyentes = new Set<() => void>();

function leer(): VistaSupervisor {
  try {
    return localStorage.getItem(KEY_VISTA_SUPERVISOR) === 'nueva' ? 'nueva' : 'clasica';
  } catch {
    return 'clasica'; // modo privado: se queda en tarjetas
  }
}

function suscribir(avisar: () => void): () => void {
  oyentes.add(avisar);
  const otraPestana = (e: StorageEvent) => { if (e.key === KEY_VISTA_SUPERVISOR) avisar(); };
  window.addEventListener('storage', otraPestana);
  return () => {
    oyentes.delete(avisar);
    window.removeEventListener('storage', otraPestana);
  };
}

function guardar(v: VistaSupervisor) {
  try { localStorage.setItem(KEY_VISTA_SUPERVISOR, v); } catch { /* no crítico */ }
  oyentes.forEach((f) => f());
}

export function useVistaSupervisor(): [VistaSupervisor, (v: VistaSupervisor) => void] {
  const vista = useSyncExternalStore<VistaSupervisor>(suscribir, leer, () => 'clasica');
  return [vista, guardar];
}

// Dibuja la tabla o las tarjetas según la preferencia. Las dos versiones se
// pasan ya construidas.
export function VistaCondicional({ tabla, tarjetas }: { tabla: ReactNode; tarjetas: ReactNode }) {
  const [vista] = useVistaSupervisor();
  return <>{vista === 'nueva' ? tabla : tarjetas}</>;
}
