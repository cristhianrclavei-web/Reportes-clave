'use client';

import { Scissors } from 'lucide-react';
import { Elemento, Lazo, direccionVisible, hijosDe, lineaPrincipal, tipoDispositivo } from '@/lib/lazos';

// Diagrama unifilar que se arma solo con el orden capturado, al estilo de
// sus planos de CAD: el panel arriba a la izquierda, la línea del lazo corre
// a lo ancho y baja al siguiente renglón cuando se acaba el espacio; cada
// dispositivo cuelga de la línea y lo que cuelga de él va debajo.

export type EstadoEnFalla = 'sospechoso' | 'descartado';

const ANCHO_COLUMNA = 84;
// Dispositivos por renglón. El diagrama se recorre deslizando a la derecha;
// al pasar de 10 sigue en el renglón de abajo.
const POR_RENGLON = 10;

export function Simbolo({ tipo, chico = false }: { tipo: string; chico?: boolean }) {
  const t = tipoDispositivo(tipo);
  if (t.forma === 'detector') {
    const ancho = chico ? 30 : 38;
    const letra = tipo === 'SC' ? 'C' : 'S';
    return (
      <svg width={ancho} height={ancho * 0.9} viewBox="0 0 38 34" role="img" aria-label={t.nombre}>
        <path d="M10 2h18l9 15-9 15H10L1 17z" fill="rgb(var(--c-surface))" stroke="currentColor" strokeWidth="1.8" />
        <text x="19" y="22" textAnchor="middle" fontFamily="var(--font-mono), monospace" fontSize="13" fill="currentColor">{letra}</text>
      </svg>
    );
  }
  if (t.forma === 'caja') {
    return (
      <span aria-label={t.nombre} className={`${chico ? 'w-7 h-7' : 'w-[34px] h-[34px]'} rounded-full border-[1.6px] border-dashed border-amber text-amber flex items-center justify-center font-mono text-[10px]`}>
        RG
      </span>
    );
  }
  if (t.forma === 'fin') {
    return (
      <span aria-label={t.nombre} className="w-6 h-6 my-1 rounded-full border-[1.6px] border-current flex items-center justify-center font-mono text-[8px]">
        FDL
      </span>
    );
  }
  return (
    <span aria-label={t.nombre} className={`${chico ? 'min-w-[30px] h-[26px] text-[10.5px]' : 'min-w-[34px] h-[30px] text-[11px]'} mt-0.5 px-1 border-[1.6px] border-current bg-surface flex items-center justify-center font-mono`}>
      {tipo}
    </span>
  );
}

function claseEstado(estado: EstadoEnFalla | undefined): string {
  if (estado === 'sospechoso') return 'text-amber';
  if (estado === 'descartado') return 'text-ink opacity-35';
  return 'text-ink';
}

