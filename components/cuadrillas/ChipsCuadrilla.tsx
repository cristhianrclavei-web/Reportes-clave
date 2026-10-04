'use client';

import { UNIFORMES } from '@/components/AvatarTecnico';
import { Cuadrilla, SIN_CUADRILLA, TODAS, useCuadrillas } from '@/lib/cuadrillas';

const base = 'shrink-0 h-8 pl-2.5 pr-3 rounded-full text-[12.5px] font-semibold border flex items-center gap-1.5 transition-colors active:scale-95';
const on = 'bg-ink text-bg border-ink';
const off = 'bg-surface border-line text-ink/80';

function Punto({ color }: { color: number }) {
  return <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: UNIFORMES[color % UNIFORMES.length] }} />;
}

// Filtro por cuadrilla para pantallas con mucho personal (planeación de la
// semana, tablero). `ids` = técnicos que hay en la pantalla; no se dibuja
// nada si la empresa no usa cuadrillas.
export function FiltroCuadrillas({
  cuadrillas, mapa, ids, valor, onCambiar, className = '',
}: {
  cuadrillas: Cuadrilla[];
  mapa: Map<string, Cuadrilla>;
  ids: string[];
  valor: string;
  onCambiar: (k: string) => void;
  className?: string;
}) {
  if (cuadrillas.length === 0) return null;
  const sueltos = ids.filter((id) => !mapa.has(id)).length;
  const opciones = [
    { k: TODAS, nombre: 'Todas', color: null as number | null, n: ids.length },
    ...cuadrillas.map((c) => ({ k: c.id, nombre: c.nombre, color: c.color as number | null, n: ids.filter((id) => mapa.get(id)?.id === c.id).length })),
    ...(sueltos > 0 ? [{ k: SIN_CUADRILLA, nombre: 'Sin cuadrilla', color: null as number | null, n: sueltos }] : []),
  ];
  return (
    <div className={`flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 lg:flex-wrap lg:overflow-visible ${className}`} style={{ scrollbarWidth: 'none' }}>
      {opciones.map((o) => (
        <button key={o.k} type="button" onClick={() => onCambiar(o.k)} aria-pressed={valor === o.k} className={`${base} ${valor === o.k ? on : off}`}>
          {o.color !== null && <Punto color={o.color} />}
          {o.nombre}
          <span className={`tabular-nums font-medium ${valor === o.k ? 'opacity-70' : 'text-muted'}`}>{o.n}</span>
        </button>
      ))}
    </div>
  );
}

// Al asignar: un toque elige (o quita) a toda la cuadrilla. Después se puede
// ajustar persona por persona, solo para ese servicio.
export function ElegirCuadrilla({
  disponibles, seleccion, onCambiar, className = '',
}: {
  // Técnicos que se pueden elegir en este formulario.
  disponibles: string[];
  seleccion: string[];
  onCambiar: (ids: string[]) => void;
  className?: string;
}) {
  const { cuadrillas } = useCuadrillas();
  const enLista = new Set(disponibles);
  const grupos = cuadrillas
    .map((c) => ({ ...c, ids: c.miembros.filter((id) => enLista.has(id)) }))
    .filter((c) => c.ids.length > 0);
  if (grupos.length === 0) return null;
  return (
    <div className={className}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Cuadrillas</p>
      <div className="flex flex-wrap gap-1.5">
        {grupos.map((c) => {
          const completa = c.ids.every((id) => seleccion.includes(id));
          return (
            <button key={c.id} type="button" aria-pressed={completa}
              onClick={() => onCambiar(completa ? seleccion.filter((id) => !c.ids.includes(id)) : Array.from(new Set([...seleccion, ...c.ids])))}
              className={`${base} ${completa ? on : off}`}>
              <Punto color={c.color} />
              {c.nombre}
              <span className={`tabular-nums font-medium ${completa ? 'opacity-70' : 'text-muted'}`}>{c.ids.length}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
