'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Selector de semana con tira de días.
//
// Se eligió una fila de siete días en lugar de un calendario mensual: en el
// celular una cuadrícula ocupa seis filas de una pantalla donde ya compiten
// los avisos y el buscador, y en campo casi todas las consultas son "hoy",
// "ayer" o "esta semana". Además el conteo bajo cada día deja ver la carga de
// trabajo sin abrir nada.

const DIAS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

function aISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function desdeISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Lunes de la semana a la que pertenece la fecha.
function inicioDeSemana(d: Date): Date {
  const copia = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dia = copia.getDay();
  const resta = dia === 0 ? 6 : dia - 1; // la semana arranca en lunes
  copia.setDate(copia.getDate() - resta);
  return copia;
}

export type RangoSeleccionado = { desde: string; hasta: string; esDia: boolean };

export default function SelectorSemana({
  fechas,
  onCambio,
  etiqueta = 'reportes',
}: {
  // Fechas (YYYY-MM-DD) de los elementos existentes, para contar por día.
  fechas: string[];
  onCambio: (rango: RangoSeleccionado) => void;
  etiqueta?: string;
}) {
  const [lunes, setLunes] = useState(() => inicioDeSemana(new Date()));
  const [diaSel, setDiaSel] = useState<string | null>(null);

  const diasSemana = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i);
      return d;
    });
  }, [lunes]);

  const conteos = useMemo(() => {
    const mapa: Record<string, number> = {};
    fechas.forEach((f) => { if (f) mapa[f] = (mapa[f] || 0) + 1; });
    return mapa;
  }, [fechas]);

  const hoy = aISO(new Date());

  // Avisar del rango cada vez que cambia la semana o el día elegido.
  useEffect(() => {
    if (diaSel) {
      onCambio({ desde: diaSel, hasta: diaSel, esDia: true });
    } else {
      onCambio({ desde: aISO(diasSemana[0]), hasta: aISO(diasSemana[6]), esDia: false });
    }
    // onCambio se recrea en cada render del padre; incluirlo dispararía un bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diaSel, lunes]);

  function moverSemana(delta: number) {
    setDiaSel(null);
    setLunes((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + delta * 7));
  }

  const totalSemana = diasSemana.reduce((acc, d) => acc + (conteos[aISO(d)] || 0), 0);
  const rotulo = `${diasSemana[0].getDate()} – ${diasSemana[6].getDate()} de ${diasSemana[6].toLocaleDateString('es-MX', { month: 'long' })}`;

  return (
    <div className="mb-4 p-3.5 rounded-2xl bg-surface-2 border border-line">
      <div className="flex items-center justify-between mb-2.5">
        <button
          onClick={() => moverSemana(-1)}
          aria-label="Semana anterior"
          className="w-10 h-10 -ml-1 flex items-center justify-center rounded-lg text-ink/70 active:scale-90 transition-transform"
        >
          <ChevronLeft size={20} strokeWidth={2.4} />
        </button>
        <span className="text-[14px] font-medium">{rotulo}</span>
        <button
          onClick={() => moverSemana(1)}
          aria-label="Semana siguiente"
          className="w-10 h-10 -mr-1 flex items-center justify-center rounded-lg text-ink/70 active:scale-90 transition-transform"
        >
          <ChevronRight size={20} strokeWidth={2.4} />
        </button>
      </div>

      <div className="flex gap-1.5 mb-3">
        {diasSemana.map((d) => {
          const iso = aISO(d);
          const cuantos = conteos[iso] || 0;
          const activo = diaSel === iso;
          const esHoy = iso === hoy;
          const finDeSemana = d.getDay() === 0 || d.getDay() === 6;
          return (
            <button
              key={iso}
              onClick={() => setDiaSel(activo ? null : iso)}
              aria-pressed={activo}
              className={`flex-1 min-h-[58px] rounded-xl border transition-colors ${
                activo
                  ? 'bg-teal border-teal text-inkOnAccent'
                  : `bg-surface border-line ${finDeSemana && cuantos === 0 ? 'opacity-50' : ''}`
              }`}
            >
              <div className={`text-[11px] ${activo ? 'opacity-75' : 'text-muted'}`}>{DIAS[d.getDay()]}</div>
              <div className={`text-[16px] font-display font-bold leading-tight ${esHoy && !activo ? 'text-teal' : ''}`}>
                {d.getDate()}
              </div>
              <div className={`text-[11px] ${activo ? '' : cuantos > 0 ? 'text-ink/70' : 'text-faint'}`}>
                {cuantos > 0 ? cuantos : '·'}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setDiaSel(null)}
          className={`flex-1 min-h-[42px] rounded-xl text-[13.5px] font-semibold border transition-colors ${
            !diaSel ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface border-line-strong text-ink/80'
          }`}
        >
          Toda la semana ({totalSemana})
        </button>
        {diaSel && (
          <button
            onClick={() => { setLunes(inicioDeSemana(new Date())); setDiaSel(null); }}
            className="min-h-[42px] px-4 rounded-xl text-[13.5px] font-medium border border-line-strong text-ink/80"
          >
            Hoy
          </button>
        )}
      </div>

      {diaSel && (
        <p className="text-[12.5px] text-muted mt-2">
          Mostrando {conteos[diaSel] || 0} {etiqueta} del {desdeISO(diaSel).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      )}
    </div>
  );
}
