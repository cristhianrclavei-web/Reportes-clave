'use client';

import { useEffect, useState } from 'react';

export type VistaSupervisor = 'clasica' | 'nueva';

const KEY = 'vistaSupervisorPreferida';

// Preferencia de vista del panel del supervisor (clásica de siempre vs. la
// alterna con sidebar), guardada en este navegador. Empieza en 'clasica' en
// el primer render (server-safe) y se ajusta después de montar si el
// dispositivo ya tenía guardada 'nueva' — evita el desajuste de hidratación
// de Next.js al leer localStorage antes de tiempo.
export function useVistaSupervisor(): [VistaSupervisor, (v: VistaSupervisor) => void] {
  const [vista, setVistaState] = useState<VistaSupervisor>('clasica');

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === 'nueva') setVistaState('nueva');
    } catch { /* modo privado o almacenamiento bloqueado: se queda en clásica */ }
  }, []);

  function setVista(v: VistaSupervisor) {
    setVistaState(v);
    try { localStorage.setItem(KEY, v); } catch { /* no crítico */ }
  }

  return [vista, setVista];
}
