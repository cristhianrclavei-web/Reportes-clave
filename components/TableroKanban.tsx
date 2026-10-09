'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { LayoutGroup, motion } from 'motion/react';
import { ArrowRightLeft, LayoutList, Columns3 } from 'lucide-react';

// Tablero por columnas: cada columna es un estado y cada tarjeta se arrastra
// a otra columna para cambiarlo. Genérico: Cotizaciones, Facturas y los
// proyectos de un cliente definen sus columnas, su tarjeta y sus reglas.
//
//   · Con ratón se arrastra (arrastre nativo del navegador).
//   · En celular, y con teclado, cada tarjeta tiene «Mover a…», porque el
//     arrastre nativo no existe al tacto.
//   · `puedeMover` decide si un cambio se permite; si devuelve un texto, es
//     el motivo y se muestra en vez de mover. Así las reglas de cada flujo
//     (una cotización se aprueba con firma, una factura se timbra con su
//     folio) no se pueden saltar arrastrando.
//   · El cambio se ve al instante y se deshace solo si guardar falla.

export type ColumnaKanban<K extends string> = {
  clave: K;
  titulo: string;
  // Clases del punto y del borde superior de la columna.
  punto: string;
  // Pista bajo el título cuando la columna está vacía.
  vacio?: string;
};

