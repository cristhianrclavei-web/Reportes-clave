'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

// Visor de fotos a pantalla completa, tipo carrusel: se pasa de una foto a
// otra con las flechas del teclado, arrastrando (dedo o mouse), con los
// botones de los lados o tocando una miniatura. Esc o tocar fuera cierra.
// Se usa en lugar de abrir cada foto en otra pestaña del navegador.

export type FotoVisor = { url: string; titulo?: string | null };

// Cuánto hay que arrastrar (en píxeles) para cambiar de foto.
const UMBRAL_ARRASTRE = 60;

export default function VisorFotos({ fotos, inicio = 0, onCerrar }: {
  fotos: FotoVisor[];
  inicio?: number;
  onCerrar: () => void;
}) {
  const [actual, setActual] = useState(Math.min(Math.max(inicio, 0), Math.max(fotos.length - 1, 0)));
  const [desplazamiento, setDesplazamiento] = useState(0);
  const arrastre = useRef<{ x: number; id: number } | null>(null);
  // Al soltar un arrastre el navegador manda un clic: no debe cerrar el visor.
  const movio = useRef(false);
  const tira = useRef<HTMLDivElement>(null);
  const hayVarias = fotos.length > 1;

  function ir(paso: number) {
    setActual((i) => (i + paso + fotos.length) % fotos.length);
  }

  // Teclado: flechas para cambiar, Esc para cerrar.
  useEffect(() => {
    // En fase de captura y sin dejar pasar la tecla: así Esc cierra solo el
    // visor y no también el reporte o la ventana que está atrás.
    function alTeclear(e: KeyboardEvent) {
      if (e.key !== 'Escape' && e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.stopPropagation();
      e.preventDefault();
      if (e.key === 'Escape') onCerrar();
      if (e.key === 'ArrowRight' && hayVarias) ir(1);
      if (e.key === 'ArrowLeft' && hayVarias) ir(-1);
    }
    window.addEventListener('keydown', alTeclear, true);
    return () => window.removeEventListener('keydown', alTeclear, true);
    // ir solo depende de fotos.length.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCerrar, hayVarias, fotos.length]);

  // Mientras está abierto, la página de atrás no se desplaza.
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = antes; };
  }, []);

  // La miniatura de la foto actual siempre a la vista.
  useEffect(() => {
    const boton = tira.current?.children[actual] as HTMLElement | undefined;
    boton?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [actual]);

  function inicioArrastre(e: React.PointerEvent) {
    if (!hayVarias) return;
    arrastre.current = { x: e.clientX, id: e.pointerId };
    movio.current = false;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* sin captura: igual funciona */ }
  }
  function moverArrastre(e: React.PointerEvent) {
    if (!arrastre.current || arrastre.current.id !== e.pointerId) return;
    const dx = e.clientX - arrastre.current.x;
    if (Math.abs(dx) > 5) movio.current = true;
    setDesplazamiento(dx);
  }
  function finArrastre(e: React.PointerEvent) {
    if (!arrastre.current || arrastre.current.id !== e.pointerId) return;
    const dx = e.clientX - arrastre.current.x;
    arrastre.current = null;
    setDesplazamiento(0);
    if (dx <= -UMBRAL_ARRASTRE) ir(1);
    else if (dx >= UMBRAL_ARRASTRE) ir(-1);
  }

  if (typeof document === 'undefined' || fotos.length === 0) return null;
  const foto = fotos[actual];
  const arrastrando = desplazamiento !== 0;

  return createPortal(
    <div className="fixed inset-0 z-[210] flex flex-col select-none" style={{ backgroundColor: 'rgba(0, 0, 0, 0.94)' }} role="dialog" aria-modal="true" aria-label="Fotos" onClick={onCerrar}>
      {/* Arriba: contador, título y cerrar */}
      <div className="flex items-center gap-3 px-4 text-white" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }} onClick={(e) => e.stopPropagation()}>
        <span className="font-mono text-[13.5px] text-white/80 shrink-0">{actual + 1} / {fotos.length}</span>
        <span className="flex-1 min-w-0 text-[14px] truncate">{foto.titulo || ''}</span>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="w-11 h-11 rounded-full bg-white/12 flex items-center justify-center active:scale-90 transition-transform shrink-0">
          <X size={22} strokeWidth={2.4} />
        </button>
      </div>

      {/* La foto: se arrastra para cambiar */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        <div
          className="w-full h-full flex items-center justify-center p-3 touch-pan-y"
          onPointerDown={inicioArrastre}
          onPointerMove={moverArrastre}
          onPointerUp={finArrastre}
          onPointerCancel={finArrastre}
          onClickCapture={(e) => { if (movio.current) { e.stopPropagation(); movio.current = false; } }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={foto.url}
            src={foto.url}
            alt={foto.titulo || `Foto ${actual + 1}`}
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            className={`max-w-full max-h-full object-contain rounded-lg ${arrastrando ? '' : 'transition-transform duration-200'}`}
            style={{ transform: `translateX(${desplazamiento}px)` }}
          />
        </div>
        {hayVarias && (
          <>
            <button type="button" onClick={(e) => { e.stopPropagation(); ir(-1); }} aria-label="Foto anterior"
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/55 hover:bg-black/75 ring-1 ring-white/25 text-white flex items-center justify-center active:scale-90 transition">
              <ChevronLeft size={26} strokeWidth={2.4} />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); ir(1); }} aria-label="Foto siguiente"
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/55 hover:bg-black/75 ring-1 ring-white/25 text-white flex items-center justify-center active:scale-90 transition">
              <ChevronRight size={26} strokeWidth={2.4} />
            </button>
          </>
        )}
      </div>

      {/* Miniaturas */}
      {hayVarias && (
        <div ref={tira} className="flex gap-2 overflow-x-auto px-4 pt-2 justify-start sm:justify-center" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()}>
          {fotos.map((f, i) => (
            <button key={`${f.url}-${i}`} type="button" onClick={() => setActual(i)} aria-label={`Ver foto ${i + 1}`} aria-current={i === actual ? 'true' : undefined}
              className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-opacity ${i === actual ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-80'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt="" draggable={false} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
