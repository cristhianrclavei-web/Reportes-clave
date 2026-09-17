'use client';

import Link from 'next/link';
import { ReactNode, useEffect, useState } from 'react';
import Logo from './Logo';
import PerfilChip from './PerfilChip';
import ThemeToggle from './ThemeToggle';
import LogoutButton from './LogoutButton';
import DashboardTabs, { DashboardTabKey } from './DashboardTabs';
import { usePuedeAlmacen } from '@/lib/usePuedeAlmacen';
import { VistaSupervisorContext, VistaSupervisor, KEY_VISTA_SUPERVISOR } from '@/lib/vistaSupervisor';
import { LayoutDashboard, FileText, FolderKanban, CalendarDays, History, Warehouse, LayoutGrid, PanelLeft, Receipt } from 'lucide-react';

const SIDEBAR_ITEMS = [
  { key: 'resumen', label: 'Resumen', href: '/dashboard', Icono: LayoutDashboard },
  { key: 'reportes', label: 'Reportes', href: '/dashboard/reportes', Icono: FileText },
  { key: 'cotizaciones', label: 'Cotizaciones', href: '/dashboard/cotizaciones', Icono: Receipt },
  { key: 'servicios', label: 'Servicios', href: '/dashboard/servicios', Icono: FolderKanban },
  { key: 'agenda', label: 'Agenda', href: '/dashboard/agenda', Icono: CalendarDays },
  { key: 'eventos', label: 'Eventos', href: '/dashboard/eventos', Icono: History },
] as const;
const ITEM_ALMACEN = { key: 'almacen', label: 'Almacén', href: '/dashboard/almacen', Icono: Warehouse } as const;

// Encabezado + navegación de las 6 pantallas del supervisor, en un solo
// lugar. Antes cada pantalla dibujaba su propio header y su propio
// <DashboardTabs>; ahora todas pasan por aquí, lo que permite ofrecer una
// vista alterna (sidebar de escritorio) sin duplicar la decisión en cada
// archivo. La preferencia de vista es por navegador (localStorage) y se
// puede cambiar desde cualquier pantalla con el botón junto al tema.
export default function SupervisorShell({
  active,
  title,
  userName,
  mostrarAlmacen,
  wrapperClassName = 'max-w-2xl lg:max-w-6xl mx-auto pb-10 lg:px-8',
  children,
}: {
  active: DashboardTabKey;
  title: ReactNode;
  userName?: string;
  mostrarAlmacen?: boolean;
  // Cada pantalla trae ligeras variaciones de ancho/padding ya afinadas
  // (ej. Reportes es un poco más ancha, Servicios/Agenda/Eventos llevan más
  // aire abajo). Se respeta tal cual en la vista clásica y en el móvil de
  // la vista nueva; en el sidebar de escritorio se anula con `!` porque ahí
  // el ancho lo controla el layout de dos columnas.
  wrapperClassName?: string;
  children: ReactNode;
}) {
  // Dueño real del estado: useState + localStorage. Se comparte hacia abajo
  // por contexto (ver lib/vistaSupervisor.tsx) para que el cuerpo de la
  // pantalla pueda leer y reaccionar a la misma preferencia, no solo el
  // sidebar/header de este componente.
  const [vista, setVistaState] = useState<VistaSupervisor>('clasica');
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY_VISTA_SUPERVISOR) === 'nueva') setVistaState('nueva');
    } catch { /* modo privado o almacenamiento bloqueado: se queda en clásica */ }
  }, []);
  function setVista(v: VistaSupervisor) {
    setVistaState(v);
    try { localStorage.setItem(KEY_VISTA_SUPERVISOR, v); } catch { /* no crítico */ }
  }

  const puedeAlmacen = usePuedeAlmacen(mostrarAlmacen);
  const items = puedeAlmacen ? [...SIDEBAR_ITEMS, ITEM_ALMACEN] : SIDEBAR_ITEMS;

  const botonCambiarVista = (
    <button
      onClick={() => setVista(vista === 'nueva' ? 'clasica' : 'nueva')}
      title={vista === 'nueva' ? 'Volver a la vista clásica' : 'Probar la vista nueva (con sidebar)'}
      aria-label="Cambiar vista del panel"
      className="w-9 h-9 flex items-center justify-center rounded-full border border-line-strong text-ink/70 hover:bg-white/10 hover:text-ink active:scale-90 transition-transform shrink-0"
    >
      {vista === 'nueva' ? <PanelLeft size={16} strokeWidth={2.3} /> : <LayoutGrid size={16} strokeWidth={2.3} />}
    </button>
  );

  const encabezadoMovil = (
    <div className="sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center justify-between gap-3">
      <Logo variante="completo" size={34} className="min-w-0" compactoEnMovil />
      <div className="flex items-center gap-1 shrink-0">
        <PerfilChip nombre={userName} respaldo="Supervisor" />
        <ThemeToggle />
        {botonCambiarVista}
        <LogoutButton compacto />
      </div>
    </div>
  );

  const cuerpo = (
    <VistaSupervisorContext.Provider value={{ vista, setVista }}>
      <div className="px-4 lg:px-0 pt-5">
        <h1 className="font-display font-bold text-2xl lg:text-3xl tracking-wide mb-4">{title}</h1>
        {userName && <p className="text-[15px] text-muted font-medium mb-4 -mt-2.5">{userName}</p>}
        {vista === 'clasica' && <DashboardTabs active={active} mostrarAlmacen={mostrarAlmacen} />}
        {children}
      </div>
    </VistaSupervisorContext.Provider>
  );

  if (vista === 'nueva') {
    return (
      <div className="lg:flex lg:items-start lg:gap-6 lg:max-w-[1440px] lg:mx-auto lg:px-6 lg:py-6">
        <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] glass-strong rounded-3xl p-5">
          <Logo variante="completo" size={30} />
          <nav className="mt-8 flex flex-col gap-1">
            {items.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[14px] font-display font-semibold tracking-wide transition-colors ${
                  active === item.key ? 'bg-teal text-inkOnAccent shadow-glow-teal' : 'text-ink/70 hover:bg-surface-2'
                }`}
              >
                <item.Icono size={18} strokeWidth={2.4} className="shrink-0" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto pt-5 border-t border-line flex items-center justify-between gap-1">
            <PerfilChip nombre={userName} respaldo="Supervisor" />
            <div className="flex items-center gap-1 shrink-0">
              <ThemeToggle />
              {botonCambiarVista}
              <LogoutButton compacto />
            </div>
          </div>
        </aside>

        <div className={`${wrapperClassName} lg:!max-w-none lg:!mx-0 lg:!px-0 lg:flex-1`}>
          <div className="lg:hidden">{encabezadoMovil}</div>
          {cuerpo}
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClassName}>
      {encabezadoMovil}
      {cuerpo}
    </div>
  );
}
