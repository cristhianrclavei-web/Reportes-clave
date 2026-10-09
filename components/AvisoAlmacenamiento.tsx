'use client';

import { useEffect, useState } from 'react';
import { HardDrive } from 'lucide-react';
import { usoAlmacenamiento, CAPACIDAD_GB, pesoTexto } from '@/lib/videoEvidencia';

// Aviso a supervisión cuando lo guardado (fotos, videos, documentos) pasa del
// 80 % de la capacidad del plan. Con videos el espacio se llena más rápido,
// y al llenarse dejarían de subirse las evidencias. No dibuja nada mientras
// hay margen, ni si la base aún no tiene la función que lo calcula.
const UMBRAL = 0.8;

export default function AvisoAlmacenamiento() {
  const [usado, setUsado] = useState<number | null>(null);
  useEffect(() => { usoAlmacenamiento().then(setUsado); }, []);

  const capacidad = CAPACIDAD_GB * 1024 * 1024 * 1024;
  if (usado === null || usado / capacidad < UMBRAL) return null;
  const pct = Math.min(100, Math.round((usado / capacidad) * 100));
  const lleno = pct >= 95;

  return (
    <div className={`mb-4 p-4 rounded-2xl border flex items-start gap-3 ${lleno ? 'bg-red/10 border-red/30' : 'bg-amber/10 border-amber/30'}`}>
      <HardDrive size={20} strokeWidth={2.3} className={`shrink-0 mt-0.5 ${lleno ? 'text-red' : 'text-amber'}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-[14px] font-semibold ${lleno ? 'text-red' : 'text-amber'}`}>
          El almacenamiento va al {pct} %
        </p>
        <p className="text-[13px] text-ink/80 leading-relaxed mt-0.5">
          Se han usado {pesoTexto(usado)} de {CAPACIDAD_GB} GB entre fotos, videos y documentos.
          {lleno ? ' Al llenarse dejarán de subirse las evidencias.' : ' Conviene pasar a un plan con más espacio antes de que se llene.'}
        </p>
        <div className="h-2 rounded-full bg-surface-2 overflow-hidden mt-2.5">
          <div className={`h-full rounded-full ${lleno ? 'bg-red' : 'bg-amber'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
