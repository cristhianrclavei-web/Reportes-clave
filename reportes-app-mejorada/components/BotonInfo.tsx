'use client';

import { useState } from 'react';
import { Info, X } from 'lucide-react';

// Explicación de un indicador, escondida detrás de una «i».
//
// Se despliega dentro de la tarjeta en vez de abrir un modal: un tablero tiene
// siete de estos, y siete modales para leer siete frases es más ceremonia de
// la que merece. Además así la cifra sigue a la vista mientras se lee qué
// significa, que es justo cuando se necesita.
export default function BotonInfo({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={`Qué significa: ${titulo}`}
        aria-expanded={abierto}
        // El área táctil es de 32px aunque el icono mida 13: en la barra de una
        // tarjeta no cabe más, pero el dedo necesita blanco alrededor.
        className={`shrink-0 w-8 h-8 -m-1 rounded-full flex items-center justify-center transition-colors ${
          abierto ? 'text-teal' : 'text-faint'
        }`}
      >
        <Info size={13} strokeWidth={2.4} />
      </button>

      {abierto && (
        <div className="col-span-full w-full mt-2 mb-1 p-3 rounded-xl bg-surface-2 border border-line">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12.5px] text-ink/80 leading-relaxed">{children}</p>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar explicación"
              className="shrink-0 w-7 h-7 -mt-0.5 -mr-0.5 flex items-center justify-center text-muted"
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
