'use client';

import Link from 'next/link';
import { AlertTriangle, BellRing, ChevronRight, Radar, Volume2 } from 'lucide-react';
import { TipoCircuito, etiquetaSalida, ordenarCircuitos } from '@/lib/lazos';
import { LazoResumen } from '@/lib/lazosDatos';

// Los circuitos de un panel, uno debajo de otro como bloques: primero los
// lazos SLC, luego las NAC y al final el voceo. `FrentePanel` es la vista de
// la pantalla del panel; `SalidasCompactas`, la tira de la tarjeta de la lista.

export const COLOR_TIPO: Record<TipoCircuito, string> = {
  deteccion: 'rgb(var(--c-acento))',
  estrobos: '#C792EA',
  voceo: '#6EA8FE',
};

export const ICONO_TIPO: Record<TipoCircuito, typeof Radar> = {
  deteccion: Radar,
  estrobos: BellRing,
  voceo: Volume2,
};

export const DESCRIPCION_TIPO: Record<TipoCircuito, string> = {
  deteccion: 'Lazo de detección',
  estrobos: 'Sirenas y estrobos',
  voceo: 'Bocinas de voceo',
};

export function fondo(color: string, porcentaje: number): string {
  return `color-mix(in srgb, ${color} ${porcentaje}%, transparent)`;
}

export function SalidasCompactas({ circuitos }: { circuitos: LazoResumen[] }) {
  if (circuitos.length === 0) return <p className="text-[12.5px] text-faint">Sin circuitos todavía.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {ordenarCircuitos(circuitos).map((l) => {
        const color = COLOR_TIPO[l.tipo];
        return (
          <span key={l.id} className="rounded-lg px-2 py-1 font-mono text-[11px] font-semibold inline-flex items-center gap-1"
            style={{ color, backgroundColor: fondo(color, 14) }}>
            {l.fallaAbierta && <span className="w-1.5 h-1.5 rounded-full bg-amber" aria-label="falla abierta" />}
            {etiquetaSalida(l)}
            <span className="font-normal opacity-75">· {l.dispositivos}</span>
          </span>
        );
      })}
    </div>
  );
}

export default function FrentePanel({ circuitos }: { circuitos: LazoResumen[] }) {
  if (circuitos.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line-strong p-5 text-center text-[14px] text-muted">
        Este panel todavía no tiene circuitos. Toca «Agregar circuito» y elige SLC, NAC o voceo.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-2.5">
      {ordenarCircuitos(circuitos).map((l) => {
        const color = COLOR_TIPO[l.tipo];
        const Icono = ICONO_TIPO[l.tipo];
        return (
          <li key={l.id}>
            <Link href={`/lazos/${l.id}`}
              className="flex items-stretch rounded-2xl border bg-surface overflow-hidden transition-transform active:scale-[0.99]"
              style={{ borderColor: l.fallaAbierta ? '#E8B04B' : fondo(color, 40) }}>
              {/* Franja del color del tipo, como la etiqueta de la tarjeta en el panel. */}
              <span className="w-1.5 shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
              <span className="flex-1 min-w-0 flex items-center gap-3 p-3">
                <span className="w-12 h-12 shrink-0 rounded-xl flex flex-col items-center justify-center" style={{ color, backgroundColor: fondo(color, 14) }}>
                  <Icono size={18} strokeWidth={2.2} aria-hidden="true" />
                  <span className="font-mono text-[10.5px] font-bold leading-none mt-1">{etiquetaSalida(l)}</span>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold truncate">
                    <span className="font-mono" style={{ color }}>{l.codigo}</span> {l.nombre}
                  </span>
                  <span className="block text-[12.5px] text-muted truncate">
                    {DESCRIPCION_TIPO[l.tipo]} · {l.dispositivos} {l.dispositivos === 1 ? 'dispositivo' : 'dispositivos'}{l.clase ? ` · Clase ${l.clase}` : ''}
                  </span>
                  {l.fallaAbierta && (
                    <span className="flex items-center gap-1 text-[12px] font-semibold text-amber mt-0.5">
                      <AlertTriangle size={13} strokeWidth={2.6} /> Falla a tierra abierta
                    </span>
                  )}
                </span>
                <ChevronRight size={18} className="text-muted shrink-0" />
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
