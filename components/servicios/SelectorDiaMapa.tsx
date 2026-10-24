'use client';

import { useRef } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { fechaLocal, sumarDias } from '@/lib/fechaHoy';

// Selector de día compacto para ir sobre el mapa (tarjeta del Resumen):
// ‹ [ Hoy ] ›. Tocar el centro abre el calendario del teléfono.
export default function SelectorDiaMapa({
  fecha, hoy, fechaMinima, irADia,
}: {
  fecha: string;
  hoy: string;
  fechaMinima: string;
  irADia: (dia: string) => void;
}) {
  const calendarioRef = useRef<HTMLInputElement>(null);
  const esHoy = fecha === hoy;
  let texto = fechaLocal(fecha).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
  if (esHoy) texto = 'Hoy';
  if (fecha === sumarDias(hoy, -1)) texto = 'Ayer';

  function abrirCalendario() {
    const input = calendarioRef.current;
    if (!input) return;
    // showPicker abre el calendario nativo; donde no existe, se enfoca el campo.
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  }

  const flecha = 'w-8 h-8 rounded-full flex items-center justify-center text-ink/70 hover:text-teal hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent active:scale-90 transition';

  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-line bg-surface-2/70 p-0.5">
      <button type="button" onClick={() => irADia(sumarDias(fecha, -1))} disabled={fecha <= fechaMinima} aria-label="Día anterior" className={flecha}>
        <ChevronLeft size={16} strokeWidth={2.4} />
      </button>
      <button
        type="button"
        onClick={abrirCalendario}
        aria-label="Elegir día"
        className={`relative h-8 px-3 rounded-full flex items-center gap-1.5 text-[12.5px] font-semibold capitalize transition ${
          esHoy ? 'text-ink/85 hover:bg-surface' : 'bg-teal text-inkOnAccent'
        }`}
      >
        <CalendarDays size={14} strokeWidth={2.3} />
        {texto}
        <input
          ref={calendarioRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={fecha}
          min={fechaMinima}
          max={hoy}
          onChange={(e) => { if (e.target.value) irADia(e.target.value); }}
          className="absolute inset-0 opacity-0 pointer-events-none"
        />
      </button>
      <button type="button" onClick={() => irADia(sumarDias(fecha, 1))} disabled={esHoy} aria-label="Día siguiente" className={flecha}>
        <ChevronRight size={16} strokeWidth={2.4} />
      </button>
    </div>
  );
}
