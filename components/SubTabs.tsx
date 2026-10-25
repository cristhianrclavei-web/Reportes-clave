'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { useDesvanecidoLateral } from '@/lib/useDesvanecidoLateral';
import FlechasDeslizar from '@/components/FlechasDeslizar';

// Pestañas DENTRO de una sección (Agendados / Concluidos, Reportes /
// Levantamientos…). Van subrayadas y discretas a propósito: la navegación
// entre secciones es la barra lateral o la inferior, y las dos no deben
// verse iguales.
export default function SubTabs<K extends string>({
  opciones,
  activa,
  onCambiar,
  className = '',
  accion,
}: {
  opciones: { k: K; label: string; Icono?: any; badge?: ReactNode }[];
  activa: K;
  onCambiar: (k: K) => void;
  className?: string;
  // Botón al final del renglón (solo en computadora; en celular la acción
  // principal va como botón flotante).
  accion?: ReactNode;
}) {
  const filaRef = useRef<HTMLDivElement | null>(null);
  const { estilo: desvanecido, bordes } = useDesvanecidoLateral(filaRef);
  // La pestaña activa se acomoda a la vista (solo de lado: sin mover la página).
  useEffect(() => {
    const fila = filaRef.current;
    const tab = fila?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!fila || !tab || fila.scrollWidth <= fila.clientWidth) return;
    const dx = tab.getBoundingClientRect().left - fila.getBoundingClientRect().left;
    fila.scrollTo({ left: fila.scrollLeft + dx - (fila.clientWidth - tab.offsetWidth) / 2 });
  }, [activa]);

  return (
    <div className={`flex items-end gap-3 border-b border-line mb-5 ${className}`}>
    <div className="relative flex-1 min-w-0">
    <div ref={filaRef} style={desvanecido} className="flex lg:gap-1 overflow-x-auto no-scrollbar -mb-px" role="tablist">
      {opciones.map(({ k, label, Icono, badge }) => {
        const on = activa === k;
        return (
          <button
            key={k}
            role="tab"
            aria-selected={on}
            onClick={() => onCambiar(k)}
            // En celular se reparten el ancho (grow) en vez de quedar cargadas a la
            // izquierda; si no caben, no se encogen y el renglón se desliza. Un
            // salto de línea en el texto parte la etiqueta en dos renglones.
            className={`relative grow shrink-0 lg:grow-0 flex items-center justify-center gap-1.5 px-2 lg:px-3 pb-2.5 pt-1.5 text-[14px] font-semibold whitespace-pre text-center leading-tight transition-colors ${
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
    <FlechasDeslizar filaRef={filaRef} bordes={bordes} />
    </div>
    {accion && <div className="hidden lg:block shrink-0 pb-2">{accion}</div>}
    </div>
  );
}
