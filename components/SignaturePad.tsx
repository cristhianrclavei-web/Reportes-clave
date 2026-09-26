'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PenLine, Pencil, Trash2, X, Check, Eraser } from 'lucide-react';

export type SignaturePadHandle = {
  clear: () => void;
  isEmpty: () => boolean;
  getDataURL: () => string | null;
};

// Firma en dos tiempos:
//   1. En el formulario, el recuadro está bloqueado: solo muestra «Firmar»
//      (o la firma ya guardada con «Editar» y «Borrar»). Así ningún dedo que
//      roce el recuadro al desplazarse arruina una firma.
//   2. «Firmar» abre un lienzo a pantalla completa, cómodo en el celular.
//      «Guardar» recorta la firma a su contenido y la deja fija.
//
// La API (clear / isEmpty / getDataURL) no cambia: los formularios que ya la
// usaban siguen igual.

const PAD = 14; // margen alrededor del trazo al recortar
const MAX_W = 600;
const MAX_H = 240;

const SignaturePad = forwardRef<SignaturePadHandle, { height?: number; titulo?: string }>(function SignaturePad(
  { height = 140, titulo = 'Firma' },
  ref
) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const dataUrlRef = useRef<string | null>(null);
  const [abierto, setAbierto] = useState(false);

  function fijar(v: string | null) {
    dataUrlRef.current = v;
    setDataUrl(v);
  }

  useImperativeHandle(ref, () => ({
    clear: () => fijar(null),
    isEmpty: () => !dataUrlRef.current,
    getDataURL: () => dataUrlRef.current,
  }));

  return (
    <>
      <div className="relative rounded-xl bg-white overflow-hidden" style={{ height }}>
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt="Firma" className="w-full h-full object-contain p-2" />
        ) : (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="absolute inset-0 flex items-center justify-center active:scale-[0.98] transition-transform"
          >
            <span className="bg-teal text-inkOnAccent font-semibold text-[14px] px-5 py-2.5 rounded-full flex items-center gap-2 shadow-glow-teal">
              <PenLine size={16} strokeWidth={2.4} /> Firmar
            </span>
          </button>
        )}
      </div>
      {dataUrl && (
        <div className="flex justify-end gap-2 pt-2 px-2 pb-2">
          <button
            type="button"
            onClick={() => fijar(null)}
            className="min-h-[38px] px-3.5 rounded-full border border-line-strong text-ink/75 text-[13px] font-semibold flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <Trash2 size={14} strokeWidth={2.4} /> Borrar
          </button>
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="min-h-[38px] px-3.5 rounded-full bg-teal text-inkOnAccent text-[13px] font-semibold flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <Pencil size={14} strokeWidth={2.4} /> Editar
          </button>
        </div>
      )}

      {abierto && (
        <LienzoCompleto
          titulo={titulo}
          onCancelar={() => setAbierto(false)}
          onGuardar={(url) => {
            fijar(url);
            setAbierto(false);
          }}
        />
      )}
    </>
  );
});

export default SignaturePad;

