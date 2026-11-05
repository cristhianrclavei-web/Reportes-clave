'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Image as IconoGaleria, X } from 'lucide-react';

// Foto opcional con dos botones. Con `capture` el teléfono abre directo la
// cámara y no deja elegir de la galería, así que la galería va aparte.
export default function CampoFoto({ titulo, archivo, onCambiar, error }: {
  titulo: string;
  archivo: File | null;
  onCambiar: (archivo: File | null) => void;
  error?: string;
}) {
  const entradaCamara = useRef<HTMLInputElement | null>(null);
  const entradaGaleria = useRef<HTMLInputElement | null>(null);
  const [vista, setVista] = useState<string | null>(null);

  // La vista previa se crea y se libera junto con el archivo.
  useEffect(() => {
    if (!archivo) {
      setVista(null);
      return;
    }
    const url = URL.createObjectURL(archivo);
    setVista(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  function alElegir(ev: React.ChangeEvent<HTMLInputElement>) {
    onCambiar(ev.target.files?.[0] || null);
    // Permite volver a elegir la misma foto si la quitaron.
    ev.target.value = '';
  }

  const boton = 'flex-1 min-h-[50px] rounded-xl border border-dashed border-line-strong bg-surface-2 text-[14px] font-medium flex items-center justify-center gap-2';

  return (
    <div>
      <span className="block text-[12.5px] text-muted mb-1">{titulo}</span>
      {vista ? (
        <div className="relative rounded-xl overflow-hidden border border-line">
          <img src={vista} alt="Foto de evidencia" className="w-full max-h-[200px] object-cover" />
          <button type="button" onClick={() => onCambiar(null)} aria-label="Quitar la foto"
            className="absolute top-2 right-2 w-9 h-9 rounded-full bg-bg/80 flex items-center justify-center">
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => entradaCamara.current?.click()} className={boton}>
            <Camera size={18} strokeWidth={2.2} /> Cámara
          </button>
          <button type="button" onClick={() => entradaGaleria.current?.click()} className={boton}>
            <IconoGaleria size={18} strokeWidth={2.2} /> Galería
          </button>
        </div>
      )}
      <input ref={entradaCamara} type="file" accept="image/*" capture="environment" className="hidden" onChange={alElegir} />
      <input ref={entradaGaleria} type="file" accept="image/*" className="hidden" onChange={alElegir} />
      {error && <p className="text-red font-semibold text-[13px] mt-1">{error}</p>}
    </div>
  );
}
