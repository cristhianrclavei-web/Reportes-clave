'use client';

import { ReactNode } from 'react';
import DockNav from './DockNav';

// Envoltura persistente de todo el panel del supervisor (app/dashboard/
// layout.tsx): no se vuelve a montar al cambiar de sección. Dibuja la barra
// de secciones de la computadora, que así puede animar su indicador entre
// pestañas. La preferencia de listas (tarjetas/tabla) vive en
// lib/vistaSupervisor.
export default function PanelSupervisor({ userName, children }: { userName?: string; children: ReactNode }) {
  return <DockNav userName={userName}>{children}</DockNav>;
}
