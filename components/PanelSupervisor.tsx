'use client';

import { ReactNode, useEffect, useState } from 'react';
import DockNav from './DockNav';
import { VistaSupervisorContext, VistaSupervisor, KEY_VISTA_SUPERVISOR } from '@/lib/vistaSupervisor';

// Envoltura persistente de todo el panel del supervisor (app/dashboard/
// layout.tsx): no se vuelve a montar al cambiar de sección. Guarda la
// preferencia de listas (tarjetas/tabla) y dibuja la barra de secciones de
// la computadora, que así puede animar su indicador entre pestañas.
export default function PanelSupervisor({ userName, children }: { userName?: string; children: ReactNode }) {
  const [vista, setVistaState] = useState<VistaSupervisor>('clasica');
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY_VISTA_SUPERVISOR) === 'nueva') setVistaState('nueva');
    } catch { /* modo privado: se queda en tarjetas */ }
  }, []);
  function setVista(v: VistaSupervisor) {
    setVistaState(v);
    try { localStorage.setItem(KEY_VISTA_SUPERVISOR, v); } catch { /* no crítico */ }
  }

  return (
    <VistaSupervisorContext.Provider value={{ vista, setVista }}>
      <DockNav userName={userName} />
      {children}
    </VistaSupervisorContext.Provider>
  );
}
