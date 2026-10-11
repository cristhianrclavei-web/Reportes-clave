'use client';

import { useState } from 'react';
import { Pencil, RotateCcw, Check } from 'lucide-react';
import { AjusteDia, DiaProyecto } from '@/lib/diasProyecto';

const CAMPO = 'w-full px-3 min-h-[46px] rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[14.5px]';

// «dom 11 oct», a partir de 'AAAA-MM-DD' (sin pasar por UTC, que recorre el día).
function fechaLegible(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  if (!y || !m || !d) return 'Sin fecha';
  const texto = new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function horarioLegible(dia: DiaProyecto): string {
  if (dia.llegada && dia.salida) return `${dia.llegada} a ${dia.salida}`;
  if (dia.llegada) return `Llegada ${dia.llegada}`;
  return 'Sin hora';
}

// Lista de los días de un proyecto al programarlo. Cada día se ve en un
// renglón; el lápiz despliega su fecha, llegada y salida para cambiarlas
// solo en ese día. Lo que no se toca sigue al horario general.
export default function DiasDelProyectoEditor({
  dias, onAjustar, onRestablecer,
}: {
  dias: DiaProyecto[];
  onAjustar: (indice: number, cambio: AjusteDia) => void;
  onRestablecer: (indice: number) => void;
}) {
  // Día con sus campos desplegados (uno a la vez, para no llenar la pantalla).
  const [abierto, setAbierto] = useState<number | null>(null);

  return (
    <div className="mt-3.5">
      <p className="text-[13px] text-ink/75 mb-1">Día por día</p>
      <p className="text-[12.5px] text-muted mb-2.5">Todos siguen la fecha y el horario de arriba. Toca el lápiz para cambiar un día en particular.</p>
      <div className="flex flex-col gap-2">
        {dias.map((dia, i) => (
          <div key={i} className={`rounded-xl border ${abierto === i ? 'border-teal/45 bg-surface-2' : 'border-line bg-surface-2/60'}`}>
            <div className="flex items-center gap-2.5 px-3 py-2.5">
              <span className="shrink-0 w-8 h-8 rounded-full bg-surface border border-line flex items-center justify-center font-display font-bold text-[13px] tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold truncate">{fechaLegible(dia.fecha)}</span>
                <span className="block text-[12.5px] text-muted tabular-nums">
                  {horarioLegible(dia)}
                  {dia.personalizado && <span className="text-teal font-semibold"> · Ajustado</span>}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setAbierto(abierto === i ? null : i)}
                aria-expanded={abierto === i}
                aria-label={abierto === i ? `Cerrar el día ${i + 1}` : `Cambiar fecha y horario del día ${i + 1}`}
                className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-teal active:scale-90 transition-transform"
              >
                {abierto === i ? <Check size={18} strokeWidth={2.6} /> : <Pencil size={16} strokeWidth={2.4} />}
              </button>
            </div>

            {abierto === i && (
              <div className="px-3 pb-3">
                <label className="text-[12.5px] text-ink/75 block mb-1">Fecha</label>
                <input type="date" value={dia.fecha} onChange={(e) => onAjustar(i, { fecha: e.target.value })} className={`${CAMPO} mb-2.5`} />
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[12.5px] text-ink/75 block mb-1">Llegada</label>
                    <input type="time" value={dia.llegada} onChange={(e) => onAjustar(i, { llegada: e.target.value })} className={CAMPO} />
                  </div>
                  <div>
                    <label className="text-[12.5px] text-ink/75 block mb-1">Salida</label>
                    <input type="time" value={dia.salida} onChange={(e) => onAjustar(i, { salida: e.target.value })} className={CAMPO} />
                  </div>
                </div>
                {dia.personalizado && (
                  <button type="button" onClick={() => onRestablecer(i)} className="mt-2.5 min-h-[40px] text-[13px] font-semibold text-muted flex items-center gap-1.5">
                    <RotateCcw size={14} strokeWidth={2.4} /> Volver al horario general
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
