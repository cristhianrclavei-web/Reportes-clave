'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';

export type SignaturePadHandle = {
  clear: () => void;
  isEmpty: () => boolean;
  getDataURL: () => string | null;
};

// Una vez que alguien firma, el lienzo se bloquea con un botón aparte — sin
// esto, es fácil que un dedo roce el recuadro mientras se sigue llenando el
// resto del formulario (o mientras el celular pasa de una mano a otra) y
// arruine la firma sin que nadie se dé cuenta hasta después. Para volver a
// dibujar hay que tocar «Editar firma» a propósito.
const SignaturePad = forwardRef<SignaturePadHandle, { height?: number }>(function SignaturePad(
  { height = 140 },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const hasStrokeRef = useRef(false);
  const lockedRef = useRef(false);
  const [hasStroke, setHasStroke] = useState(false);
  const [locked, setLocked] = useState(false);

  function paintWhiteBg(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resize() {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas!.getBoundingClientRect();
      canvas!.width = rect.width * ratio;
      canvas!.height = rect.height * ratio;
      paintWhiteBg(ctx!);
      ctx!.scale(ratio, ratio);
      ctx!.strokeStyle = '#111111';
      ctx!.lineWidth = 2.75;
      ctx!.lineCap = 'round';
      ctx!.lineJoin = 'round';
    }
    resize();

    function pos(e: MouseEvent | TouchEvent) {
      const rect = canvas!.getBoundingClientRect();
      const p = 'touches' in e ? e.touches[0] : e;
      return { x: p.clientX - rect.left, y: p.clientY - rect.top };
    }
    function start(e: MouseEvent | TouchEvent) {
      if (lockedRef.current) return;
      drawingRef.current = true;
      lastRef.current = pos(e);
      e.preventDefault();
    }
    function move(e: MouseEvent | TouchEvent) {
      if (!drawingRef.current) return;
      const p = pos(e);
      ctx!.beginPath();
      ctx!.moveTo(lastRef.current!.x, lastRef.current!.y);
      ctx!.lineTo(p.x, p.y);
      ctx!.stroke();
      lastRef.current = p;
      if (!hasStrokeRef.current) {
        hasStrokeRef.current = true;
        setHasStroke(true);
      }
      e.preventDefault();
    }
    function end() {
      drawingRef.current = false;
    }

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);

    return () => {
      canvas.removeEventListener('mousedown', start);
      canvas.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      canvas.removeEventListener('touchstart', start);
      canvas.removeEventListener('touchmove', move);
      canvas.removeEventListener('touchend', end);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    clear: () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        paintWhiteBg(ctx);
        hasStrokeRef.current = false;
        setHasStroke(false);
        lockedRef.current = false;
        setLocked(false);
      }
    },
    isEmpty: () => !hasStrokeRef.current,
    getDataURL: () => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      // Exportar a un tamaño fijo (no al buffer inflado por devicePixelRatio),
      // así el trazo mantiene un grosor proporcional visible al incrustarse en el PDF/Excel.
      const targetW = 340;
      const targetH = Math.round((canvas.height / canvas.width) * targetW);
      const out = document.createElement('canvas');
      out.width = targetW;
      out.height = targetH;
      const octx = out.getContext('2d');
      if (!octx) return canvas.toDataURL('image/png');
      octx.fillStyle = '#FFFFFF';
      octx.fillRect(0, 0, targetW, targetH);
      octx.drawImage(canvas, 0, 0, targetW, targetH);
      return out.toDataURL('image/png');
    },
  }));

  function handleClear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      paintWhiteBg(ctx);
      hasStrokeRef.current = false;
      setHasStroke(false);
    }
  }

  function handleBloquear() {
    lockedRef.current = true;
    setLocked(true);
  }
  function handleEditar() {
    lockedRef.current = false;
    setLocked(false);
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height, display: 'block', touchAction: 'none', borderRadius: 12, opacity: locked ? 0.55 : 1 }}
      />
      {!locked && (
        <>
          <button
            type="button"
            onClick={handleClear}
            className="absolute top-2 right-2 bg-black/10 border border-black/20 text-[11px] px-2.5 py-1 rounded-full text-black/70 active:scale-90 transition-transform"
          >
            Borrar
          </button>
          {hasStroke && (
            <button
              type="button"
              onClick={handleBloquear}
              className="absolute bottom-2 right-2 bg-teal text-inkOnAccent text-[11px] font-semibold px-2.5 py-1.5 rounded-full flex items-center gap-1 active:scale-90 transition-transform"
            >
              <Lock size={11} strokeWidth={2.6} />
              Listo, bloquear firma
            </button>
          )}
        </>
      )}
      {locked && (
        <button
          type="button"
          onClick={handleEditar}
          className="absolute inset-0 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-black/80 active:scale-[0.98] transition-transform"
        >
          <span className="bg-white/90 border border-black/15 px-3.5 py-2 rounded-full flex items-center gap-1.5 shadow-sm">
            <LockOpen size={13} strokeWidth={2.6} />
            Editar firma
          </span>
        </button>
      )}
    </div>
  );
});

export default SignaturePad;
