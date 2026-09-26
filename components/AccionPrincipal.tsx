'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Acción principal de una pantalla (Agendar, Entrada…), en dos formas:
//   · computadora: botón compacto al final del renglón de pestañas, pegado
//     al contenido (lo acomoda SubTabs con su prop `accion`);
//   · celular: botón flotante abajo a la derecha, arriba de la barra
//     inferior, al alcance del pulgar.
export function BotonAccion({ label, Icono, onClick }: { label: string; Icono: any; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[38px] px-3.5 rounded-xl bg-teal text-inkOnAccent font-semibold text-[13.5px] flex items-center gap-1.5 shadow-glow-teal hover:brightness-110 active:scale-95 transition-all"
    >
      <Icono size={16} strokeWidth={2.6} /> {label}
    </button>
  );
}

export function BotonFlotante({ label, Icono, onClick }: { label: string; Icono: any; onClick: () => void }) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;
  return createPortal(
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="lg:hidden fixed right-4 z-30 h-14 pl-4 pr-5 rounded-full bg-teal text-inkOnAccent font-display font-semibold text-[15px] flex items-center gap-2 shadow-glow-teal active:scale-95 transition-transform"
      style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))', transform: 'translate3d(0,0,0)' }}
    >
      <Icono size={20} strokeWidth={2.6} /> {label}
    </button>,
    document.body
  );
}
