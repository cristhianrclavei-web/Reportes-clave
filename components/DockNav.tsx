'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import Link from '@/components/TransitionLink';
import Logo from './Logo';
import PerfilChip from './PerfilChip';
import ThemeToggle from './ThemeToggle';
import LogoutButton from './LogoutButton';
import { TABS, TAB_ALMACEN, DashboardTabKey } from './DashboardTabs';
import { usePuedeAlmacen } from '@/lib/usePuedeAlmacen';
import { useVistaSupervisor } from '@/lib/vistaSupervisor';
import { coincideBusqueda } from '@/lib/busqueda';
import { ClienteCatalogo, catalogoEnCache, listarCatalogoClientes } from '@/lib/clientesCatalogo';
import { navegarConTransicion } from '@/lib/nativeViewTransition';
import { Search, X, LayoutGrid, Rows3, Building2 } from 'lucide-react';

// Barra de secciones de la computadora, estilo dock: fija arriba, todas las
// secciones a la vista, con
//   · indicador de la sección activa que se desliza entre pestañas (layoutId),
//   · tooltips animados al pasar el cursor,
//   · buscador que se expande dentro de la misma barra (secciones y clientes).
// Vive en app/dashboard/layout.tsx para no volver a montarse al cambiar de
// sección: así el indicador puede animarse de una pestaña a otra.

const RESORTE = { type: 'spring', stiffness: 420, damping: 34 } as const;

function seccionActiva(pathname: string): DashboardTabKey {
  if (pathname === '/dashboard') return 'resumen';
  const [, , seg] = pathname.split('/');
  const mapa: Record<string, DashboardTabKey> = {
    servicios: 'servicios', agenda: 'agenda', reportes: 'reportes', cotizaciones: 'cotizaciones',
    proyectos: 'proyectos', eventos: 'eventos', almacen: 'almacen',
  };
  return mapa[seg] || 'resumen';
}

// Etiqueta flotante bajo el icono al pasar el cursor.
function Tooltip({ texto, visible }: { texto: string; visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.span
          role="tooltip"
          initial={{ opacity: 0, y: -4, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.96 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="pointer-events-none absolute top-full mt-2.5 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap rounded-lg bg-teal px-2.5 py-1 text-[12px] font-semibold text-inkOnAccent shadow-glow-teal"
        >
          <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-teal" />
          <span className="relative">{texto}</span>
        </motion.span>
      )}
    </AnimatePresence>
  );
}

// Botón del dock: se eleva un poco al pasar el cursor y muestra su tooltip.
function BotonDock({
  etiqueta,
  activo = false,
  children,
}: {
  etiqueta: string;
  activo?: boolean;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <motion.div
      className="relative"
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      whileHover={{ y: -2 }}
      transition={RESORTE}
    >
      {activo && (
        <>
          <motion.span
            layoutId="dock-activo-fondo"
            transition={RESORTE}
            className="absolute inset-0 rounded-[14px] bg-teal/12 ring-1 ring-teal/35"
          />
          <motion.span
            layoutId="dock-activo-punto"
            transition={RESORTE}
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-teal"
          />
        </>
      )}
      <div className="relative">{children}</div>
      <Tooltip texto={etiqueta} visible={hover} />
    </motion.div>
  );
}

const claseIcono = (activo: boolean) =>
  `w-11 h-11 rounded-[14px] flex items-center justify-center transition-colors ${
    activo ? 'text-teal' : 'text-ink/65 hover:text-ink hover:bg-surface-2'
  }`;

