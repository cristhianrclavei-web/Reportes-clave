'use client';

import { ExternalLink, Package } from 'lucide-react';
import { cantidadTexto } from '@/lib/materialesReporte';

// Equipo instalado de un reporte, como lo ve supervisión: el modelo primero
// (es la referencia), con la foto y la ficha de SYSCOM cuando las tiene.
export default function TablaEquiposInstalados({ equipos }: { equipos: any[] }) {
  return (
    <div className="flex flex-col gap-2">
      {equipos.map((e, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/50 p-2.5">
          {e.imagen ? (
            // Foto del catálogo de SYSCOM (dominio externo, thumbnail chico).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={e.imagen} alt="" className="w-14 h-14 rounded-lg bg-white border border-line object-contain shrink-0" />
          ) : (
            <span className="w-14 h-14 rounded-lg bg-surface border border-line flex items-center justify-center shrink-0">
              <Package size={20} strokeWidth={1.8} className="text-faint" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight">
              <span className="tabular-nums text-teal">{e.unidad && e.unidad !== 'pza' ? cantidadTexto(e.cant, e.unidad) : `${e.cant || 1}×`}</span>{' '}
              {e.modelo || <span className="text-muted font-normal">{e.sinModelo ? 'Sin modelo visible' : 'Sin modelo'}</span>}
              {e.marca && <span className="text-muted font-normal"> · {e.marca}</span>}
            </p>
            {e.desc && <p className="text-[12.5px] text-ink/80 leading-snug line-clamp-2 mt-0.5">{e.desc}</p>}
            <div className="flex flex-wrap items-center gap-x-3 mt-0.5">
              {e.serie && <span className="text-[12px] text-muted">Serie: <span className="font-mono text-ink/80">{e.serie}</span></span>}
              {e.enlace && (
                <a href={e.enlace} target="_blank" rel="noopener noreferrer" className="text-[12px] text-teal font-medium flex items-center gap-1">
                  <ExternalLink size={11} strokeWidth={2.4} /> Ficha SYSCOM
                </a>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
