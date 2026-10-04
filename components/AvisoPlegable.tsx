'use client';

import { ReactNode, useState } from 'react';
import { ChevronDown } from 'lucide-react';

// Aviso del Resumen en un renglón: ícono, título, resumen corto y contador.
// El detalle (lista, botones) se abre al tocarlo. Antes cada aviso era un
// cuadro completo y, con varios pendientes a la vez, el Resumen se volvía una
// pared de cuadros rojos y ámbar; así caben todos en una pantalla y el
// supervisor abre solo el que va a atender.

const TONOS = {
  red: { chip: 'bg-red/12 text-red', barra: 'bg-red', cuenta: 'bg-red/12 text-red' },
  amber: { chip: 'bg-amber/15 text-amber', barra: 'bg-amber', cuenta: 'bg-amber/15 text-amber' },
  teal: { chip: 'bg-teal/12 text-teal', barra: 'bg-teal', cuenta: 'bg-teal/12 text-teal' },
} as const;

export default function AvisoPlegable({
  tono, Icono, titulo, resumen, cuenta, children, abiertoInicial = false,
}: {
  tono: keyof typeof TONOS;
  Icono: any;
  titulo: ReactNode;
  // Una línea bajo el título, visible con el aviso cerrado.
  resumen?: ReactNode;
  cuenta?: number;
  children: ReactNode;
  abiertoInicial?: boolean;
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const t = TONOS[tono];
  return (
    <div className="relative mb-2.5 rounded-2xl bg-surface border border-line overflow-hidden">
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${t.barra}`} aria-hidden="true" />
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="w-full flex items-center gap-3 pl-4 pr-3 py-3 text-left active:bg-surface-2/60 transition-colors"
      >
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${t.chip}`}>
          <Icono size={18} strokeWidth={2.3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold leading-snug">{titulo}</span>
          {resumen && !abierto && <span className="block text-[12.5px] text-muted truncate">{resumen}</span>}
        </span>
        {typeof cuenta === 'number' && (
          <span className={`shrink-0 min-w-[26px] h-[26px] px-2 rounded-full text-[12.5px] font-bold tabular-nums flex items-center justify-center ${t.cuenta}`}>
            {cuenta}
          </span>
        )}
        <ChevronDown size={17} className={`shrink-0 text-muted transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && <div className="pl-4 pr-3.5 pb-3.5 pt-0.5">{children}</div>}
    </div>
  );
}
