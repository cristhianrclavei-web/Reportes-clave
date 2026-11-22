'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import Link from '@/components/TransitionLink';
import { FileText, ClipboardList, NotebookPen, PackageCheck, Plus, CalendarClock, Cable, MoreHorizontal, UserRound } from 'lucide-react';

// Navegación del técnico.
//   · Celular: barra fija abajo, al alcance del pulgar (y con guantes):
//     Servicios, Reportes, «Nuevo» al centro, Diagramas y «Más» (Insumos,
//     Bitácora, Solicitudes y Mi perfil). Antes era una fila de 6 pestañas
//     arriba que a 390 px no cabía sin deslizar.
//   · Computadora: barra a todo lo ancho como la del supervisor (DockNav):
//     ícono arriba y nombre, la sección activa resaltada, se eleva al pasar
//     el cursor, y a la derecha «Nuevo reporte», que es lo que más hace.
const TABS = [
  { key: 'reportes', label: 'Reportes', href: '/mis-reportes', Icono: FileText },
  { key: 'servicios', label: 'Servicios', href: '/servicios', Icono: ClipboardList },
  { key: 'checklists', label: 'Insumos', href: '/checklists', Icono: PackageCheck },
  { key: 'bitacora', label: 'Bitácora', href: '/bitacora', Icono: NotebookPen },
  { key: 'solicitudes', label: 'Solicitudes', href: '/solicitudes', Icono: CalendarClock },
  { key: 'lazos', label: 'Diagramas', href: '/lazos', Icono: Cable },
] as const;

export type TecnicoTabKey = (typeof TABS)[number]['key'];

const RESORTE = { type: 'spring', stiffness: 420, damping: 34 } as const;

// Las que van directo en la barra de abajo; las demás, en «Más».
const EN_BARRA: TecnicoTabKey[] = ['servicios', 'reportes'];
const DESPUES_DE_NUEVO: TecnicoTabKey[] = ['lazos'];
const EN_MAS = TABS.filter((t) => !EN_BARRA.includes(t.key) && !DESPUES_DE_NUEVO.includes(t.key));

export default function TecnicoTabs({ active }: { active: TecnicoTabKey }) {
  return (
    <>
      <BarraInferior active={active} />

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

function BotonBarra({ href, label, Icono, activo }: { href: string; label: string; Icono: any; activo: boolean }) {
  return (
    <Link href={href} aria-current={activo ? 'page' : undefined}
      className={`flex-1 min-w-0 min-h-[60px] flex flex-col items-center justify-center gap-1 rounded-2xl transition-colors ${activo ? 'text-teal' : 'text-ink/65 active:bg-surface-2'}`}>
      <Icono size={24} strokeWidth={activo ? 2.5 : 2.1} />
      <span className={`text-[11.5px] truncate max-w-full ${activo ? 'font-semibold' : 'font-medium'}`}>{label}</span>
    </Link>
  );
}

function BarraInferior({ active }: { active: TecnicoTabKey }) {
  const [mas, setMas] = useState(false);
  const enMas = EN_MAS.some((t) => t.key === active);

  useEffect(() => {
    if (!mas) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') setMas(false); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [mas]);

  const tab = (k: TecnicoTabKey) => TABS.find((t) => t.key === k)!;

  return (
    <div className="lg:hidden">
      {mas && <button type="button" aria-label="Cerrar menú" className="fixed inset-0 z-[94] bg-black/40" onClick={() => setMas(false)} />}
      {mas && (
        <div role="menu" aria-label="Más secciones" className="menu-mas-tecnico fixed left-3 right-3 z-[96] rounded-3xl bg-surface border border-line shadow-diffuse p-2 grid grid-cols-2 gap-1.5"
          style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}>
          {[...EN_MAS, { key: 'perfil', label: 'Mi perfil', href: '/perfil', Icono: UserRound }].map((t) => (
            <Link key={t.key} href={t.href} role="menuitem" onClick={() => setMas(false)}
              className={`min-h-[56px] px-3 rounded-2xl flex items-center gap-2.5 text-[14.5px] font-semibold ${t.key === active ? 'bg-teal/12 text-teal' : 'bg-surface-2 text-ink'}`}>
              <t.Icono size={20} strokeWidth={2.2} /> {t.label}
            </Link>
          ))}
        </div>
      )}
      <nav aria-label="Secciones"
        className="barra-tecnico-movil fixed bottom-0 left-0 right-0 z-[95] bg-bg/[0.97] backdrop-blur border-t border-line px-2 pt-1.5 flex items-center gap-1"
        style={{ paddingBottom: 'calc(0.4rem + env(safe-area-inset-bottom))' }}>
        {EN_BARRA.map((k) => <BotonBarra key={k} href={tab(k).href} label={tab(k).label} Icono={tab(k).Icono} activo={active === k} />)}
        <Link href="/nuevo" aria-label="Nuevo reporte" className="shrink-0 mx-1 w-[60px] h-[60px] -mt-5 rounded-full bg-teal text-inkOnAccent shadow-glow-teal flex flex-col items-center justify-center active:scale-95 transition-transform">
          <Plus size={26} strokeWidth={2.8} />
          <span className="text-[10px] font-bold leading-none mt-0.5">Nuevo</span>
        </Link>
        {DESPUES_DE_NUEVO.map((k) => <BotonBarra key={k} href={tab(k).href} label={tab(k).label} Icono={tab(k).Icono} activo={active === k} />)}
        <button type="button" onClick={() => setMas((v) => !v)} aria-expanded={mas} aria-haspopup="menu"
          className={`flex-1 min-w-0 min-h-[60px] flex flex-col items-center justify-center gap-1 rounded-2xl ${enMas || mas ? 'text-teal' : 'text-ink/65'}`}>
          <MoreHorizontal size={24} strokeWidth={enMas ? 2.5 : 2.1} />
          <span className={`text-[11.5px] ${enMas ? 'font-semibold' : 'font-medium'}`}>{enMas ? TABS.find((t) => t.key === active)!.label : 'Más'}</span>
        </button>
      </nav>
    </div>
  );
}
