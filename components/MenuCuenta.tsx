'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronRight, UserRound, LayoutGrid, Rows3 } from 'lucide-react';
import { useVistaSupervisor } from '@/lib/vistaSupervisor';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import { useMiId, usePerfil, urlFoto } from '@/lib/perfiles';

function iniciales(nombre: string): string {
  return nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

const fila = 'w-full flex items-center gap-3 px-3 min-h-[46px] rounded-xl text-left text-[14.5px] font-medium text-ink/90 hover:bg-surface-2 active:bg-surface-2 transition-colors';

// Menú de la cuenta para el encabezado del celular: la foto (o las iniciales)
// abre un panel con Mi perfil, el manual, el tema y cerrar sesión. Antes cada
// uno era un botón suelto y, junto al buscador, no dejaban lugar al logo.
//
// El panel queda montado aunque esté oculto: el botón de salir abre su
// confirmación en una ventana aparte y no debe desaparecer al cerrarse el menú.
export default function MenuCuenta({ nombre, respaldo = 'Mi cuenta' }: { nombre?: string; respaldo?: string }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const perfil = usePerfil(useMiId());
  const foto = urlFoto(perfil?.foto_path);
  const ini = iniciales(nombre || '');
  const [vista, setVista] = useVistaSupervisor();

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent | TouchEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('touchstart', fuera, { passive: true });
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('touchstart', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  const avatar = (tam: string, letra: string) => foto ? (
    <img src={foto} alt="" className={`${tam} rounded-full object-cover shrink-0`} />
  ) : (
    <span className={`${tam} rounded-full bg-teal text-inkOnAccent flex items-center justify-center ${letra} font-display font-bold shrink-0`}>
      {ini || <UserRound size={17} strokeWidth={2.4} />}
    </span>
  );

  return (
    <div ref={caja} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Mi cuenta"
        aria-haspopup="menu"
        aria-expanded={abierto}
        className={`flex items-center gap-2 rounded-full p-0.5 pr-0.5 min-[420px]:pr-3 border transition-all active:scale-95 ${abierto ? 'border-teal/60 bg-surface-2' : 'border-line-strong bg-surface-2/60'}`}
      >
        {avatar('w-9 h-9', 'text-[11.5px]')}
        <span className="hidden min-[420px]:block text-[13px] font-medium truncate max-w-[110px]">{nombre || respaldo}</span>
      </button>

      <div
        role="menu"
        className={`absolute right-0 top-full mt-2 z-50 w-[272px] max-w-[calc(100vw-1.5rem)] rounded-2xl bg-surface border border-line-strong shadow-diffuse p-2 origin-top-right transition-all duration-150 ${
          abierto ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none invisible'
        }`}
      >
        <Link href="/perfil" role="menuitem" onClick={() => setAbierto(false)}
          className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-2 active:bg-surface-2 transition-colors">
          {avatar('w-11 h-11', 'text-[14px]')}
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-semibold leading-tight truncate">{nombre || respaldo}</span>
            <span className="block text-[12.5px] text-muted truncate">{perfil?.puesto || respaldo}</span>
            <span className="block text-[12px] text-teal font-semibold mt-0.5">Mi perfil</span>
          </span>
          <ChevronRight size={17} className="text-muted shrink-0" />
        </Link>

        <div className="h-px bg-line my-1.5" />

        <Link href="/ayuda" role="menuitem" onClick={() => setAbierto(false)} className={fila}>
          <BookOpen size={18} strokeWidth={2.1} className="text-muted shrink-0" />
          Manual de uso
        </Link>
        <ThemeToggle className={`${fila} [&>svg]:w-[18px] [&>svg]:h-[18px] [&>svg]:shrink-0 [&>svg]:text-muted`} conTexto />
        {/* Listas en tarjetas o en tabla. Solo en computadora: en el celular
            una tabla obliga a deslizar de lado. */}
        <button type="button" role="menuitem" onClick={() => setVista(vista === 'nueva' ? 'clasica' : 'nueva')} className={`${fila} hidden lg:flex`}>
          {vista === 'nueva'
            ? <LayoutGrid size={18} strokeWidth={2.1} className="text-muted shrink-0" />
            : <Rows3 size={18} strokeWidth={2.1} className="text-muted shrink-0" />}
          {vista === 'nueva' ? 'Ver listas como tarjetas' : 'Ver listas como tabla'}
        </button>

        <div className="h-px bg-line my-1.5" />

        <div onClick={() => setAbierto(false)}>
          <LogoutButton compacto conTexto className={`${fila} text-red hover:bg-red/10 active:bg-red/10 disabled:opacity-60`} />
        </div>
      </div>
    </div>
  );
}
