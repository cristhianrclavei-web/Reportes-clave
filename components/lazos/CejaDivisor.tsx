'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// La ceja entre el plano (izquierda) y el panel (derecha), solo en computadora.
// Se arrastra para darle más espacio a uno u otro; las flechas brincan a
// tamaños fijos (normal, mitad, panel grande) y el doble clic regresa al normal.
// El ancho se guarda en el navegador para la próxima vez.

export const ANCHO_NORMAL = 380;
const ANCHO_MINIMO = 300;
// Lo que siempre le queda al plano, para no perderlo de vista.
const PLANO_MINIMO = 320;
const LLAVE = 'plano:anchoPanel';

function anchoMaximo(): number {
  return Math.max(ANCHO_MINIMO, window.innerWidth - PLANO_MINIMO);
}

function limitar(ancho: number): number {
  return Math.round(Math.min(anchoMaximo(), Math.max(ANCHO_MINIMO, ancho)));
}

// Los tamaños a los que brincan las flechas, de menor a mayor.
function tamanosFijos(): number[] {
  return [ANCHO_NORMAL, limitar(window.innerWidth * 0.5), limitar(window.innerWidth * 0.7)];
}

// El ancho del panel, recordado entre visitas.
export function useAnchoPanel(): [number, (ancho: number, guardar?: boolean) => void] {
  const [ancho, setAncho] = useState(ANCHO_NORMAL);

  useEffect(() => {
    try {
      const guardado = Number(localStorage.getItem(LLAVE));
      if (guardado) setAncho(limitar(guardado));
    } catch {
      // Sin localStorage (modo privado): se queda el ancho normal.
    }
  }, []);

  function cambiar(nuevo: number, guardar = true) {
    const limpio = limitar(nuevo);
    setAncho(limpio);
    if (!guardar) return;
    try {
      localStorage.setItem(LLAVE, String(limpio));
    } catch {
      // Sin localStorage: el ancho dura solo esta visita.
    }
  }

  return [ancho, cambiar];
}

export default function CejaDivisor({ ancho, onAncho }: {
  ancho: number;
  onAncho: (ancho: number, guardar?: boolean) => void;
}) {
  const inicio = useRef<{ x: number; ancho: number } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  function alBajar(e: React.PointerEvent) {
    // Solo la barra; los botones de las flechas tienen su propio clic.
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    inicio.current = { x: e.clientX, ancho };
    setArrastrando(true);
  }

  function alMover(e: React.PointerEvent) {
    if (!inicio.current) return;
    // El panel está a la derecha: llevar la ceja a la izquierda lo agranda.
    const recorrido = inicio.current.x - e.clientX;
    onAncho(inicio.current.ancho + recorrido, false);
  }

  function alSoltar(e: React.PointerEvent) {
    if (!inicio.current) return;
    const recorrido = inicio.current.x - e.clientX;
    onAncho(inicio.current.ancho + recorrido, true);
    inicio.current = null;
    setArrastrando(false);
  }

  function brincar(haciaElPanel: boolean) {
    const fijos = tamanosFijos();
    if (haciaElPanel) {
      const siguiente = fijos.find((t) => t > ancho + 10);
      onAncho(siguiente ?? fijos[fijos.length - 1]);
    } else {
      const anterior = [...fijos].reverse().find((t) => t < ancho - 10);
      onAncho(anterior ?? ANCHO_MINIMO);
    }
  }

  function alTeclado(e: React.KeyboardEvent) {
    const paso = e.shiftKey ? 80 : 24;
    if (e.key === 'ArrowLeft') onAncho(ancho + paso);
    else if (e.key === 'ArrowRight') onAncho(ancho - paso);
    else if (e.key === 'Home') onAncho(ANCHO_NORMAL);
    else return;
    e.preventDefault();
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Ajustar el ancho del plano y del panel"
      aria-valuenow={ancho}
      tabIndex={0}
      title="Arrastra para ajustar · doble clic: tamaño normal"
      onPointerDown={alBajar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alSoltar}
      onDoubleClick={() => onAncho(ANCHO_NORMAL)}
      onKeyDown={alTeclado}
      className="group hidden lg:flex relative z-10 w-3 -mx-1.5 shrink-0 cursor-col-resize touch-none select-none items-center justify-center outline-none"
    >
      {/* La línea que separa los dos lados. */}
      <span className={`absolute inset-y-0 left-1/2 -translate-x-1/2 w-px transition-colors ${arrastrando ? 'bg-teal' : 'bg-line group-hover:bg-teal/60 group-focus-visible:bg-teal'}`} />
      {/* La ceja: una pastilla con agarre y las flechas para brincar de tamaño. */}
      <span className={`relative flex flex-col items-center gap-1 rounded-full border py-1.5 shadow-lg transition-colors ${arrastrando ? 'bg-teal border-teal text-inkOnAccent' : 'bg-surface border-line-strong text-muted group-hover:border-teal group-hover:text-ink group-focus-visible:border-teal'}`}>
        <button type="button" onClick={() => brincar(true)} aria-label="Agrandar el panel" title="Agrandar el panel"
          className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-teal/20 cursor-pointer">
          <ChevronLeft size={15} strokeWidth={2.6} />
        </button>
        <span className="grid grid-cols-2 gap-[3px] py-1" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => <span key={i} className="w-[3px] h-[3px] rounded-full bg-current" />)}
        </span>
        <button type="button" onClick={() => brincar(false)} aria-label="Agrandar el plano" title="Agrandar el plano"
          className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-teal/20 cursor-pointer">
          <ChevronRight size={15} strokeWidth={2.6} />
        </button>
      </span>
    </div>
  );
}
