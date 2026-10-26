'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, CalendarPlus } from 'lucide-react';
import { diasDelProyecto } from '@/lib/serviciosProgramados';
import { plazoDelProyecto, enRiesgo, PlazoProyecto as Plazo } from '@/lib/plazosProyecto';
import { textoMotivo } from '@/lib/motivosServicio';

// Plazo del proyecto en el detalle del servicio (supervisión): días cotizados
// contra programados, por qué se agregaron días, y el aviso para adelantarse
// cuando va atrasado o el último día cerró sin terminar.
export default function PlazoProyecto({ grupoId, avancePct, version, onAmpliar }: {
  grupoId: string;
  // Avance de las tareas del proyecto; null si no tiene tareas.
  avancePct: number | null;
  // Cambia cuando se agregan días, para volver a leer.
  version: number;
  onAmpliar: (motivoSugerido: string | null) => void;
}) {
  const [plazo, setPlazo] = useState<Plazo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    diasDelProyecto(grupoId)
      .then((dias) => { setPlazo(plazoDelProyecto(dias)); setError(null); })
      .catch((e) => setError(e?.message || 'No se pudo leer el plazo del proyecto'));
  }, [grupoId, version]);

  if (error) return <p className="text-[12.5px] text-red mt-3">{error}</p>;
  if (!plazo) return null;
  if (plazo.planeados === null) {
    return <p className="text-[12.5px] text-muted mt-3">Plazo sin medir: se programó antes de que la app guardara los días cotizados.</p>;
  }

  const riesgo = enRiesgo(plazo, avancePct);
  return (
    <div className="mt-3">
      <p className="text-[13px] text-ink/85 flex items-center gap-1.5 flex-wrap">
        <CalendarClock size={15} strokeWidth={2.3} className="text-muted shrink-0" />
        Cotizado: <b>{plazo.planeados} día{plazo.planeados === 1 ? '' : 's'}</b>
        <span className="text-muted">·</span>
        Programados: <b>{plazo.programados}</b>
        {plazo.extra > 0 && <span className={plazo.extraPropios > 0 ? 'text-red font-semibold' : 'text-amber font-semibold'}>(+{plazo.extra})</span>}
      </p>
      {plazo.motivosExtra.length > 0 && (
        <p className="text-[12.5px] text-muted mt-1 ml-[21px]">
          {plazo.motivosExtra.map((m) => `${m.dias} por ${m.clave === 'sin_motivo' ? 'sin motivo' : textoMotivo(m.clave).toLowerCase()}${m.origen === 'propio' ? ' (del equipo)' : ''}`).join(' · ')}
        </p>
      )}

      {plazo.faltaAmpliar ? (
        <Alerta
          titulo="El último día cerró sin terminar"
          texto={`Ya no quedan días programados${plazo.faltaAmpliar.motivo ? `. El técnico indicó: ${textoMotivo(plazo.faltaAmpliar.motivo).toLowerCase()}` : ''}. Amplíalo para terminarlo; mientras tanto el proyecto no cuenta como terminado.`}
          onAmpliar={() => onAmpliar(plazo.faltaAmpliar?.motivo || null)}
        />
      ) : riesgo ? (
        <Alerta
          titulo="Va atrasado para los días cotizados"
          texto={`Lleva ${avancePct}% de las tareas con ${plazo.concluidos} de ${plazo.planeados} días trabajados. Si no va a alcanzar, amplíalo desde ahora para que el personal y el cliente lo sepan a tiempo.`}
          onAmpliar={() => onAmpliar(null)}
        />
      ) : null}
    </div>
  );
}

function Alerta({ titulo, texto, onAmpliar }: { titulo: string; texto: string; onAmpliar: () => void }) {
  return (
    <div className="mt-2.5 p-3.5 rounded-xl bg-amber/10 border border-amber/35">
      <p className="text-[13.5px] font-semibold text-amber flex items-center gap-1.5">
        <AlertTriangle size={15} strokeWidth={2.4} /> {titulo}
      </p>
      <p className="text-[12.5px] text-ink/80 mt-1 leading-relaxed">{texto}</p>
      <button onClick={onAmpliar} className="mt-1.5 text-[13.5px] font-semibold text-teal min-h-[40px] flex items-center gap-1.5">
        <CalendarPlus size={15} strokeWidth={2.4} /> Ampliar a más días →
      </button>
    </div>
  );
}
