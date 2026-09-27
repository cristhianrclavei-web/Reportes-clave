'use client';

import NavPestanas from '@/components/NavPestanas';
import { FileText, ClipboardList, NotebookPen, PackageCheck } from 'lucide-react';

// Navegación del técnico: la misma fila de pestañas que el supervisor,
// dentro del encabezado de cada pantalla (ver NavPestanas).
const TABS = [
  { key: 'reportes', label: 'Reportes', href: '/mis-reportes', Icono: FileText },
  { key: 'servicios', label: 'Servicios', href: '/servicios', Icono: ClipboardList },
  { key: 'checklists', label: 'Herramienta', href: '/checklists', Icono: PackageCheck },
  { key: 'bitacora', label: 'Bitácora', href: '/bitacora', Icono: NotebookPen },
] as const;

export type TecnicoTabKey = (typeof TABS)[number]['key'];

export default function TecnicoTabs({ active }: { active: TecnicoTabKey }) {
  return <NavPestanas items={TABS} active={active} />;
}
