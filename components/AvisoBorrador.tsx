'use client';

import { History } from 'lucide-react';

// Aviso de «recuperamos lo que estabas llenando» (borrador automático).
export default function AvisoBorrador({ que, guardadoEn, onDescartar }: { que: string; guardadoEn: number; onDescartar: () => void }) {
  return (
    <div className="rounded-2xl px-4 py-3 bg-teal/10 border border-teal/30 flex items-start gap-2.5">
      <History size={18} className="text-teal shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 text-[13px]">
        <p className="font-semibold text-teal">Recuperamos {que} que estabas llenando</p>
        <p className="text-muted">Guardado en este dispositivo el {new Date(guardadoEn).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}.</p>
      </div>
      <button type="button" onClick={onDescartar} className="shrink-0 text-[12.5px] font-semibold text-muted underline py-0.5">
        Descartar
      </button>
    </div>
  );
}
