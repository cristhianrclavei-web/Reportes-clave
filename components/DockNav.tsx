'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import Link from '@/components/TransitionLink';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import LogoutButton from './LogoutButton';
import { DashboardTabKey, seccionesVisibles } from './DashboardTabs';
import { usePuedeAlmacen } from '@/lib/usePuedeAlmacen';
import { usePuedeFacturar } from '@/lib/usePuedeFacturar';
import { usePlan } from '@/lib/planes';
import { useVistaSupervisor } from '@/lib/vistaSupervisor';
import { coincideBusqueda } from '@/lib/busqueda';
import { ClienteCatalogo, catalogoEnCache, listarCatalogoClientes } from '@/lib/clientesCatalogo';
import { navegarConTransicion } from '@/lib/nativeViewTransition';
import { useMiId, usePerfil, urlFoto } from '@/lib/perfiles';
import { Search, X, LayoutGrid, Rows3, Building2 } from 'lucide-react';

// Navegación de la computadora:
//   · renglón del logo con buscador expandible (secciones y clientes), tema,
//     vista y perfil (con tooltips animados);
//   · debajo, barra de secciones fija a todo lo ancho, con ícono y nombre,
//     y el indicador de la sección activa que se desliza (layoutId).
// Vive en app/dashboard/layout.tsx para no volver a montarse al cambiar de
// sección: así el indicador puede animarse de una pestaña a otra.

const RESORTE = { type: 'spring', stiffness: 420, damping: 34 } as const;

