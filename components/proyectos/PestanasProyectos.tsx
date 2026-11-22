'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { TOUR_INICIAR } from '@/components/TourGuiado';

// Las vistas de la sección Proyectos, arriba de cada una.
export default function PestanasProyectos({ actual }: { actual: 'clientes' | 'tablero' | 'diagramas' | 'revisiones' }) {
  const vistas = [
    { clave: 'clientes', texto: 'Clientes', href: '/dashboard/proyectos?sub=clientes' },
    { clave: 'tablero', texto: 'Tablero de proyectos', href: '/dashboard/proyectos?sub=tablero' },
    { clave: 'diagramas', texto: 'Diagramas y planos', href: '/dashboard/diagramas' },
    { clave: 'revisiones', texto: 'Cambios por revisar', href: '/dashboard/proyectos?sub=revisiones' },
  ] as const;
  return (
    <div className="flex items-center gap-2 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 mb-4">
      <nav data-tour="pestanas-seccion-proyectos" className="inline-flex gap-1 rounded-xl bg-surface border border-line p-1" aria-label="Vistas de proyectos">
        {vistas.map((v) => (
          <Link key={v.clave} href={v.href} aria-current={actual === v.clave ? 'page' : undefined}
            className={`min-h-[40px] px-3.5 rounded-lg text-[13.5px] font-semibold whitespace-nowrap flex items-center ${actual === v.clave ? 'bg-teal text-inkOnAccent' : 'text-muted hover:text-ink'}`}>
            {v.texto}
          </Link>
        ))}
      </nav>
      <button type="button" onClick={() => window.dispatchEvent(new Event(TOUR_INICIAR))}
        className="shrink-0 min-h-[40px] px-3 rounded-xl text-[13px] font-semibold text-teal flex items-center gap-1.5 hover:bg-teal/10">
        <Sparkles size={15} /> ¿Qué cambió?
      </button>
    </div>
  );
}
