'use client';

import { useEffect, useRef, useState } from 'react';
import { CornerDownRight, GitBranch, Scissors } from 'lucide-react';
import { Elemento, Lazo, armarDiagrama, colgantesEnLinea, direccionVisible, hijosDe, tipoDispositivo } from '@/lib/lazos';

// Diagrama unifilar que se arma solo con el orden capturado, al estilo de
// sus planos de CAD: el panel arriba a la izquierda, la línea del lazo corre
// a lo ancho y baja al siguiente renglón cuando se acaba el espacio (cuántos
// caben depende del ancho de la pantalla). Las ramas chicas cuelgan debajo
// de su dispositivo; las largas se dibujan aparte («Rama A») con el mismo
// acomodo en renglones, para que el diagrama no crezca hacia abajo sin fin.

export type EstadoEnFalla = 'sospechoso' | 'descartado';

const ANCHO_COLUMNA = 84;
// Dispositivos por renglón: los que quepan a lo ancho, entre 6 (celular: se
// desliza un poco a la derecha) y 16 (pantalla grande).
const MINIMO_POR_RENGLON = 6;
const MAXIMO_POR_RENGLON = 16;

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

// Cuántos dispositivos caben a lo ancho del contenedor.
function usePorRenglon(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [porRenglon, setPorRenglon] = useState(10);
  useEffect(() => {
    const nodo = ref.current;
    if (!nodo) return;
    const medir = () => {
      const caben = Math.floor((nodo.clientWidth - 40) / ANCHO_COLUMNA);
      setPorRenglon(Math.max(MINIMO_POR_RENGLON, Math.min(MAXIMO_POR_RENGLON, caben)));
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);
  return [ref, porRenglon];
}

export default function DiagramaLazo({
  lazo,
  elementos,
  onTocar,
  estados,
  cortes,
  colorLinea,
  conPanel = true,
  mover,
}: {
  lazo: Lazo;
  elementos: Elemento[];
  onTocar?: (elemento: Elemento) => void;
  // Búsqueda de falla: cómo pintar cada dispositivo y dónde se cortó.
  estados?: Map<string, EstadoEnFalla>;
  cortes?: Map<string, number>;
  // Vista de panel con varios lazos: cada lazo con su color y sin el PCI
  // propio (lo dibuja PanelLazos una sola vez).
  colorLinea?: string;
  conPanel?: boolean;
  // Modo mover: el seleccionado se resalta y en computadora se puede
  // arrastrar un dispositivo y soltarlo sobre otro.
  mover?: { seleccionado: string | null; onSoltar: (moverId: string, destino: Elemento) => void };
}) {
  const [contenedor, porRenglon] = usePorRenglon();
  const [encima, setEncima] = useState<string | null>(null);
  const linea = { backgroundColor: colorLinea || 'rgb(var(--c-muted) / 0.7)' };
  const acomodo = armarDiagrama(elementos);
  const idBloque = (letra: string) => `rama-${lazo.id}-${letra}`;

  function boton(e: Elemento, chico: boolean) {
    const estado = estados?.get(e.id);
    const direccion = direccionVisible(e.direccion, lazo.numero);
    const seleccionado = mover?.seleccionado === e.id;
    let marco = 'hover:bg-surface-2/70';
    if (mover) marco = 'outline-dashed outline-1 outline-line-strong hover:outline-teal cursor-grab active:cursor-grabbing';
    if (mover && encima === e.id) marco = 'outline outline-2 outline-teal bg-teal/10';
    if (seleccionado) marco = 'outline outline-2 outline-teal bg-teal/15 shadow-glow-teal';
    return (
      <button
        type="button"
        onClick={() => onTocar?.(e)}
        draggable={Boolean(mover)}
        onDragStart={(ev) => { ev.dataTransfer.setData('text/plain', e.id); ev.dataTransfer.effectAllowed = 'move'; }}
        onDragOver={(ev) => { if (!mover) return; ev.preventDefault(); if (encima !== e.id) setEncima(e.id); }}
        onDragLeave={() => setEncima((actual) => (actual === e.id ? null : actual))}
        onDrop={(ev) => {
          if (!mover) return;
          ev.preventDefault();
          setEncima(null);
          const moverId = ev.dataTransfer.getData('text/plain');
          if (moverId && moverId !== e.id) mover.onSoltar(moverId, e);
        }}
        className={`flex flex-col items-center rounded-lg px-0.5 transition-colors outline-offset-2 ${marco} ${claseEstado(estado)}`}
        aria-label={`${e.nombre}${direccion ? `, dirección ${direccion}` : ''}`}
        aria-pressed={mover ? seleccionado : undefined}
      >
        <Simbolo tipo={e.tipo} chico={chico} />
        <span className={`font-mono text-[10.5px] mt-1 whitespace-nowrap max-w-[80px] truncate ${estado === 'sospechoso' ? 'text-amber' : 'text-muted'}`}>{e.nombre}</span>
        {direccion && <span className="font-mono text-[10px] text-faint leading-tight">{direccion}</span>}
      </button>
    );
  }

  // Etiqueta de una rama que se dibuja aparte; al tocarla baja a ella.
  function etiquetaRama(primero: Elemento, letra: string) {
    const cuantos = 1 + contarDebajo(primero.id);
    return (
      <div key={primero.id} className="flex flex-col items-center px-1" style={{ minWidth: ANCHO_COLUMNA }}>
        <div className="w-0.5 h-2" style={linea} aria-hidden="true" />
        <button type="button"
          onClick={() => document.getElementById(idBloque(letra))?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'start' })}
          className="rounded-full border border-teal/50 bg-teal/10 text-teal px-2 py-0.5 text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap hover:bg-teal/20">
          <GitBranch size={12} strokeWidth={2.6} aria-hidden="true" /> Rama {letra} · {cuantos}
        </button>
      </div>
    );
  }

  function contarDebajo(id: string, vueltas = 0): number {
    if (vueltas > 50) return 0;
    return hijosDe(elementos, id).reduce((suma, h) => suma + 1 + contarDebajo(h.id, vueltas + 1), 0);
  }

  // Lo que cuelga de un dispositivo de una línea: cada cosa es una rama
  // aparte (una estrella con varias se dibuja lado a lado); las largas solo
  // con su etiqueta.
  function colgantes(lista: Elemento[]): React.ReactNode {
    if (lista.length === 0) return null;
    const nodos = lista.map((hijo) => {
      const letra = acomodo.letraDeRama.get(hijo.id);
      return letra ? etiquetaRama(hijo, letra) : null;
    });
    if (lista.length === 1) {
      return nodos[0] || nodoDeRama(lista[0]);
    }
    return (
      <div className="flex flex-col items-center">
        <div className="w-0.5 h-2" style={linea} aria-hidden="true" />
        <div className="flex">
          {lista.map((hijo, i) => (
            <div key={hijo.id} className="relative flex flex-col items-center px-1" style={{ minWidth: ANCHO_COLUMNA }}>
              {i > 0 && <div className="absolute left-0 top-0 w-1/2 h-0.5" style={linea} aria-hidden="true" />}
              {i < lista.length - 1 && <div className="absolute right-0 top-0 w-1/2 h-0.5" style={linea} aria-hidden="true" />}
              {nodos[i] || nodoDeRama(hijo)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Rama chica: cuelga hacia abajo con todo lo suyo.
  function nodoDeRama(e: Elemento): React.ReactNode {
    return (
      <div className="flex flex-col items-center">
        <div className="w-0.5 h-2" style={linea} aria-hidden="true" />
        {boton(e, true)}
        {colgantes(hijosDe(elementos, e.id))}
      </div>
    );
  }

  // Una línea (la principal o una rama larga) en renglones.
  function dibujarLinea(lista: Elemento[]) {
    const renglones: { desde: number; elementos: Elemento[] }[] = [];
    for (let i = 0; i < lista.length; i += porRenglon) renglones.push({ desde: i, elementos: lista.slice(i, i + porRenglon) });
    return renglones.map((renglon, r) => (
      <div key={r} className="relative pl-5">
        {/* Entrada del renglón: del PCI (el primero) o del regreso del
            renglón de arriba, baja hasta la línea. */}
        <div className="absolute left-[9px] top-0 h-4 w-0.5" style={linea} aria-hidden="true" />
        {/* Si sigue otro renglón: la línea baja por la derecha y regresa
            por abajo a la izquierda, como un salto de línea. Así se lee que
            el siguiente renglón va en serie, no que sale del panel. */}
        {r < renglones.length - 1 && (
          <>
            <div className="absolute right-2 top-[14px] bottom-0 w-0.5" style={linea} aria-hidden="true" />
            <div className="absolute left-[9px] right-2 bottom-0 h-0.5" style={linea} aria-hidden="true" />
          </>
        )}
        <div className="h-3.5" />
        <div className="relative">
          <div className="absolute -left-[11px] right-2 top-0 h-0.5" style={linea} aria-hidden="true" />
          <div className="flex">
            {renglon.elementos.map((e, k) => {
              const corte = cortes?.get(e.id);
              return (
                <div key={e.id} className="relative flex flex-col items-center shrink-0" style={{ minWidth: ANCHO_COLUMNA }}>
                  {corte !== undefined && (
                    <span className="absolute -right-2 -top-[11px] z-10 flex items-center gap-0.5 rounded bg-ink text-bg font-mono text-[10px] px-1 py-px">
                      <Scissors size={10} strokeWidth={2.6} aria-hidden="true" />{corte}
                    </span>
                  )}
                  <div className="w-0.5 h-3" style={linea} aria-hidden="true" />
                  {boton(e, false)}
                  {colgantes(colgantesEnLinea(elementos, lista, renglon.desde + k))}
                  <div className="h-3" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    ));
  }

  return (
    <div ref={contenedor} className="w-full">
      <div className="w-max min-w-full">
        {conPanel && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] border-[1.5px] border-teal text-teal rounded-md px-2 py-1">PCI</span>
            <span className="text-[11.5px] text-faint truncate">{lazo.panel || 'Panel'} · salida</span>
          </div>
        )}

        {acomodo.principal.length === 0 && (
          <p className="text-[13px] text-muted mt-4">Todavía no hay dispositivos. Captura el primero desde «Lista en orden».</p>
        )}

        {dibujarLinea(acomodo.principal)}

        {acomodo.bloques.map((bloque) => {
          const { origen } = bloque;
          const direccion = origen ? direccionVisible(origen.direccion, lazo.numero) : '';
          const total = bloque.linea.length + bloque.linea.reduce((s, e, i) => s + colgantesEnLinea(elementos, bloque.linea, i).reduce((t, c) => t + 1 + contarDebajo(c.id), 0), 0);
          return (
            <section key={bloque.letra} id={idBloque(bloque.letra)} className="mt-5 pt-3 border-t border-dashed border-line-strong scroll-mt-28" aria-label={origen ? `Rama ${bloque.letra}` : 'Tramo sin conectar'}>
              <div className="flex items-center gap-2 flex-wrap">
                {origen
                  ? <span className="rounded-md bg-teal text-inkOnAccent font-mono text-[12px] font-bold px-2 py-0.5">Rama {bloque.letra}</span>
                  : <span className="rounded-md bg-amber text-black font-mono text-[12px] font-bold px-2 py-0.5">Sin conectar</span>}
                <span className="text-[12px] text-muted flex items-center gap-1">
                  <CornerDownRight size={13} strokeWidth={2.4} aria-hidden="true" />
                  {origen
                    ? <>sale de <button type="button" onClick={() => onTocar?.(origen)} className="font-mono text-ink hover:underline">{origen.nombre}</button></>
                    : 'falta unirlo al lazo'}
                  {direccion && <span className="font-mono text-faint">{direccion}</span>}
                  <span className="text-faint">· {total} {total === 1 ? 'dispositivo' : 'dispositivos'}</span>
                </span>
              </div>
              {dibujarLinea(bloque.linea)}
            </section>
          );
        })}
      </div>
    </div>
  );
}
