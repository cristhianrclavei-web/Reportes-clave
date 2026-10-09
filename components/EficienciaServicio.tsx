'use client';

import { Servicio } from '@/lib/serviciosProgramados';
import { evaluarServicio, textoMotivo, TEXTO_RESULTADO, Hecho, Lectura } from '@/lib/eficiencia';
import { formatMinutos } from '@/lib/kpis';

// Cómo cerró el día según lo que respondió el técnico: resultado, desviaciones
// de horario y el motivo de cada una. Solo para supervisión.

const LECTURA: Record<Exclude<Lectura, 'sin_clasificar'>, { texto: string; clase: string }> = {
  positiva: { texto: 'A favor', clase: 'bg-teal/15 text-teal' },
  neutra: { texto: 'Causa externa', clase: 'bg-amber/15 text-amber' },
  negativa: { texto: 'En contra', clase: 'bg-red/15 text-red' },
};

function describir(h: Hecho): string {
  if (h.tipo === 'llegada_tarde') return `Llegó ${formatMinutos(h.minutos)} tarde`;
  if (h.tipo === 'salida_tarde') return `Cerró ${formatMinutos(h.minutos)} después de lo programado`;
  if (h.tipo === 'termino_antes') return `Terminó ${formatMinutos(h.minutos)} antes`;
  return 'No quedó terminado';
}

export default function EficienciaServicio({ servicio }: { servicio: Servicio }) {
  if (servicio.estado !== 'concluido' || !servicio.resultado) return null;
  const e = evaluarServicio(servicio);
  if (e.lectura === 'sin_clasificar') return null;
  const lectura = LECTURA[e.lectura];
  const comentario: Record<Hecho['tipo'], string | null | undefined> = {
    llegada_tarde: servicio.llegada_comentario,
    salida_tarde: servicio.salida_comentario,
    no_terminado: servicio.resultado_comentario,
    termino_antes: null,
  };

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface-2/50 p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-[13.5px] font-semibold">{TEXTO_RESULTADO[servicio.resultado]}</p>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${lectura.clase}`}>{lectura.texto}</span>
      </div>
      {e.hechos.length === 0 ? (
        <p className="text-[12.5px] text-muted mt-1">Dentro del horario programado.</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {e.hechos.map((h) => (
            <li key={h.tipo} className="text-[12.5px] leading-snug">
              <span className="text-ink/90">{describir(h)}</span>
              {h.origen !== null && (
                <span className="text-muted">
                  {' · '}{textoMotivo(h.motivo)} ({h.origen === 'externo' ? 'externo' : 'propio'})
                </span>
              )}
              {comentario[h.tipo] && <span className="block text-muted italic">«{comentario[h.tipo]}»</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
