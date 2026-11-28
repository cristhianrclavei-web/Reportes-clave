'use client';

// Partida cerrada en el formulario de cotización: un renglón corto con lo
// esencial. Al tocarla se abre para editar. Así una cotización de 40 partidas
// se recorre de un vistazo en vez de ser una tira larguísima de campos.

import type { PointerEvent } from 'react';
import { ChevronDown, GripVertical, Search } from 'lucide-react';

type Props = {
  numero: number;
  descripcion: string;
  unidad: string;
  cantidad: string;
  precioUnitario: string;
  importe: string;
  // Sin arrastre cuando el sistema tiene una sola partida.
  onIniciarArrastre?: (e: PointerEvent<HTMLButtonElement>) => void;
  tieneSugerencia: boolean;
  onAbrir: () => void;
};

export default function ResumenPartida({
  numero, descripcion, unidad, cantidad, precioUnitario, importe, onIniciarArrastre, tieneSugerencia, onAbrir,
}: Props) {
  return (
    <div className="flex items-stretch">
      {onIniciarArrastre && (
        <button
          type="button"
          onPointerDown={onIniciarArrastre}
          aria-label={`Arrastra la partida ${numero} para moverla`}
          title="Arrastra para cambiar el orden"
          style={{ touchAction: 'none' }}
          className="w-9 shrink-0 flex items-center justify-center text-teal/80 cursor-grab active:cursor-grabbing active:bg-teal/15 select-none"
        >
          <GripVertical size={18} strokeWidth={2.4} />
        </button>
      )}
      <button
        type="button"
        onClick={onAbrir}
        aria-label={`Editar la partida ${numero}`}
        className={`flex-1 min-w-0 flex items-start gap-3 py-3 pr-3 text-left active:bg-teal/5 ${onIniciarArrastre ? '' : 'pl-3'}`}
      >
        <span className="font-display font-bold text-[15px] text-teal tabular-nums leading-6 shrink-0">
          {String(numero).padStart(2, '0')}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] leading-snug line-clamp-2 break-words">{descripcion}</span>
          <span className="block text-[12.5px] text-muted mt-1">
            {cantidad || '0'} {unidad} · {precioUnitario} c/u
            {tieneSugerencia && (
              <span className="ml-2 inline-flex items-center gap-1 text-[#1d7cf2] font-semibold">
                <Search size={11} strokeWidth={2.8} /> Sugerencia SYSCOM
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-semibold text-[14px] tabular-nums leading-6">{importe}</span>
          <ChevronDown size={16} strokeWidth={2.4} className="ml-auto text-muted" />
        </span>
      </button>
    </div>
  );
}
