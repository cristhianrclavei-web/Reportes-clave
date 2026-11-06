'use client';

import Link from 'next/link';
import { AlertTriangle, Plus } from 'lucide-react';
import { Panel, SALIDA_CIRCUITO, TipoCircuito, salidasDelPanel } from '@/lib/lazos';
import { LazoResumen } from '@/lib/lazosDatos';

// El frente del panel: cada salida (SLC, NAC, voceo) con el circuito que
// tiene capturado o vacía. `FrentePanel` es la vista grande de la pantalla
// del panel; `SalidasCompactas`, la tira que va en la tarjeta de la lista.

export const COLOR_TIPO: Record<TipoCircuito, string> = {
  deteccion: 'rgb(var(--c-acento))',
  estrobos: '#C792EA',
  voceo: '#6EA8FE',
};

const TITULO_TIPO: Record<TipoCircuito, string> = {
  deteccion: 'Lazos de detección · SLC',
  estrobos: 'Sirenas y estrobos · NAC',
  voceo: 'Voceo',
};

export function fondo(color: string, porcentaje: number): string {
  return `color-mix(in srgb, ${color} ${porcentaje}%, transparent)`;
}

export function SalidasCompactas({ panel, circuitos }: { panel: Panel; circuitos: LazoResumen[] }) {
  const grupos = salidasDelPanel(panel, circuitos);
  return (
    <div className="flex flex-wrap gap-1.5">
      {grupos.flatMap((g) => g.salidas.map((s, i) => {
        const color = COLOR_TIPO[g.tipo];
        const etiqueta = `${SALIDA_CIRCUITO[g.tipo]} ${s.numero ?? '?'}`;
        if (!s.lazo) {
          return (
            <span key={`${g.tipo}-${i}`} className="rounded-lg border border-dashed border-line-strong px-2 py-1 font-mono text-[11px] text-faint">
              {etiqueta}
            </span>
          );
        }
        return (
          <span key={s.lazo.id} className="rounded-lg px-2 py-1 font-mono text-[11px] font-semibold inline-flex items-center gap-1"
            style={{ color, backgroundColor: fondo(color, 14) }}>
            {s.lazo.fallaAbierta && <span className="w-1.5 h-1.5 rounded-full bg-amber" aria-label="falla abierta" />}
            {etiqueta}
            <span className="font-normal opacity-75">· {s.lazo.dispositivos}</span>
          </span>
        );
      }))}
    </div>
  );
}

export default function FrentePanel({ panel, circuitos, onCapturar }: {
  panel: Panel;
  circuitos: LazoResumen[];
  onCapturar: (tipo: TipoCircuito, numero: number | null) => void;
}) {
  const grupos = salidasDelPanel(panel, circuitos);

  if (grupos.length === 0) {
    return <p className="text-[14px] text-muted py-4">Este panel no tiene salidas. Toca ⚙ y pon cuántas SLC, NAC o voceo tiene.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {grupos.map((g) => {
        const color = COLOR_TIPO[g.tipo];
        const capturadas = g.salidas.filter((s) => s.lazo).length;
        return (
          <section key={g.tipo} aria-label={TITULO_TIPO[g.tipo]}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted flex-1">{TITULO_TIPO[g.tipo]}</h2>
              <span className="text-[12px] text-faint">{capturadas} de {g.salidas.length} capturados</span>
            </div>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {g.salidas.map((s, i) => {
                const etiqueta = `${SALIDA_CIRCUITO[g.tipo]} ${s.numero ?? '?'}`;
                if (!s.lazo) {
                  return (
                    <li key={`vacia-${i}`}>
                      <button type="button" onClick={() => onCapturar(g.tipo, s.numero)}
                        className="w-full h-full min-h-[104px] rounded-2xl border-[1.5px] border-dashed border-line-strong p-3 text-left flex flex-col hover:border-teal/60 transition-colors">
                        <span className="font-mono text-[12.5px] font-bold text-faint">{etiqueta}</span>
                        <span className="text-[12.5px] text-faint mt-1">Sin capturar</span>
                        <span className="mt-auto pt-2 text-[13px] font-semibold flex items-center gap-1" style={{ color }}>
                          <Plus size={15} strokeWidth={2.6} /> Capturar
                        </span>
                      </button>
                    </li>
                  );
                }
                const l = s.lazo;
                return (
                  <li key={l.id}>
                    <Link href={`/lazos/${l.id}`}
                      className="block h-full min-h-[104px] rounded-2xl border p-3 transition-transform active:scale-[0.98]"
                      style={{ borderColor: fondo(color, l.fallaAbierta ? 0 : 45), backgroundColor: fondo(color, 8), ...(l.fallaAbierta ? { borderColor: '#E8B04B' } : {}) }}>
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono text-[12.5px] font-bold rounded-md px-1.5 py-0.5" style={{ color, backgroundColor: fondo(color, 16) }}>{etiqueta}</span>
                        {/* Luz de estado, como el LED del panel. */}
                        <span className={`ml-auto w-2.5 h-2.5 rounded-full ${l.fallaAbierta ? 'bg-amber' : ''}`}
                          style={l.fallaAbierta ? { boxShadow: '0 0 8px #E8B04B' } : { backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
                          aria-label={l.fallaAbierta ? 'Falla a tierra abierta' : 'Sin falla abierta'} />
                      </span>
                      <span className="block mt-2 text-[14px] font-semibold leading-snug line-clamp-2">
                        <span className="font-mono" style={{ color }}>{l.codigo}</span> {l.nombre}
                      </span>
                      <span className="block text-[12px] text-muted mt-1">
                        {l.dispositivos} {l.dispositivos === 1 ? 'dispositivo' : 'dispositivos'}{l.clase ? ` · Clase ${l.clase}` : ''}
                      </span>
                      {l.fallaAbierta && (
                        <span className="flex items-center gap-1 text-[12px] font-semibold text-amber mt-1">
                          <AlertTriangle size={13} strokeWidth={2.6} /> Falla a tierra
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
