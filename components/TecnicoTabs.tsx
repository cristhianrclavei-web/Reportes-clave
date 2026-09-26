'use client';

import Link from 'next/link';
import { FileText, ClipboardList, NotebookPen, PackageCheck } from 'lucide-react';

// Navegación del técnico: barra inferior fija en el celular (al alcance del
// pulgar, siempre visible) y pestañas arriba en computadora. Las pantallas
// que la usan dejan espacio abajo (pb-28) para que la barra no tape nada.
const TABS = [
  { key: 'reportes', label: 'Reportes', href: '/mis-reportes', Icono: FileText },
  { key: 'servicios', label: 'Servicios', href: '/servicios', Icono: ClipboardList },
  { key: 'checklists', label: 'Herramienta', href: '/checklists', Icono: PackageCheck },
  { key: 'bitacora', label: 'Bitácora', href: '/bitacora', Icono: NotebookPen },
] as const;

export type TecnicoTabKey = (typeof TABS)[number]['key'];

export default function TecnicoTabs({ active }: { active: TecnicoTabKey }) {
  return (
    <>
      {/* Computadora: pestañas arriba */}
      <div className="hidden lg:flex gap-1.5 p-1 rounded-2xl bg-surface-2 border border-line mb-5">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`flex-1 min-h-[46px] flex items-center justify-center gap-1.5 rounded-xl text-[13.5px] font-display font-semibold tracking-wide transition-colors ${
              active === t.key ? 'bg-teal text-inkOnAccent shadow-glow-teal' : 'text-ink/70 active:scale-95'
            }`}
          >
            <t.Icono size={16} strokeWidth={2.4} className="shrink-0" />
            {t.label}
          </Link>
        ))}
      </div>

      {/* Celular: barra inferior, al alcance del pulgar */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 glass-strong border-t border-line flex justify-around px-1 pt-1.5"
        style={{ paddingBottom: 'max(0.4rem, env(safe-area-inset-bottom))' }}
      >
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-[11px] font-semibold ${
              active === t.key ? 'text-teal' : 'text-ink/60'
            }`}
          >
            <t.Icono size={21} strokeWidth={active === t.key ? 2.5 : 2.1} />
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