export default function DockNav({ userName }: { userName?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const activa = seccionActiva(pathname);
  const puedeAlmacen = usePuedeAlmacen();
  const [vista, setVista] = useVistaSupervisor();
  const secciones = puedeAlmacen ? [...TABS, TAB_ALMACEN] : [...TABS];

  // --- Buscador expandible ---
  const [buscando, setBuscando] = useState(false);
  const [texto, setTexto] = useState('');
  const [clientes, setClientes] = useState<ClienteCatalogo[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const cajaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!buscando) return;
    setClientes(catalogoEnCache());
    listarCatalogoClientes().then(setClientes).catch(() => {});
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    function fuera(e: MouseEvent) {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) cerrar();
    }
    document.addEventListener('mousedown', fuera);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('mousedown', fuera);
    };
  }, [buscando]);

  // Ctrl/Cmd+K abre el buscador, como antes la paleta de comandos.
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setBuscando(true);
      }
    }
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, []);

  function cerrar() {
    setBuscando(false);
    setTexto('');
  }

  const resultados = useMemo(() => {
    const q = texto.trim();
    if (!q) return [] as { tipo: 'seccion' | 'cliente'; etiqueta: string; href: string; Icono: any }[];
    const s = secciones
      .filter((t) => coincideBusqueda(t.label, q))
      .map((t) => ({ tipo: 'seccion' as const, etiqueta: t.label, href: t.href, Icono: t.Icono }));
    const c = clientes
      .filter((x) => coincideBusqueda(`${x.nombre} ${x.alias.join(' ')}`, q))
      .slice(0, 5)
      .map((x) => ({ tipo: 'cliente' as const, etiqueta: x.nombre, href: `/dashboard/proyectos/${x.id}`, Icono: Building2 }));
    return [...s, ...c];
  }, [texto, clientes, secciones]);

  function ir(href: string) {
    cerrar();
    navegarConTransicion(() => router.push(href));
  }

  return (
    <div className="hidden lg:block sticky top-0 z-30 bg-bg/90 backdrop-blur-md">
      <div className="max-w-[1440px] mx-auto px-6 py-3 flex items-center gap-6">
        <Logo variante="completo" size={30} className="shrink-0" />

        <LayoutGroup id="dock">
          <nav
            aria-label="Secciones"
            className="mx-auto flex items-center gap-1.5 rounded-[22px] bg-surface border border-line p-1.5 shadow-diffuse"
          >
            {secciones.map((t) => (
              <BotonDock key={t.key} etiqueta={t.label} activo={t.key === activa}>
                <Link href={t.href} aria-label={t.label} aria-current={t.key === activa ? 'page' : undefined} className={claseIcono(t.key === activa)}>
                  <t.Icono size={19} strokeWidth={t.key === activa ? 2.5 : 2.1} />
                </Link>
              </BotonDock>
            ))}

            <span className="w-px h-7 bg-line-strong mx-1.5" aria-hidden="true" />

            {/* Buscador: el campo crece dentro de la barra sin cambiar su alto */}
            <div ref={cajaRef} className="relative flex items-center">
              <BotonDock etiqueta={buscando ? 'Cerrar búsqueda' : 'Buscar (Ctrl+K)'}>
                <button
                  type="button"
                  aria-label="Buscar"
                  onClick={() => (buscando ? cerrar() : setBuscando(true))}
                  className={claseIcono(buscando)}
                >
                  {buscando ? <X size={19} strokeWidth={2.2} /> : <Search size={19} strokeWidth={2.2} />}
                </button>
              </BotonDock>
              <div
                className="overflow-hidden transition-[width,opacity] duration-300 ease-out"
                style={{ width: buscando ? 240 : 0, opacity: buscando ? 1 : 0 }}
              >
                <input
                  ref={inputRef}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') cerrar();
                    if (e.key === 'Enter' && resultados[0]) ir(resultados[0].href);
                  }}
                  tabIndex={buscando ? 0 : -1}
                  placeholder="Sección o cliente…"
                  className="w-[232px] ml-1 h-11 px-3 rounded-[14px] bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14px]"
                />
              </div>

              <AnimatePresence>
                {buscando && resultados.length > 0 && (
                  <motion.ul
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-3 w-[280px] rounded-2xl bg-surface border border-line shadow-diffuse p-1.5 z-50"
                  >
                    {resultados.map((r, i) => (
                      <li key={r.href}>
                        <button
                          type="button"
                          onClick={() => ir(r.href)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-[14px] hover:bg-surface-2 ${i === 0 ? 'bg-surface-2' : ''}`}
                        >
                          <r.Icono size={16} strokeWidth={2.2} className="text-teal shrink-0" />
                          <span className="flex-1 truncate">{r.etiqueta}</span>
                          <span className="text-[11px] text-muted">{r.tipo === 'cliente' ? 'Cliente' : 'Sección'}</span>
                        </button>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>

            <BotonDock etiqueta="Tema claro / oscuro">
              <div className="w-11 h-11 flex items-center justify-center">
                <ThemeToggle />
              </div>
            </BotonDock>
            <BotonDock etiqueta={vista === 'nueva' ? 'Ver listas como tarjetas' : 'Ver listas como tabla'}>
              <button
                type="button"
                aria-label="Cambiar entre tarjetas y tabla"
                onClick={() => setVista(vista === 'nueva' ? 'clasica' : 'nueva')}
                className={claseIcono(false)}
              >
                {vista === 'nueva' ? <LayoutGrid size={19} strokeWidth={2.1} /> : <Rows3 size={19} strokeWidth={2.1} />}
              </button>
            </BotonDock>
          </nav>
        </LayoutGroup>

        <div className="shrink-0 flex items-center gap-1">
          <PerfilChip nombre={userName} respaldo="Supervisor" />
          <LogoutButton compacto />
        </div>
      </div>
    </div>
  );
}
