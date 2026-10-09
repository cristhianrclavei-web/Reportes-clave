'use client';

import { createPortal } from 'react-dom';
import { X, Play } from 'lucide-react';
import { duracionCorta } from '@/lib/videoEvidencia';

// Reproductor de un video de evidencia, a pantalla completa. `url` es el
// enlace firmado del archivo.
export default function VisorVideo({ url, onCerrar }: { url: string; onCerrar: () => void }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[205] bg-black/95 flex flex-col" role="dialog" aria-label="Video de evidencia" onClick={onCerrar}>
      <div className="flex justify-end px-4" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="w-11 h-11 rounded-full bg-white/12 text-white flex items-center justify-center active:scale-90 transition-transform">
          <X size={22} strokeWidth={2.4} />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-3" onClick={(e) => e.stopPropagation()}>
        <video src={url} controls autoPlay playsInline className="max-w-full max-h-full rounded-xl" />
      </div>
    </div>,
    document.body,
  );
}

// Marca que se pone encima de la portada de un video: el botón de
// reproducir y su duración. El contenedor debe ser `relative`.
export function MarcaVideo({ dur, chico = false }: { dur?: number | null; chico?: boolean }) {
  return (
    <>
      <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className={`${chico ? 'w-8 h-8' : 'w-11 h-11'} rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-sm`}>
          <Play size={chico ? 14 : 19} fill="currentColor" className="ml-0.5" />
        </span>
      </span>
      {dur ? (
        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/70 text-white text-[10.5px] font-semibold tabular-nums pointer-events-none">{duracionCorta(dur)}</span>
      ) : null}
    </>
  );
}
