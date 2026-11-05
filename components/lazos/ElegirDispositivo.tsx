'use client';

import { useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Simbolo } from '@/components/lazos/DiagramaLazo';
import { Elemento, Lazo, direccionVisible, posiciones } from '@/lib/lazos';

// Lista para elegir un dispositivo en la búsqueda de falla, en lugar de un
// <select>: cada renglón muestra símbolo, nombre, dirección, ubicación y si
// está en la línea principal o en una rama. Se puede buscar por dirección,
// nombre o ubicación y ver solo lo que sigue en el tramo con falla.

type Filtro = 'zona' | 'todos';

export default function ElegirDispositivo({
  lazo, elementos, opciones, zona, sugeridoId, valor, onCambiar, ninguno,
}: {
  lazo: Lazo;
  // Todos los dispositivos del lazo (para saber posición y de quién cuelga).
  elementos: Elemento[];
  // Los que se pueden elegir, ya en orden de recorrido.
  opciones: Elemento[];
  // Dónde puede estar la falla; null si todavía no hay cortes.
  zona: Set<string> | null;
  sugeridoId: string | null;
  valor: string;
  onCambiar: (id: string) => void;
  // Opción extra al inicio, p. ej. «En el cable, entre dispositivos».
  ninguno?: string;
}) {
  const hayZona = zona !== null && opciones.some((e) => zona.has(e.id));
  const [filtro, setFiltro] = useState<Filtro>(hayZona ? 'zona' : 'todos');
  const [busqueda, setBusqueda] = useState('');

  const pos = posiciones(elementos);
  const porId = new Map(elementos.map((e) => [e.id, e]));
  const enZona = hayZona && zona ? opciones.filter((e) => zona.has(e.id)) : opciones;
  const base = filtro === 'zona' ? enZona : opciones;

  const texto = busqueda.trim().toLowerCase();
  const visibles = base.filter((e) => {
    if (!texto) return true;
    const direccion = direccionVisible(e.direccion, lazo.numero).toLowerCase();
    return direccion.includes(texto)
      || e.nombre.toLowerCase().includes(texto)
      || (e.ubicacion || '').toLowerCase().includes(texto);
  });

  function lugar(e: Elemento): string {
    const posicion = pos.get(e.id);
    if (!e.padre_id) return posicion ? `Pos. ${posicion}` : '';
    const padre = porId.get(e.padre_id);
    return `Rama de ${padre?.nombre || '—'}`;
  }

  const chip = (valorFiltro: Filtro, titulo: string, cuantos: number) => (
    <button type="button" role="tab" aria-selected={filtro === valorFiltro} onClick={() => setFiltro(valorFiltro)}
      className={`flex-1 min-h-[38px] rounded-lg text-[13px] font-semibold transition-colors ${filtro === valorFiltro ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
      {titulo} <span className="font-mono text-[11.5px] opacity-70">{cuantos}</span>
    </button>
  );

  return (
    <div className="rounded-2xl border border-line bg-surface-2/60 p-2">
      <div className="relative">
        <Search size={16} strokeWidth={2.2} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
        <input
          type="search" value={busqueda} onChange={(ev) => setBusqueda(ev.target.value)}
          placeholder="Buscar dirección, nombre o ubicación" aria-label="Buscar dispositivo"
          className="w-full pl-9 pr-3 min-h-[42px] rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[14px]"
        />
      </div>

      {hayZona && (
        <div role="tablist" className="flex gap-1 mt-2 rounded-xl bg-bg/60 p-1">
          {chip('zona', 'En el tramo con falla', enZona.length)}
          {chip('todos', 'Todos', opciones.length)}
        </div>
      )}

      <ul role="radiogroup" aria-label="Dispositivo" className="mt-2 max-h-[42vh] overflow-y-auto flex flex-col gap-1">
        {ninguno && !texto && (
          <li>
            <Renglon elegido={valor === ''} onElegir={() => onCambiar('')}>
              <span className="flex-1 text-[14px] px-1">{ninguno}</span>
            </Renglon>
          </li>
        )}
        {visibles.map((e) => {
          const direccion = direccionVisible(e.direccion, lazo.numero);
          const sugerido = e.id === sugeridoId;
          return (
            <li key={e.id}>
              <Renglon elegido={valor === e.id} onElegir={() => onCambiar(e.id)}>
                <span className={`shrink-0 w-[42px] flex justify-center ${zona && zona.has(e.id) ? 'text-amber' : 'text-muted'}`}>
                  <Simbolo tipo={e.tipo} chico />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-mono text-[15px] font-semibold">{direccion || e.nombre}</span>
                    {direccion && <span className="font-mono text-[12px] text-muted">{e.nombre}</span>}
                    {sugerido && <span className="text-[10.5px] font-semibold uppercase tracking-wide rounded bg-teal/15 text-teal px-1.5 py-px">Sugerido</span>}
                  </span>
                  <span className="block text-[12.5px] text-muted truncate">
                    {lugar(e)}{e.ubicacion ? ` · ${e.ubicacion}` : ''}
                  </span>
                </span>
              </Renglon>
            </li>
          );
        })}
        {visibles.length === 0 && (
          <li className="text-[13px] text-muted px-2 py-4 text-center">
            {texto ? `Nada coincide con «${busqueda.trim()}».` : 'No hay dispositivos para elegir.'}
          </li>
        )}
      </ul>
    </div>
  );
}

function Renglon({ elegido, onElegir, children }: { elegido: boolean; onElegir: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={elegido} onClick={onElegir}
      className={`w-full min-h-[54px] flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition-colors ${elegido ? 'border-teal bg-teal/10' : 'border-transparent hover:bg-surface'}`}>
      {children}
      <span className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${elegido ? 'border-teal bg-teal text-inkOnAccent' : 'border-line-strong'}`} aria-hidden="true">
        {elegido && <Check size={12} strokeWidth={3.2} />}
      </span>
    </button>
  );
}
