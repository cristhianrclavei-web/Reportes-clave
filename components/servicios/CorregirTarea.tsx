'use client';

import { useState } from 'react';
import { Servicio, Tarea, corregirTareaDelDia, ResultadoCorreccionTarea } from '@/lib/serviciosProgramados';
import { fechaDMA } from '@/lib/etiquetaMantenimiento';

const RAPIDOS = [0, 25, 50, 75, 100];

// Editor en línea con el que el supervisor corrige una tarea en un día del
// proyecto: su nombre y el avance con que quedó ese día (por ejemplo, la
// terminaron pero se les pasó marcarla).
export default function CorregirTarea({
  dia, tarea, avanceInicial, onCancelar, onGuardado,
}: {
  dia: Servicio;
  tarea: Tarea;
  avanceInicial: number;
  onCancelar: () => void;
  onGuardado: (resultado: ResultadoCorreccionTarea) => void;
}) {
  const [descripcion, setDescripcion] = useState(tarea.descripcion);
  const [avance, setAvance] = useState(String(avanceInicial));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const avanceNumero = Number(avance);
  let errorAvance: string | null = null;
  if (avance.trim() === '' || !Number.isInteger(avanceNumero) || avanceNumero < 0 || avanceNumero > 100) {
    errorAvance = 'Escribe un número entero de 0 a 100.';
  }
  const errorNombre = descripcion.trim() ? null : 'Escribe el nombre de la tarea.';

  async function guardar() {
    if (errorAvance || errorNombre) return;
    setGuardando(true);
    setError(null);
    try {
      const resultado = await corregirTareaDelDia(dia, tarea, { descripcion, avancePct: avanceNumero });
      onGuardado(resultado);
    } catch (e: any) {
      setError('No se pudo guardar la corrección: ' + (e?.message || 'revisa tu conexión e intenta de nuevo.'));
      setGuardando(false);
    }
  }

  return (
    <div className="mt-2.5 p-3 rounded-xl bg-surface border border-teal/40 flex flex-col gap-3">
      <div>
        <label htmlFor={`nombre-${tarea.id}`} className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1">Nombre de la tarea</label>
        <input
          id={`nombre-${tarea.id}`}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14px]"
        />
        {errorNombre && <p className="text-[12px] text-red mt-1">{errorNombre}</p>}
      </div>

      <div>
        <label htmlFor={`avance-${tarea.id}`} className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1">
          Avance al cierre del {fechaDMA(dia.fecha)}
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {RAPIDOS.map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => setAvance(String(pct))}
              className={`min-h-[36px] px-2.5 rounded-lg border text-[12.5px] font-semibold tabular-nums active:scale-95 transition-transform ${
                avance === String(pct) ? 'bg-teal text-inkOnAccent border-teal' : 'border-line-strong text-ink/80'
              }`}
            >
              {pct === 100 ? 'Terminada' : `${pct}%`}
            </button>
          ))}
          <input
            id={`avance-${tarea.id}`}
            type="number" inputMode="numeric" min={0} max={100} step={1}
            value={avance}
            onChange={(e) => setAvance(e.target.value)}
            aria-label="Avance en porcentaje"
            className="w-[72px] min-h-[36px] px-2 rounded-lg bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14px] text-center tabular-nums"
          />
          <span className="text-[13px] text-muted">%</span>
        </div>
        {errorAvance && <p className="text-[12px] text-red mt-1">{errorAvance}</p>}
      </div>

      <p className="text-[12px] text-muted leading-relaxed">
        Lo que registró el técnico no se borra; tu corrección queda como el último registro de este día. Las actividades de los reportes del proyecto que nadie ha firmado se actualizan solas; los reportes ya firmados no cambian.
      </p>

      {error && <p className="text-[12.5px] text-red">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button" onClick={onCancelar} disabled={guardando}
          className="flex-1 min-h-[42px] rounded-lg border border-line-strong text-ink/80 text-[13.5px] font-medium active:scale-95 transition-transform"
        >
          Cancelar
        </button>
        <button
          type="button" onClick={guardar} disabled={guardando || Boolean(errorAvance || errorNombre)}
          className="flex-1 min-h-[42px] rounded-lg bg-teal text-inkOnAccent text-[13.5px] font-semibold active:scale-95 transition-transform disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar corrección'}
        </button>
      </div>
    </div>
  );
}
