'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';

// Lee el código de barras (o QR) de la etiqueta de un equipo con la cámara,
// para no teclear el número de serie. Usa el lector que trae el navegador
// (Chrome en Android); donde no existe, el botón ni aparece.

export function hayEscanerDeCodigos(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

export default function EscanerCodigo({ onLeer, onClose }: { onLeer: (texto: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // La función cambia en cada render del padre; la cámara no debe reiniciarse por eso.
  const onLeerRef = useRef(onLeer);
  onLeerRef.current = onLeer;

  useEffect(() => {
    let vivo = true;
    let flujo: MediaStream | null = null;
    let intervalo: ReturnType<typeof setInterval> | null = null;

    async function iniciar() {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch {
        setError('No se pudo abrir la cámara. Revisa el permiso de cámara de la app.');
        return;
      }
      // Se cerró mientras pedía la cámara: se apaga para no dejarla encendida.
      if (!vivo || !videoRef.current) {
        flujo.getTracks().forEach((t) => t.stop());
        return;
      }
      videoRef.current.srcObject = flujo;
      await videoRef.current.play().catch(() => setError('No se pudo mostrar la cámara.'));

      // Sin los tipos de BarcodeDetector en TypeScript: se usa `any`.
      const Detector = (window as any).BarcodeDetector;
      const detector = new Detector();
      let leyendo = false;
      intervalo = setInterval(async () => {
        if (leyendo || !videoRef.current || videoRef.current.readyState < 2) return;
        leyendo = true;
        try {
          const codigos = await detector.detect(videoRef.current);
          const texto = codigos[0]?.rawValue?.trim();
          if (texto && vivo) {
            vivo = false;
            onLeerRef.current(texto);
          }
        } catch (err: any) {
          console.warn('[escaner] No se pudo leer el cuadro:', err?.message);
        } finally {
          leyendo = false;
        }
      }, 350);
    }

    iniciar();
    return () => {
      vivo = false;
      if (intervalo) clearInterval(intervalo);
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <ModalOverlay onClose={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-surface border border-line overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <p className="font-display font-semibold text-[15px]">Escanear número de serie</p>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform">
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>
        {error ? (
          <p className="text-[13px] text-red text-center px-4 py-10">{error}</p>
        ) : (
          <div className="relative bg-black aspect-[4/3]">
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
            <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-20 border-2 border-teal rounded-lg pointer-events-none" />
          </div>
        )}
        <p className="text-[12.5px] text-muted px-4 py-3">Apunta al código de barras de la etiqueta. Se llena solo al leerlo.</p>
      </div>
    </ModalOverlay>
  );
}
