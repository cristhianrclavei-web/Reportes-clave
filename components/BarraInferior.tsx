'use client';

import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Barra de navegación fija abajo (solo celular).
//
// Se monta directo en <body> con un portal: dentro del árbol de la página,
// cualquier ancestro con transform, filter o backdrop-filter convierte a
// `position: fixed` en relativo a ese ancestro, y al hacer scroll (sobre todo
// cuando el navegador muestra u oculta su barra de direcciones) la barra se
// movía o se cortaba. Además va en su propia capa (translate3d) y con fondo
// casi opaco, para que el desenfoque no parpadee al redibujar.
export default function BarraInferior({ children }: { children: ReactNode }) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;

  return createPortal(
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-bg/95 flex justify-around px-1 pt-1.5"
      style={{
        paddingBottom: 'max(0.4rem, env(safe-area-inset-bottom))',
        transform: 'translate3d(0, 0, 0)',
        WebkitBackfaceVisibility: 'hidden',
        backfaceVisibility: 'hidden',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {children}
    </nav>,
    document.body
  );
}
