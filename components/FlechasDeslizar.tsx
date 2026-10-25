'use client';

import { RefObject } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { BordesLaterales } from '@/lib/useDesvanecidoLateral';

// Flechas ‹ › para deslizar de lado una fila de pestañas que no cabe. Solo
// salen donde hay mouse: en el celular basta con deslizar el dedo. El
// contenedor de la fila debe ser `relative`.
export default function FlechasDeslizar({ filaRef, bordes }: { filaRef: RefObject<HTMLElement | null>; bordes: BordesLaterales }) {
  function mover(direccion: 1 | -1) {
    const fila = filaRef.current;
    if (!fila) return;
    fila.scrollBy({ left: direccion * fila.clientWidth * 0.7, behavior: 'smooth' });
  }

  const clases = 'absolute top-1/2 -translate-y-1/2 z-10 hidden [@media(hover:hover)]:flex w-8 h-8 rounded-full bg-surface border border-line shadow-diffuse items-center justify-center text-ink/75 hover:text-teal hover:border-teal/50 active:scale-95 transition';
  return (
    <>
      {bordes.izq && (
        <button type="button" onClick={() => mover(-1)} aria-label="Ver las anteriores" className={`${clases} left-1`}>
          <ChevronLeft size={16} strokeWidth={2.4} />
        </button>
      )}
      {bordes.der && (
        <button type="button" onClick={() => mover(1)} aria-label="Ver las siguientes" className={`${clases} right-1`}>
          <ChevronRight size={16} strokeWidth={2.4} />
        </button>
      )}
    </>
  );
}