export default function DiagramaLazo({
  lazo,
  elementos,
  onTocar,
  estados,
  cortes,
}: {
  lazo: Lazo;
  elementos: Elemento[];
  onTocar?: (elemento: Elemento) => void;
  // Búsqueda de falla: cómo pintar cada dispositivo y dónde se cortó.
  estados?: Map<string, EstadoEnFalla>;
  cortes?: Map<string, number>;
}) {
  const principal = lineaPrincipal(elementos);
  const renglones: Elemento[][] = [];
  for (let i = 0; i < principal.length; i += POR_RENGLON) {
    renglones.push(principal.slice(i, i + POR_RENGLON));
  }

  function boton(e: Elemento, chico: boolean) {
    const estado = estados?.get(e.id);
    const direccion = direccionVisible(e.direccion, lazo.numero);
    return (
      <button
        type="button"
        onClick={() => onTocar?.(e)}
        className={`flex flex-col items-center rounded-lg px-0.5 transition-colors hover:bg-surface-2/70 ${claseEstado(estado)}`}
        aria-label={`${e.nombre}${direccion ? `, dirección ${direccion}` : ''}`}
      >
        <Simbolo tipo={e.tipo} chico={chico} />
        <span className={`font-mono text-[10.5px] mt-1 whitespace-nowrap max-w-[80px] truncate ${estado === 'sospechoso' ? 'text-amber' : 'text-muted'}`}>{e.nombre}</span>
        {direccion && <span className="font-mono text-[10px] text-faint leading-tight">{direccion}</span>}
      </button>
    );
  }

  // Lo que cuelga de un dispositivo. Cada cosa que cuelga directo de él es
  // una rama aparte (una estrella con varias ramas se dibuja lado a lado);
  // dentro de una rama, lo que sigue en serie cuelga del anterior.
  function ramasDe(padreId: string): React.ReactNode {
    const hijos = hijosDe(elementos, padreId);
    if (hijos.length === 0) return null;
    if (hijos.length === 1) return nodoDeRama(hijos[0]);
    return (
      <div className="flex flex-col items-center">
        <div className="w-0.5 h-2 bg-muted/70" aria-hidden="true" />
        <div className="flex">
          {hijos.map((hijo, i) => (
            <div key={hijo.id} className="relative flex flex-col items-center px-1" style={{ minWidth: ANCHO_COLUMNA }}>
              {i > 0 && <div className="absolute left-0 top-0 w-1/2 h-0.5 bg-muted/70" aria-hidden="true" />}
              {i < hijos.length - 1 && <div className="absolute right-0 top-0 w-1/2 h-0.5 bg-muted/70" aria-hidden="true" />}
              {nodoDeRama(hijo)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function nodoDeRama(e: Elemento): React.ReactNode {
    return (
      <div className="flex flex-col items-center">
        <div className="w-0.5 h-2 bg-muted/70" aria-hidden="true" />
        {boton(e, true)}
        {ramasDe(e.id)}
      </div>
    );
  }

  return (
    <div className="w-max min-w-full">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px] border-[1.5px] border-teal text-teal rounded-md px-2 py-1">PCI</span>
        <span className="text-[11.5px] text-faint truncate">{lazo.panel || 'Panel'} · salida</span>
      </div>

      {principal.length === 0 && (
        <p className="text-[13px] text-muted mt-4">Todavía no hay dispositivos. Captura el primero desde «Lista en orden».</p>
      )}

      {renglones.map((renglon, i) => (
        <div key={i} className="relative pl-5">
          {/* Entrada del renglón: del PCI (el primero) o del regreso del
              renglón de arriba, baja hasta la línea. */}
          <div className="absolute left-[9px] top-0 h-4 w-0.5 bg-muted/70" aria-hidden="true" />
          {/* Si sigue otro renglón: la línea baja por la derecha y regresa
              por abajo a la izquierda, como un salto de línea. Así se lee que
              el siguiente renglón va en serie, no que sale del panel. */}
          {i < renglones.length - 1 && (
            <>
              <div className="absolute right-2 top-[14px] bottom-0 w-0.5 bg-muted/70" aria-hidden="true" />
              <div className="absolute left-[9px] right-2 bottom-0 h-0.5 bg-muted/70" aria-hidden="true" />
            </>
          )}
          <div className="h-3.5" />
          <div className="relative">
            <div className="absolute -left-[11px] right-2 top-0 h-0.5 bg-muted/70" aria-hidden="true" />
            <div className="flex">
              {renglon.map((e) => {
                const corte = cortes?.get(e.id);
                return (
                  <div key={e.id} className="relative flex flex-col items-center shrink-0" style={{ minWidth: ANCHO_COLUMNA }}>
                    {corte !== undefined && (
                      <span className="absolute -right-2 -top-[11px] z-10 flex items-center gap-0.5 rounded bg-ink text-bg font-mono text-[10px] px-1 py-px">
                        <Scissors size={10} strokeWidth={2.6} aria-hidden="true" />{corte}
                      </span>
                    )}
                    <div className="w-0.5 h-3 bg-muted/70" aria-hidden="true" />
                    {boton(e, false)}
                    {ramasDe(e.id)}
                    <div className="h-3" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
