'use client';

import { CheckCircle2, ListX, TimerOff } from 'lucide-react';
import { MarcaResultado, ResultadoServicio } from '@/lib/resultadoServicio';

// Iconografía de cierre. Tres marcas distintas y acumulables: un servicio
// que quedó incompleto Y además se retrasó muestra los dos íconos juntos.
const CFG: Record<MarcaResultado, { Icono: any; color: string; bg: string; label: string }> = {
  completo: { Icono: CheckCircle2, color: 'text-teal', bg: 'bg-teal/15', label: 'En tiempo y forma' },
  incompleto: { Icono: ListX, color: 'text-amber', bg: 'bg-amber/15', label: 'Tareas sin terminar' },
  retrasado: { Icono: TimerOff, color: 'text-red', bg: 'bg-red/15', label: 'Fuera de tiempo' },
};

// Solo los íconos, para espacios apretados (filas de lista).
export function ResultadoIconos({ resultado, size = 16 }: { resultado: ResultadoServicio; size?: number }) {
  if (resultado.marcas.length === 0) return null;
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      {resultado.marcas.map((m) => {
        const { Icono, color, label } = CFG[m];
        return <Icono key={m} size={size} strokeWidth={2.5} className={color} aria-label={label} />;
      })}
    </span>
  );
}

// Íconos + texto, para tarjetas y encabezados con espacio.
export function ResultadoBadges({ resultado }: { resultado: ResultadoServicio }) {
  if (resultado.marcas.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {resultado.marcas.map((m) => {
        const { Icono, color, bg, label } = CFG[m];
        const texto =
          m === 'retrasado' && resultado.retrasoMin
            ? `${resultado.retrasoMin} min de más`
            : m === 'incompleto' && resultado.pendientes
            ? `${resultado.pendientes} ${resultado.pendientes === 1 ? 'tarea sin terminar' : 'tareas sin terminar'}`
            : label;
        return (
          <span key={m} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12.5px] font-semibold ${bg} ${color}`}>
            <Icono size={14} strokeWidth={2.6} />
            {texto}
          </span>
        );
      })}
    </div>
  );
}
