'use client';

import { useState } from 'react';
import { Image as IconoImagen } from 'lucide-react';
import { urlFotoElemento } from '@/lib/lazosDatos';

// «Ver foto» en el historial: la foto se descarga solo si la piden, para no
// gastar datos con cada renglón.
export default function VerFoto({ path, texto = 'Ver foto' }: { path: string; texto?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [estado, setEstado] = useState<'cerrada' | 'cargando' | 'abierta' | 'error'>('cerrada');

  async function abrir() {
    if (estado === 'abierta') {
      setEstado('cerrada');
      return;
    }
    setEstado('cargando');
    const firmada = await urlFotoElemento(path);
    if (!firmada) {
      setEstado('error');
      return;
    }
    setUrl(firmada);
    setEstado('abierta');
  }

  return (
    <span className="block mt-1">
      <button type="button" onClick={abrir} className="inline-flex items-center gap-1 text-teal text-[12.5px] font-semibold">
        <IconoImagen size={14} strokeWidth={2.2} aria-hidden="true" />
        {estado === 'cargando' ? 'Cargando…' : estado === 'abierta' ? 'Ocultar foto' : texto}
      </button>
      {estado === 'error' && <span className="block text-[12px] text-red">No se pudo cargar la foto (¿sin señal?). Toca para reintentar.</span>}
      {estado === 'abierta' && url && (
        <a href={url} target="_blank" rel="noreferrer" className="block mt-1.5">
          <img src={url} alt="Foto de evidencia de la falla" className="w-full max-h-[260px] object-cover rounded-xl border border-line" />
        </a>
      )}
    </span>
  );
}
