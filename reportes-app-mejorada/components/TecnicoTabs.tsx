'use client';

import Link from 'next/link';
import { FileText, ClipboardList, NotebookPen, PackageCheck } from 'lucide-react';

// Pestañas superiores del técnico, con la misma estructura que las del
// supervisor. Antes la navegación vivía en una barra flotante abajo que solo
// llevaba a Bitácora, y "Mis servicios" quedaba escondido detrás de un botón
// de la pantalla de reportes. En pantallas muy angostas solo se ve el ícono.
const TABS = [
  { key: 'reportes', label: 'Reportes', href: '/mis-reportes', Icono: FileText },
  { key: 'servicios', label: 'Servicios', href: '/servicios', Icono: ClipboardList },
  { key: 'checklists', label: 'Herramienta', href: '/checklists', Icono: PackageCheck },
  { key: 'bitacora', label: 'Bitácora', href: '/bitacora', Icono: NotebookPen },
] as const;

export type TecnicoTabKey = (typeof TABS)[number]['key'];

export default function TecnicoTabs({ active }: { active: TecnicoTabKey }) {
  return (
    <div className="flex gap-1.5 p-1 rounded-2xl bg-surface-2 border border-line mb-5">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`flex-1 min-h-[46px] flex items-center justify-center gap-1.5 rounded-xl text-[13.5px] font-display font-semibold tracking-wide transition-colors ${
            active === t.key ? 'bg-teal text-inkOnAccent shadow-glow-teal' : 'text-ink/70 active:scale-95'
          }`}
        >
          <t.Icono size={16} strokeWidth={2.4} className="shrink-0" />
          <span className="hidden min-[460px]:inline">{t.label}</span>
        </Link>
      ))}
    </div>
  );
}
