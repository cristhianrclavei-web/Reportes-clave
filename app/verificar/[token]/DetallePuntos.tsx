'use client';

import { useState } from 'react';
import { ChevronDown, Check, X, Minus } from 'lucide-react';

export type PuntoVerificado = {
  componente: string;
  actividad: string;
  criterio: string;
  ref: string | null;
  frecuencia: string;
  resultado: 'cumple' | 'no_cumple' | 'na' | null;
  valor: string | null;
  nota: string | null;
};

const FRECUENCIA: Record<string, string> = { trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' };

const RESULTADO = {
  cumple: { label: 'Cumple', cls: 'bg-teal/15 text-teal', Icono: Check },
  no_cumple: { label: 'No cumple', cls: 'bg-amber/15 text-amber', Icono: X },
  na: { label: 'N/A', cls: 'bg-ink/8 text-muted', Icono: Minus },
} as const;

// «Ver detalles» de un formato en la página pública: cada punto revisado
// con su criterio, medición y resultado.
export default function DetallePuntos({ puntos, areas }: { puntos: PuntoVerificado[]; areas?: string | null }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="w-full min-h-[42px] rounded-xl border border-line-strong text-[13.5px] font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
      >
        {abierto ? 'Ocultar detalles' : `Ver detalles (${puntos.length} puntos)`}
        <ChevronDown size={16} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div className="mt-3">
          {areas && (
            <p className="text-[13px] mb-2">
              <span className="text-muted">Áreas revisadas: </span>
              {areas}
            </p>
          )}
          <ol className="divide-y divide-line">
            {puntos.map((p, i) => {
              const r = p.resultado ? RESULTADO[p.resultado] : null;
              return (
                <li key={i} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-teal">
                        {i + 1}. {p.componente}
                        <span className="text-muted normal-case tracking-normal font-normal"> · {FRECUENCIA[p.frecuencia] || p.frecuencia}</span>
                      </p>
                      <p className="text-[14px] leading-snug mt-0.5">{p.actividad}</p>
                    </div>
                    {r ? (
                      <span className={`shrink-0 text-[11.5px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${r.cls}`}>
                        <r.Icono size={12} strokeWidth={3} /> {r.label}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[11.5px] text-muted">Sin marcar</span>
                    )}
                  </div>
                  <p className="text-[12.5px] text-muted mt-1 leading-snug">
                    Criterio: {p.criterio}
                    {p.ref ? ` (${p.ref})` : ''}
                  </p>
                  {p.valor && (
                    <p className="text-[12.5px] mt-1">
                      <span className="text-muted">Medición: </span>
                      <b>{p.valor}</b>
                    </p>
                  )}
                  {p.nota && <p className="text-[12.5px] mt-1 text-amber font-semibold">Hallazgo: {p.nota}</p>}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
