'use client';

import { ReactNode } from 'react';
import Logo from './Logo';
import PerfilChip from './PerfilChip';
import ThemeToggle from './ThemeToggle';
import CommandPalette from './CommandPalette';
import LogoutButton from './LogoutButton';
import { DashboardTabKey, seccionesVisibles } from './DashboardTabs';
import NavPestanas from './NavPestanas';
import { usePuedeAlmacen } from '@/lib/usePuedeAlmacen';
import { usePuedeFacturar } from '@/lib/usePuedeFacturar';
import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

// Título y navegación del celular para cada pantalla del supervisor.
//
//   · computadora: la barra de secciones (dock) vive en app/dashboard/
//     layout.tsx para no remontarse al cambiar de sección;
//   · celular: encabezado + pestañas fijas con todas las secciones.
// Las pestañas DENTRO de cada sección (filtros) usan otro estilo (SubTabs).
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
  // Flecha de regresar junto al título.
  volver?: boolean;
  // Cada pantalla trae su ancho ya afinado.
  wrapperClassName?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  // Regresa a la pantalla anterior; si se entró directo (sin historial),
  // al Resumen.
  function regresar() {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/dashboard');
  }

  const puedeAlmacen = usePuedeAlmacen(mostrarAlmacen);
  const puedeFacturar = usePuedeFacturar();
  const todas = seccionesVisibles(puedeAlmacen, puedeFacturar);

  return (
    <div className={`${wrapperClassName} pb-10`}>
      {/* Celular: encabezado con las pestañas de secciones debajo del logo */}
      <div className="lg:hidden sticky top-0 z-20 bg-bg pb-2">
        <div
          className="barra-fija px-4 pb-3 flex items-center justify-between gap-3"
          style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
        >
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

      <div className="px-4 lg:px-0 pt-5 lg:pt-4">
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
    </div>
  );
}
