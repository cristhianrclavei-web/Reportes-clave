'use client';

import Link from '@/components/TransitionLink';
import { ReactNode, useEffect, useState } from 'react';
import Logo from './Logo';
import PerfilChip from './PerfilChip';
import ThemeToggle from './ThemeToggle';
import CommandPalette from './CommandPalette';
import LogoutButton from './LogoutButton';
import { DashboardTabKey, TABS, TAB_ALMACEN, GRUPOS_NAV } from './DashboardTabs';
import NavPestanas from './NavPestanas';
import { usePuedeAlmacen } from '@/lib/usePuedeAlmacen';
import { VistaSupervisorContext, VistaSupervisor, KEY_VISTA_SUPERVISOR } from '@/lib/vistaSupervisor';
import { LayoutGrid, Rows3, ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

// Encabezado + navegación de todas las pantallas del supervisor.
//
// Dos niveles claros de navegación (ver el documento de rediseño):
//   · computadora: barra lateral fija con las secciones agrupadas;
//   · celular: pestañas fijas bajo el encabezado con todas las secciones.
// Las pestañas DENTRO de cada sección (filtros) usan otro estilo
// (SubTabs), para que no se confundan con esta navegación.
//
// `vista` ya no decide la navegación: solo si las listas se ven como
// tarjetas o como tabla (ver lib/vistaSupervisor.tsx). La preferencia se
// guarda por navegador.
export default function SupervisorShell({
  active,
  title,
  userName,
  mostrarAlmacen,
  acciones,
  volver,
  wrapperClassName = 'max-w-2xl lg:max-w-6xl mx-auto pb-10 lg:px-8',
  children,
}: {
  active: DashboardTabKey;
  title: ReactNode;
  userName?: string;
  mostrarAlmacen?: boolean;
  // Acción principal de la pantalla (p. ej. «Agendar»), junto al título.
  acciones?: ReactNode;
  // Flecha de regresar junto al título, para las secciones que se abren
  // desde «Más» (en el celular no tienen botón propio en la barra inferior).
  volver?: boolean;
  // Cada pantalla trae su ancho ya afinado; en computadora lo controla el
  // layout de dos columnas y se anula con `!`.
  wrapperClassName?: string;
  children: ReactNode;
}) {
  const [vista, setVistaState] = useState<VistaSupervisor>('clasica');
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY_VISTA_SUPERVISOR) === 'nueva') setVistaState('nueva');
    } catch { /* modo privado o almacenamiento bloqueado: se queda en tarjetas */ }
  }, []);
  function setVista(v: VistaSupervisor) {
    setVistaState(v);
    try { localStorage.setItem(KEY_VISTA_SUPERVISOR, v); } catch { /* no crítico */ }
  }

  const router = useRouter();
  // Regresa a la pantalla anterior; si se entró directo (sin historial),
  // al Resumen.
  function regresar() {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/dashboard');
  }

  const puedeAlmacen = usePuedeAlmacen(mostrarAlmacen);
  const todas = puedeAlmacen ? [...TABS, TAB_ALMACEN] : [...TABS];
  const porKey = Object.fromEntries(todas.map((t) => [t.key, t]));

  const botonCambiarVista = (
    <button
      onClick={() => setVista(vista === 'nueva' ? 'clasica' : 'nueva')}
      title={vista === 'nueva' ? 'Ver listas como tarjetas' : 'Ver listas como tabla'}
      aria-label="Cambiar entre tarjetas y tabla"
      className="w-9 h-9 flex items-center justify-center rounded-full border border-line-strong text-ink/70 hover:bg-surface-2 hover:text-ink active:scale-90 transition-transform shrink-0"
    >
      {vista === 'nueva' ? <LayoutGrid size={16} strokeWidth={2.3} /> : <Rows3 size={16} strokeWidth={2.3} />}
    </button>
  );

  const cuerpo = (
    <VistaSupervisorContext.Provider value={{ vista, setVista }}>
      <div className="px-4 lg:px-0 pt-5">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-1.5 min-w-0">
            {volver && (
              <button
                type="button"
                onClick={regresar}
                aria-label="Regresar"
                className="shrink-0 w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-ink/70 hover:bg-surface-2 active:scale-90 transition-transform"
              >
                <ChevronLeft size={24} strokeWidth={2.4} />
              </button>
            )}
            <h1 className="font-display font-bold text-2xl lg:text-3xl tracking-wide min-w-0">{title}</h1>
          </div>
          {acciones && <div className="shrink-0 flex items-center gap-2">{acciones}</div>}
        </div>
        {children}
      </div>
    </VistaSupervisorContext.Provider>
  );

  return (
    <div className="lg:flex lg:items-start lg:gap-6 lg:max-w-[1440px] lg:mx-auto lg:px-6 lg:py-6">
      {/* Computadora: barra lateral */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] glass-strong rounded-3xl p-5">
        <Logo variante="completo" size={30} />
        <nav className="mt-7 flex flex-col gap-5 overflow-y-auto">
          {GRUPOS_NAV.map((g) => {
            const items = g.keys.map((k) => porKey[k]).filter(Boolean);
            if (items.length === 0) return null;
            return (
              <div key={g.titulo}>
                <p className="px-3.5 mb-1.5 text-[11px] uppercase tracking-wider text-muted font-semibold">{g.titulo}</p>
                <div className="flex flex-col gap-0.5">
                  {items.map((item) => (
                    <Link
                      key={item.key}
                      href={item.href}
                      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[14px] font-medium transition-colors ${
                        active === item.key ? 'bg-teal/12 text-teal font-semibold' : 'text-ink/75 hover:bg-surface-2'
                      }`}
                    >
                      <item.Icono size={18} strokeWidth={2.2} className="shrink-0" />
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="mt-auto pt-4 border-t border-line flex flex-col gap-2">
          <PerfilChip nombre={userName} respaldo="Supervisor" />
          <div className="flex items-center justify-between gap-1">
            <CommandPalette puedeAlmacen={puedeAlmacen} />
            <ThemeToggle />
            {botonCambiarVista}
            <LogoutButton compacto />
          </div>
        </div>
      </aside>

      <div className={`${wrapperClassName} pb-10 lg:!max-w-none lg:!mx-0 lg:!px-0 lg:flex-1`}>
        {/* Celular: encabezado con las pestañas de secciones debajo del logo */}
        <div className="lg:hidden sticky top-0 z-20 glass-strong">
          <div className="px-4 pb-1.5 flex items-center justify-between gap-3">
            <Logo variante="completo" size={32} className="min-w-0" compactoEnMovil />
            <div className="flex items-center gap-0.5 shrink-0">
              <CommandPalette puedeAlmacen={puedeAlmacen} />
              <ThemeToggle />
              <PerfilChip nombre={userName} respaldo="Supervisor" />
              <LogoutButton compacto />
            </div>
          </div>
          <NavPestanas items={todas} active={active} />
        </div>
        {cuerpo}
      </div>

    </div>
  );
}