// Lienzo a pantalla completa. Se monta en <body> para cubrir todo, incluidas
// las barras fijas de la app.
function LienzoCompleto({
  titulo,
  onCancelar,
  onGuardar,
}: {
  titulo: string;
  onCancelar: () => void;
  onGuardar: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dibujando = useRef(false);
  const ultimo = useRef<{ x: number; y: number } | null>(null);
  // Caja que encierra el trazo, en píxeles CSS, para recortar al guardar.
  const caja = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [hayTrazo, setHayTrazo] = useState(false);

  function prepararCtx(canvas: HTMLCanvasElement) {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(ratio, ratio);
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return ctx;
  }

  function limpiar() {
    if (!canvasRef.current) return;
    prepararCtx(canvasRef.current);
    caja.current = null;
    setHayTrazo(false);
  }

  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const canvas = canvasRef.current!;
    let ctx = prepararCtx(canvas);

    // Al girar el teléfono el lienzo cambia de tamaño: se reinicia para que
    // el trazo no quede deformado.
    function alRedimensionar() {
      ctx = prepararCtx(canvas);
      caja.current = null;
      setHayTrazo(false);
    }

    function pos(e: PointerEvent) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function ampliar(p: { x: number; y: number }) {
      const c = caja.current;
      caja.current = c
        ? { x0: Math.min(c.x0, p.x), y0: Math.min(c.y0, p.y), x1: Math.max(c.x1, p.x), y1: Math.max(c.y1, p.y) }
        : { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    }
    function inicio(e: PointerEvent) {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      dibujando.current = true;
      const p = pos(e);
      ultimo.current = p;
      // Un toque sin arrastrar también deja marca (puntos de una «i», etc.).
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#111111';
      ctx.fill();
      ampliar(p);
      setHayTrazo(true);
    }
    function mover(e: PointerEvent) {
      if (!dibujando.current || !ultimo.current) return;
      e.preventDefault();
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(ultimo.current.x, ultimo.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ultimo.current = p;
      ampliar(p);
    }
    function fin() {
      dibujando.current = false;
      ultimo.current = null;
    }

    canvas.addEventListener('pointerdown', inicio);
    canvas.addEventListener('pointermove', mover);
    canvas.addEventListener('pointerup', fin);
    canvas.addEventListener('pointercancel', fin);
    window.addEventListener('resize', alRedimensionar);
    return () => {
      document.body.style.overflow = previo;
      canvas.removeEventListener('pointerdown', inicio);
      canvas.removeEventListener('pointermove', mover);
      canvas.removeEventListener('pointerup', fin);
      canvas.removeEventListener('pointercancel', fin);
      window.removeEventListener('resize', alRedimensionar);
    };
  }, []);

  function guardar() {
    const canvas = canvasRef.current;
    const c = caja.current;
    if (!canvas || !c) return;
    const ratio = canvas.width / canvas.getBoundingClientRect().width;
    // Recorte al contenido + margen, dentro de los límites del lienzo.
    const sx = Math.max(0, (c.x0 - PAD) * ratio);
    const sy = Math.max(0, (c.y0 - PAD) * ratio);
    const sw = Math.min(canvas.width - sx, (c.x1 - c.x0 + PAD * 2) * ratio);
    const sh = Math.min(canvas.height - sy, (c.y1 - c.y0 + PAD * 2) * ratio);
    const escala = Math.min(1, MAX_W / sw, MAX_H / sh);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(sw * escala));
    out.height = Math.max(1, Math.round(sh * escala));
    const octx = out.getContext('2d')!;
    octx.fillStyle = '#FFFFFF';
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
    onGuardar(out.toDataURL('image/png'));
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-white flex flex-col text-black" role="dialog" aria-modal="true" aria-label={titulo}>
      <div
        className="flex items-center justify-between gap-3 px-4 pb-3 border-b border-black/10"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
      >
        <div className="min-w-0">
          <p className="font-display font-bold text-[17px] truncate">{titulo}</p>
          <p className="text-[12.5px] text-black/55">Firma con el dedo dentro del recuadro</p>
        </div>
        <button type="button" onClick={onCancelar} aria-label="Cancelar" className="w-10 h-10 rounded-full flex items-center justify-center text-black/60 active:scale-90">
          <X size={22} strokeWidth={2.3} />
        </button>
      </div>

      <div className="relative flex-1 m-3 rounded-2xl border-2 border-dashed border-black/15 overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ touchAction: 'none' }} />
        {/* Línea guía, como en un papel */}
        <div className="pointer-events-none absolute left-8 right-8 bottom-[28%] border-b border-black/20" />
        {!hayTrazo && (
          <p className="pointer-events-none absolute inset-x-0 bottom-[calc(28%-1.75rem)] text-center text-[12px] text-black/35">Firma aquí</p>
        )}
      </div>

      <div
        className="flex items-center gap-2.5 px-4 pt-1"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={limpiar}
          disabled={!hayTrazo}
          className="min-h-[50px] px-4 rounded-2xl border border-black/15 text-[14px] font-medium text-black/75 flex items-center gap-1.5 disabled:opacity-40"
        >
          <Eraser size={16} strokeWidth={2.3} /> Borrar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={!hayTrazo}
          className="flex-1 min-h-[50px] rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] tracking-wide flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-95 transition-transform"
        >
          <Check size={18} strokeWidth={2.6} /> Guardar firma
        </button>
      </div>
    </div>,
    document.body
  );
}
