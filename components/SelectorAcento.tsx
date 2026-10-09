'use client';

import { Check, Palette } from 'lucide-react';
import { ACENTOS_OFRECIDOS, elegirAcento, useAcento } from '@/lib/acento';

// Selector del color de acento en «Mi perfil». Cambia toda la app al tocar
// un color; el logo y los documentos conservan el de la marca.
export default function SelectorAcento() {
  const actual = useAcento();
  return (
    <div className="rounded-2xl bg-surface border border-line p-5">
      <div className="flex items-center gap-3 mb-1">
        <Palette size={20} strokeWidth={2.3} className="text-teal shrink-0" />
        <p className="font-display font-bold text-[19px] tracking-wide">Color de la app</p>
      </div>
      <p className="text-[13px] text-muted mb-4">Elige el color de los botones y resaltados. Se guarda en tu cuenta y te sigue en tus otros dispositivos.</p>
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Color de acento">
        {ACENTOS_OFRECIDOS.map((a) => {
          const sel = a.clave === actual;
          return (
            <button
              key={a.clave}
              type="button"
              role="radio"
              aria-checked={sel}
              onClick={() => elegirAcento(a.clave)}
              className={`group flex flex-col items-center gap-2 rounded-2xl border px-1.5 py-3 transition-all active:scale-95 ${sel ? 'border-teal bg-teal/10' : 'border-line bg-surface-2/50 hover:border-line-strong'}`}
            >
              <span
                className="w-10 h-10 rounded-full flex items-center justify-center shadow-diffuse transition-transform group-hover:scale-110"
                style={{ backgroundColor: a.muestra }}
              >
                {sel && <Check size={19} strokeWidth={3.2} className="text-white drop-shadow" />}
              </span>
              <span className={`text-[11.5px] leading-tight text-center ${sel ? 'font-semibold text-teal' : 'text-muted'}`}>{a.nombre}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