function seccionActiva(pathname: string): DashboardTabKey {
  if (pathname === '/dashboard') return 'resumen';
  const [, , seg] = pathname.split('/');
  const mapa: Record<string, DashboardTabKey> = {
    servicios: 'servicios', agenda: 'agenda', reportes: 'reportes', cotizaciones: 'cotizaciones',
    proyectos: 'proyectos', eventos: 'eventos', almacen: 'almacen', facturacion: 'facturacion', personal: 'personal',
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

// Sección de la barra: ícono y nombre. Al pasar el cursor se levantan
// los dos; el fondo de la sección activa se desliza entre secciones.
function SeccionDock({
  href,
  etiqueta,
  Icono,
  activo,
}: {
  href: string;
  etiqueta: string;
  Icono: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  activo: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={activo ? 'page' : undefined}
      className={`group relative flex-1 min-w-0 rounded-[16px] transition-colors ${
        activo ? 'text-teal' : 'text-ink/65 hover:text-ink hover:bg-surface-2'
      }`}
    >
      {activo && (
        <>
          <motion.span
            layoutId="dock-activo-fondo"
            transition={RESORTE}
            className="absolute inset-0 rounded-[16px] bg-teal/12 ring-1 ring-teal/35"
          />
          <motion.span
            layoutId="dock-activo-punto"
            transition={RESORTE}
            className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-teal"
          />
        </>
      )}
      <span className="relative flex flex-col items-center justify-center gap-1.5 pt-3 pb-3.5 px-2 transition-transform duration-200 ease-out group-hover:-translate-y-[3px]">
        <Icono size={22} strokeWidth={activo ? 2.5 : 2.1} />
        <span className={`text-[13px] truncate max-w-full ${activo ? 'font-semibold' : 'font-medium'}`}>{etiqueta}</span>
      </span>
    </Link>
  );
}

export default function DockNav({ userName }: { userName?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const activa = seccionActiva(pathname);
  const puedeAlmacen = usePuedeAlmacen();
  const [vista, setVista] = useVistaSupervisor();
  const puedeFacturar = usePuedeFacturar();
  const plan = usePlan();
  const secciones = seccionesVisibles(puedeAlmacen, puedeFacturar, plan.modulos);
  const miPerfil = usePerfil(useMiId());

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

  const miFoto = urlFoto(miPerfil?.foto_path);
  const iniciales = (userName || '').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

  return (
    <>
      {/* Encabezado de la computadora: se va con el scroll. Marca a la
          izquierda; a la derecha el buscador, las preferencias (tema y vista)
          agrupadas, y la cuenta (perfil y salir). Mismo ancho que el
          contenido de las secciones para que todo quede alineado. */}
      <header className="hidden lg:block">
        <div className="max-w-6xl mx-auto px-8 pt-7 pb-6 flex items-center gap-8">
          <Link href="/dashboard" aria-label="Ir al resumen" className="shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">
            <Logo variante="completo" size={48} />
          </Link>

          <div className="ml-auto flex items-center gap-4 xl:gap-5">
            {/* Buscador siempre visible */}
            <div ref={cajaRef} className="relative">
              <Search size={17} strokeWidth={2.2} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                ref={inputRef}
                value={texto}
                onChange={(e) => { setTexto(e.target.value); setBuscando(true); }}
                onFocus={() => setBuscando(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { cerrar(); inputRef.current?.blur(); }
                  if (e.key === 'Enter' && resultados[0]) ir(resultados[0].href);
                }}
                placeholder="Buscar sección o cliente"
                aria-label="Buscar sección o cliente"
                className="w-[230px] xl:w-[320px] h-12 pl-11 pr-16 rounded-full bg-surface border border-line hover:border-line-strong focus:border-teal focus:ring-4 focus:ring-teal/10 focus:outline-none text-[14px] placeholder:text-muted transition-colors"
              />
              {texto ? (
                <button type="button" aria-label="Limpiar búsqueda" onClick={() => { setTexto(''); inputRef.current?.focus(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-muted hover:bg-surface-2">
                  <X size={15} strokeWidth={2.3} />
                </button>
              ) : (
                <kbd className="absolute right-4 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded-md border border-line bg-surface-2 text-[11px] font-sans font-medium text-muted pointer-events-none">Ctrl K</kbd>
              )}

              <AnimatePresence>
                {buscando && resultados.length > 0 && (
                  <motion.ul
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 right-0 top-full mt-2 rounded-2xl bg-surface border border-line shadow-diffuse p-1.5 z-50"
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

            {/* Preferencias: tema y vista, en una sola cápsula */}
            <div className="flex items-center gap-1 p-1 rounded-full bg-surface border border-line">
              <BotonDock etiqueta="Tema claro / oscuro">
                <ThemeToggle className="w-10 h-10 rounded-full flex items-center justify-center text-ink/70 hover:text-ink hover:bg-surface-2 active:scale-90 transition" />
              </BotonDock>
              <BotonDock etiqueta={vista === 'nueva' ? 'Ver listas como tarjetas' : 'Ver listas como tabla'}>
                <button
                  type="button"
                  aria-label="Cambiar entre tarjetas y tabla"
                  onClick={() => setVista(vista === 'nueva' ? 'clasica' : 'nueva')}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-ink/70 hover:text-ink hover:bg-surface-2 active:scale-90 transition"
                >
                  {vista === 'nueva' ? <LayoutGrid size={18} strokeWidth={2.1} /> : <Rows3 size={18} strokeWidth={2.1} />}
                </button>
              </BotonDock>
            </div>

            <span className="w-px h-9 bg-line-strong" aria-hidden="true" />

            {/* Cuenta: perfil (nombre y rol) y salir */}
            <div className="flex items-center gap-2">
              <Link href="/perfil" aria-label="Mi perfil"
                className="flex items-center gap-3 p-1 xl:pr-4 rounded-full hover:bg-surface border border-transparent hover:border-line transition-colors">
                {miFoto ? (
                  <img src={miFoto} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                ) : (
                  <span className="w-10 h-10 rounded-full bg-teal text-inkOnAccent flex items-center justify-center text-[13px] font-display font-bold shrink-0">
                    {iniciales || 'S'}
                  </span>
                )}
                <span className="hidden xl:block leading-tight text-left">
                  <span className="block text-[14px] font-semibold truncate max-w-[160px]">{userName || 'Supervisor'}</span>
                  <span className="block text-[12px] text-muted truncate max-w-[160px]">{miPerfil?.puesto || 'Supervisor'}</span>
                </span>
              </Link>
              <BotonDock etiqueta="Cerrar sesión">
                <LogoutButton compacto className="w-11 h-11 rounded-full border border-line bg-surface flex items-center justify-center text-ink/65 hover:text-red hover:border-red/40 active:scale-90 transition disabled:opacity-60" />
              </BotonDock>
            </div>
          </div>
        </div>
      </header>

      {/* Barra de secciones: fija arriba al hacer scroll, con ícono y nombre
          de cada sección. */}
      <div className="hidden lg:block sticky top-0 z-30 bg-bg pt-2 pb-3">
        {/* Desvanecido bajo la barra: el contenido se pierde suave al pasar
            por debajo en vez de verse cortado en seco. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-full h-6 bg-gradient-to-b from-bg to-transparent" />
        <div className="max-w-6xl mx-auto px-8">
          <LayoutGroup id="dock">
            <nav
              aria-label="Secciones"
              className="flex items-stretch gap-1.5 rounded-[24px] bg-surface border border-line p-2 shadow-diffuse"
            >
              {secciones.map((t) => (
                <SeccionDock key={t.key} href={t.href} etiqueta={t.label} Icono={t.Icono} activo={t.key === activa} />
              ))}
            </nav>
          </LayoutGroup>
        </div>
      </div>
    </>
  );
}
