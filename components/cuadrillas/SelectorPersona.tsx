'use client';

import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { AvatarTecnico, EstadoAvatar } from '@/components/AvatarTecnico';
import { Cuadrilla } from '@/lib/cuadrillas';

// Elegir a una persona en el celular con un menú desplegable (nativo del
// teléfono), agrupado por cuadrilla. Reemplaza a la tira de avatares y a la
// fila de cuadrillas: con mucho personal ocupaban media pantalla antes de
// llegar a los servicios.

export type PersonaItem = {
  id: string;
  nombre: string;
  // Servicios del día o de la semana.
  cuenta?: number;
  estado?: EstadoAvatar;
  indice?: number;
  // Sin avatar ni cuadrilla (p. ej. «Sin técnico»).
  especial?: boolean;
};

export default function SelectorPersona({
  items, cuadrillas, mapa, valor, onCambiar, unidad = 'servicio', className = '',
}: {
  items: PersonaItem[];
  cuadrillas: Cuadrilla[];
  mapa: Map<string, Cuadrilla>;
  valor: string | undefined;
  onCambiar: (id: string) => void;
  unidad?: string;
  className?: string;
}) {
  // Grupos en el orden de las cuadrillas; al final quienes no tienen. Las
  // flechas recorren este mismo orden, que es el del menú.
  const normales = items.filter((p) => !p.especial);
  const grupos = cuadrillas
    .map((c) => ({ titulo: c.nombre, gente: normales.filter((p) => mapa.get(p.id)?.id === c.id) }))
    .filter((g) => g.gente.length > 0);
  const sueltos = normales.filter((p) => !mapa.has(p.id));
  const especiales = items.filter((p) => p.especial);
  const agrupado = grupos.length > 0;
  const orden = agrupado ? [...grupos.flatMap((g) => g.gente), ...sueltos, ...especiales] : items;

  const i = Math.max(0, orden.findIndex((x) => x.id === valor));
  const actual = orden[i];
  if (!actual) return null;

  const texto = (p: PersonaItem) => {
    const partes = [p.nombre];
    if (typeof p.cuenta === 'number') partes.push(p.cuenta === 0 ? 'sin servicios' : `${p.cuenta} ${unidad}${p.cuenta === 1 ? '' : 's'}`);
    if (p.estado === 'alerta') partes.push('⚠');
    return partes.join(' · ');
  };

  const cuadrillaActual = !actual.especial ? mapa.get(actual.id) : undefined;

  const flecha = 'w-11 h-[52px] rounded-2xl bg-surface border border-line flex items-center justify-center shrink-0 active:scale-95 transition-transform disabled:opacity-35';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button type="button" onClick={() => orden[i - 1] && onCambiar(orden[i - 1].id)} disabled={i === 0} aria-label="Anterior" className={flecha}>
        <ChevronLeft size={19} />
      </button>

      <label className="relative flex-1 min-w-0 h-[52px] rounded-2xl bg-surface border border-line flex items-center gap-2.5 pl-2.5 pr-9">
        {!actual.especial && <AvatarTecnico id={actual.id} nombre={actual.nombre} size={34} estado={actual.estado ?? null} indice={actual.indice} />}
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold leading-tight truncate">{actual.nombre}</span>
          <span className="block text-[12px] text-muted truncate">
            {[cuadrillaActual?.nombre, typeof actual.cuenta === 'number' ? (actual.cuenta === 0 ? 'Sin servicios' : `${actual.cuenta} ${unidad}${actual.cuenta === 1 ? '' : 's'}`) : null]
              .filter(Boolean).join(' · ') || `${i + 1} de ${orden.length}`}
          </span>
        </span>
        <ChevronDown size={17} className="absolute right-3 text-muted pointer-events-none" />
        {/* El menú nativo cubre todo el control: tocar en cualquier parte lo abre. */}
        <select
          value={actual.id}
          onChange={(e) => onCambiar(e.target.value)}
          aria-label="Elegir persona"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-[16px]"
        >
          {agrupado ? (
            <>
              {grupos.map((g) => (
                <optgroup key={g.titulo} label={g.titulo}>
                  {g.gente.map((p) => <option key={p.id} value={p.id}>{texto(p)}</option>)}
                </optgroup>
              ))}
              {sueltos.length > 0 && (
                <optgroup label="Sin cuadrilla">
                  {sueltos.map((p) => <option key={p.id} value={p.id}>{texto(p)}</option>)}
                </optgroup>
              )}
            </>
          ) : (
            normales.map((p) => <option key={p.id} value={p.id}>{texto(p)}</option>)
          )}
          {especiales.map((p) => <option key={p.id} value={p.id}>{texto(p)}</option>)}
        </select>
      </label>

      <button type="button" onClick={() => orden[i + 1] && onCambiar(orden[i + 1].id)} disabled={i >= orden.length - 1} aria-label="Siguiente" className={flecha}>
        <ChevronRight size={19} />
      </button>
    </div>
  );
}
