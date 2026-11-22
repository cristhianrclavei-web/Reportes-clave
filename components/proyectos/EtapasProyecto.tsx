'use client';

import { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { confirmar } from '@/lib/dialogos';
import { showToast } from '@/components/Toast';
import { cambiarEtapaProyecto, type Proyecto } from '@/lib/proyectos';
import { ayudaEtapa, etapasDe, nombreEtapa, siguienteEtapa, tonoEtapa, type Etapa } from '@/lib/proyectosEtapas';

// Chip con la etapa del proyecto.
export function ChipEtapa({ etapa, sistemas }: { etapa: Etapa; sistemas: readonly string[] }) {
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${tonoEtapa(etapa).chip}`}>
      {nombreEtapa(etapa, sistemas)}
    </span>
  );
}

// El embudo del proyecto: dónde va, qué significa y el botón para pasar a
// la siguiente etapa. Tocar otra etapa la elige (con confirmación).
export default function EtapasProyecto({ proyecto, onCambio }: {
  proyecto: Proyecto;
  onCambio: (etapa: Etapa) => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const lista = etapasDe(proyecto.sistemas);
  const actual = proyecto.etapa;
  const indice = lista.indexOf(actual);
  const siguiente = siguienteEtapa(actual, proyecto.sistemas);

  async function cambiar(etapa: Etapa, preguntar: boolean) {
    if (etapa === actual) return;
    if (preguntar && !(await confirmar(`¿Cambiar «${proyecto.nombre}» a ${nombreEtapa(etapa, proyecto.sistemas)}?`, { detalle: ayudaEtapa(etapa, proyecto.sistemas), textoAceptar: 'Cambiar' }))) return;
    setGuardando(true);
    try {
      await cambiarEtapaProyecto(proyecto, etapa);
      onCambio(etapa);
      showToast(`${proyecto.nombre}: ${nombreEtapa(etapa, proyecto.sistemas)}`, 'success');
    } catch (e: any) {
      showToast(e?.message || 'No se pudo cambiar la etapa.', 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="glass rounded-2xl p-4 mb-4" data-tour="etapas-proyecto">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Etapa</p>
        {actual === 'cancelado'
          ? <button type="button" disabled={guardando} onClick={() => cambiar('prospecto', true)} className="text-[13px] font-semibold text-teal">Reactivar</button>
          : <button type="button" disabled={guardando} onClick={() => cambiar('cancelado', true)} className="text-[13px] text-muted hover:text-red">Marcar cancelado</button>}
      </div>
      <ol className="flex flex-wrap items-center gap-1.5">
        {lista.map((e, i) => {
          const hecha = indice >= 0 && i < indice;
          const esActual = e === actual;
          return (
            <li key={e} className="flex items-center gap-1.5">
              <button type="button" disabled={guardando} onClick={() => cambiar(e, true)} aria-current={esActual ? 'step' : undefined}
                className={`min-h-[36px] px-3 rounded-full text-[13px] font-semibold border flex items-center gap-1.5 transition-colors ${esActual ? 'bg-teal text-inkOnAccent border-teal' : hecha ? 'bg-teal/12 text-teal border-teal/30' : 'bg-surface-2 text-muted border-line hover:border-teal/50'}`}>
                {hecha && <Check size={13} strokeWidth={3} />}
                {nombreEtapa(e, proyecto.sistemas)}
              </button>
              {i < lista.length - 1 && <ChevronRight size={14} className="text-faint" />}
            </li>
          );
        })}
      </ol>
      <p className="text-[13px] text-muted mt-2.5">{ayudaEtapa(actual, proyecto.sistemas)}</p>
      {siguiente && actual !== 'cancelado' && (
        <button type="button" disabled={guardando} onClick={() => cambiar(siguiente, true)}
          className="mt-3 min-h-[44px] px-4 rounded-xl bg-teal text-inkOnAccent font-semibold text-[14px] disabled:opacity-60">
          Pasar a {nombreEtapa(siguiente, proyecto.sistemas)}
        </button>
      )}
    </section>
  );
}
