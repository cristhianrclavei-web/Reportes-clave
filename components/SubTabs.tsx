'use client';

import { ReactNode } from 'react';

// Pestañas DENTRO de una sección (Agendados / Concluidos, Reportes /
// Levantamientos…). Van subrayadas y discretas a propósito: la navegación
// entre secciones es la barra lateral o la inferior, y las dos no deben
// verse iguales.
export default function SubTabs<K extends string>({
  opciones,
  activa,
  onCambiar,
  className = '',
}: {
  opciones: { k: K; label: string; Icono?: any; badge?: ReactNode }[];
  activa: K;
  onCambiar: (k: K) => void;
  className?: string;
}) {
  return (
    <div className={`flex gap-1 border-b border-line mb-5 overflow-x-auto no-scrollbar ${className}`} role="tablist">
      {opciones.map(({ k, label, Icono, badge }) => {
        const on = activa === k;
        return (
          <button
            key={k}
            role="tab"
            aria-selected={on}
            onClick={() => onCambiar(k)}
            className={`relative shrink-0 flex items-center gap-1.5 px-3 pb-2.5 pt-1.5 text-[14px] font-semibold whitespace-nowrap transition-colors ${
              on ? 'text-teal' : 'text-ink/60 hover:text-ink'
            }`}
          >
            {Icono && <Icono size={15} strokeWidth={2.3} className="shrink-0" />}
            {label}
            {badge}
            <span className={`absolute left-2 right-2 -bottom-px h-[2.5px] rounded-full ${on ? 'bg-teal' : 'bg-transparent'}`} />
          </button>
        );
      })}
    </div>
  );
}
