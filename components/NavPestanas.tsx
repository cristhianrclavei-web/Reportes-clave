'use client';

import Link from '@/components/TransitionLink';
import { useEffect, useRef } from 'react';

type Item = { key: string; label: string; href: string; Icono: any };

// Navegación entre secciones en el celular: un bloque de pestañas aparte,
// fijo y separado del encabezado por un margen. Todas las secciones quedan visibles (se desliza de lado si
// no caben) y la activa se acomoda sola a la vista al abrir la pantalla.
export default function NavPestanas({ items, active }: { items: readonly Item[]; active: string }) {
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const activa = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    activa?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [active]);

  return (
    <nav ref={navRef} className="flex gap-2 mx-3 mt-2 px-2.5 py-1.5 rounded-2xl pestanas-fijas shadow-glow overflow-x-auto no-scrollbar" aria-label="Secciones">
      {items.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            className={`relative shrink-0 flex items-center gap-1.5 px-4 py-3 text-[13.5px] font-semibold whitespace-nowrap transition-colors ${
              on ? 'text-teal' : 'text-ink/60 hover:text-ink'
            }`}
          >
            <t.Icono size={16} strokeWidth={on ? 2.5 : 2.2} className="shrink-0" />
            {t.label}
            <span className={`absolute left-3 right-3 bottom-1 h-[2.5px] rounded-full ${on ? 'bg-teal' : 'bg-transparent'}`} />
          </Link>
        );
      })}
    </nav>
  );
}
