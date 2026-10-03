'use client';

import { motion } from 'motion/react';
import Link from '@/components/TransitionLink';
import NavPestanas from '@/components/NavPestanas';
import { FileText, ClipboardList, NotebookPen, PackageCheck, Plus, CalendarClock } from 'lucide-react';

// Navegación del técnico.
//   · Celular: la fila de pestañas de siempre (NavPestanas).
//   · Computadora: barra a todo lo ancho como la del supervisor (DockNav):
//     ícono arriba y nombre, la sección activa resaltada, se eleva al pasar
//     el cursor, y a la derecha «Nuevo reporte», que es lo que más hace.
const TABS = [
  { key: 'reportes', label: 'Reportes', href: '/mis-reportes', Icono: FileText },
  { key: 'servicios', label: 'Servicios', href: '/servicios', Icono: ClipboardList },
  { key: 'checklists', label: 'Insumos', href: '/checklists', Icono: PackageCheck },
  { key: 'bitacora', label: 'Bitácora', href: '/bitacora', Icono: NotebookPen },
  { key: 'solicitudes', label: 'Solicitudes', href: '/solicitudes', Icono: CalendarClock },
] as const;

export type TecnicoTabKey = (typeof TABS)[number]['key'];

const RESORTE = { type: 'spring', stiffness: 420, damping: 34 } as const;

export default function TecnicoTabs({ active }: { active: TecnicoTabKey }) {
  return (
    <>
      <div className="lg:hidden">
        <NavPestanas items={TABS} active={active} />
      </div>

      <div className="hidden lg:block px-3 pt-1">
        <nav
          aria-label="Secciones"
          className="flex items-stretch gap-1 rounded-[22px] bg-surface border border-line p-1.5 shadow-diffuse"
        >
          {TABS.map((t) => {
            const activo = t.key === active;
            return (
              <Link
                key={t.key}
                href={t.href}
                aria-current={activo ? 'page' : undefined}
                className={`group relative flex-1 min-w-0 rounded-[16px] transition-colors ${
                  activo ? 'text-teal' : 'text-ink/65 hover:text-ink hover:bg-surface-2'
                }`}
              >
                {activo && (
                  <>
                    <motion.span
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={RESORTE}
                      className="absolute inset-0 rounded-[16px] bg-teal/12 ring-1 ring-teal/35"
                    />
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-teal" />
                  </>
                )}
                <span className="relative flex flex-col items-center justify-center gap-1 py-2.5 px-2 transition-transform duration-200 ease-out group-hover:-translate-y-[3px]">
                  <t.Icono size={21} strokeWidth={activo ? 2.5 : 2.1} />
                  <span className={`text-[12.5px] truncate max-w-full ${activo ? 'font-semibold' : 'font-medium'}`}>{t.label}</span>
                </span>
              </Link>
            );
          })}
          <span className="w-px my-2 bg-line-strong mx-1" aria-hidden="true" />
          <Link
            href="/nuevo"
            className="group shrink-0 px-5 rounded-[16px] bg-teal text-inkOnAccent shadow-glow-teal flex items-center gap-2 font-semibold text-[14px] transition-transform duration-200 hover:-translate-y-[2px] active:translate-y-0"
          >
            <Plus size={19} strokeWidth={2.6} />
            Nuevo reporte
          </Link>
        </nav>
      </div>
    </>
  );
}