export default function TableroKanban<T, K extends string>({
  columnas, items, columnaDe, keyFn, tarjeta, puedeMover, onMover, onAviso, pie,
}: {
  columnas: ColumnaKanban<K>[];
  items: T[];
  columnaDe: (item: T) => K;
  keyFn: (item: T) => string;
  tarjeta: (item: T) => ReactNode;
  // true = se puede; texto = por qué no.
  puedeMover?: (item: T, destino: K) => true | string;
  // Guarda el cambio. Si lanza error, la tarjeta regresa a su columna.
  onMover: (item: T, destino: K) => Promise<void>;
  onAviso?: (texto: string, tipo: 'error' | 'success') => void;
  // Total u otro dato al pie de cada columna.
  pie?: (itemsDeLaColumna: T[]) => ReactNode;
}) {
  // Columna en la que se ve cada tarjeta mientras se guarda su cambio.
  const [provisional, setProvisional] = useState<Record<string, K>>({});
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<K | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Lo provisional se suelta cuando los datos ya traen la columna nueva.
  useEffect(() => {
    setProvisional((prev) => {
      const sigue: Record<string, K> = {};
      let cambio = false;
      for (const [k, col] of Object.entries(prev) as [string, K][]) {
        const it = items.find((x) => keyFn(x) === k);
        if (it && columnaDe(it) !== col) sigue[k] = col; else cambio = true;
      }
      return cambio ? sigue : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const columnaVista = (it: T): K => provisional[keyFn(it)] ?? columnaDe(it);

  async function mover(clave: string, destino: K) {
    const it = itemsRef.current.find((x) => keyFn(x) === clave);
    if (!it || columnaVista(it) === destino) return;
    const permiso = puedeMover ? puedeMover(it, destino) : true;
    if (permiso !== true) { onAviso?.(permiso, 'error'); return; }
    setProvisional((p) => ({ ...p, [clave]: destino }));
    try {
      await onMover(it, destino);
    } catch (e: any) {
      setProvisional((p) => { const n = { ...p }; delete n[clave]; return n; });
      onAviso?.('No se pudo mover: ' + (e?.message || 'error'), 'error');
    }
  }

  return (
    <LayoutGroup>
      <div className="flex gap-3 overflow-x-auto pb-3 -mx-4 px-4 lg:mx-0 lg:px-0 snap-x snap-mandatory lg:snap-none">
        {columnas.map((col) => {
          const lista = items.filter((it) => columnaVista(it) === col.clave);
          const encima = sobre === col.clave && arrastrando !== null;
          return (
            <div
              key={col.clave}
              onDragOver={(e) => { if (arrastrando) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (sobre !== col.clave) setSobre(col.clave); } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre((s) => (s === col.clave ? null : s)); }}
              onDrop={(e) => {
                e.preventDefault();
                const clave = e.dataTransfer.getData('text/plain') || arrastrando;
                setSobre(null); setArrastrando(null);
                if (clave) mover(clave, col.clave);
              }}
              className={`snap-start shrink-0 w-[84vw] max-w-[340px] lg:w-auto lg:max-w-none lg:flex-1 lg:min-w-[230px] rounded-2xl border p-2.5 flex flex-col transition-colors duration-150 ${
                encima ? 'border-teal bg-teal/8' : 'border-line bg-surface-2/45'
              }`}
            >
              <div className="flex items-center gap-2 px-1.5 pt-1 pb-2.5">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${col.punto}`} />
                <p className="font-display font-semibold text-[14.5px] tracking-wide flex-1 min-w-0 truncate">{col.titulo}</p>
                <span className="text-[12px] font-semibold text-muted tabular-nums px-2 py-0.5 rounded-full bg-surface border border-line">{lista.length}</span>
              </div>

              <div className="flex flex-col gap-2 min-h-[88px] flex-1">
                {lista.map((it) => {
                  const clave = keyFn(it);
                  return (
                    <motion.div
                      key={clave}
                      layout
                      layoutId={`kanban-${clave}`}
                      transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                      className={`relative rounded-xl bg-surface border border-line shadow-diffuse ${arrastrando === clave ? 'opacity-40' : ''}`}
                    >
                      <div
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', clave);
                          e.dataTransfer.effectAllowed = 'move';
                          setArrastrando(clave);
                          setMenu(null);
                        }}
                        onDragEnd={() => { setArrastrando(null); setSobre(null); }}
                        className="cursor-grab active:cursor-grabbing"
                      >
                        {tarjeta(it)}
                      </div>
                      <div className="px-3 pb-2.5 -mt-0.5">
                        <button
                          type="button"
                          onClick={() => setMenu((m) => (m === clave ? null : clave))}
                          aria-expanded={menu === clave}
                          className="text-[12px] font-semibold text-muted hover:text-teal inline-flex items-center gap-1.5 min-h-[30px]"
                        >
                          <ArrowRightLeft size={12.5} strokeWidth={2.5} />
                          Mover a…
                        </button>
                        {menu === clave && (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {columnas.filter((c) => c.clave !== col.clave).map((c) => (
                              <button
                                key={c.clave}
                                type="button"
                                onClick={() => { setMenu(null); mover(clave, c.clave); }}
                                className="text-[12px] font-semibold px-2.5 min-h-[32px] rounded-full border border-line bg-surface-2 hover:border-teal/50 inline-flex items-center gap-1.5 active:scale-95 transition-transform"
                              >
                                <span className={`w-2 h-2 rounded-full ${c.punto}`} />
                                {c.titulo}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
                {lista.length === 0 && (
                  <div className={`flex-1 min-h-[88px] rounded-xl border border-dashed flex items-center justify-center px-3 text-center text-[12.5px] ${encima ? 'border-teal text-teal' : 'border-line-strong text-faint'}`}>
                    {encima ? 'Suelta aquí' : col.vacio || 'Nada aquí'}
                  </div>
                )}
              </div>

              {pie && lista.length > 0 && <div className="px-1.5 pt-2.5 text-[12.5px] text-muted">{pie(lista)}</div>}
            </div>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

// Interruptor «Lista / Tablero» de una sección. Recuerda la elección por
// sección en el dispositivo; arranca en lista (igual en servidor y cliente) y
// se corrige ya montado.
export function useVistaTablero(seccion: string): ['lista' | 'tablero', (v: 'lista' | 'tablero') => void] {
  const [vista, setVista] = useState<'lista' | 'tablero'>('lista');
  const clave = `vistaTablero:${seccion}`;
  useEffect(() => {
    try { if (localStorage.getItem(clave) === 'tablero') setVista('tablero'); } catch { /* modo privado */ }
  }, [clave]);
  function cambiar(v: 'lista' | 'tablero') {
    setVista(v);
    try { localStorage.setItem(clave, v); } catch { /* no crítico */ }
  }
  return [vista, cambiar];
}

export function InterruptorTablero({ vista, onCambiar, className = '' }: { vista: 'lista' | 'tablero'; onCambiar: (v: 'lista' | 'tablero') => void; className?: string }) {
  return (
    <div className={`inline-flex rounded-xl bg-surface-2 border border-line p-0.5 shrink-0 ${className}`} role="tablist" aria-label="Forma de ver">
      {([['lista', 'Lista', LayoutList], ['tablero', 'Tablero', Columns3]] as const).map(([k, texto, Icono]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={vista === k}
          onClick={() => onCambiar(k)}
          className={`px-3 min-h-[38px] rounded-[10px] text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors ${vista === k ? 'bg-surface text-teal shadow-sm' : 'text-muted hover:text-ink'}`}
        >
          <Icono size={15} strokeWidth={2.3} />
          {texto}
        </button>
      ))}
    </div>
  );
}
