'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronDown, ExternalLink, Plus } from 'lucide-react';
import DiagramaLazo from '@/components/lazos/DiagramaLazo';
import { Elemento, Lazo } from '@/lib/lazos';
import { LazoResumen, obtenerLazo } from '@/lib/lazosDatos';

// Diagrama de todo un panel: el PCI una sola vez y cada lazo (cada tarjeta
// SLC) en su propio carril, con su color. Cada carril se desliza a lo ancho
// por separado y se puede plegar, así las líneas de un lazo nunca se cruzan
// con las del otro y la pantalla no se satura.

// Color de cada lazo en el orden del panel. Se evita el ámbar: es el color
// de «sospechoso» en la búsqueda de falla.
const COLORES = ['rgb(var(--c-acento))', '#6EA8FE', '#C792EA', '#F28FB0', '#7DD3C0'];

export function colorDeLazo(indice: number): string {
  return COLORES[indice % COLORES.length];
}

function fondo(color: string, porcentaje: number): string {
  return `color-mix(in srgb, ${color} ${porcentaje}%, transparent)`;
}

type Carril = { elementos: Elemento[] | null; error: string | null };

export default function PanelLazos({ actual, elementosActual, lazos, onTocar, onAgregarLazo }: {
  actual: Lazo;
  elementosActual: Elemento[];
  // Los lazos del panel, incluido el actual, en orden (lazosDelMismoPanel).
  lazos: LazoResumen[];
  onTocar: (elemento: Elemento) => void;
  onAgregarLazo: () => void;
}) {
  const router = useRouter();
  const [carriles, setCarriles] = useState<Record<string, Carril>>({});
  const [plegados, setPlegados] = useState<Set<string>>(new Set());
  const otros = lazos.filter((l) => l.id !== actual.id);
  const idsOtros = otros.map((l) => l.id).join(',');

  async function cargarCarril(id: string) {
    setCarriles((c) => ({ ...c, [id]: { elementos: null, error: null } }));
    try {
      const { datos } = await obtenerLazo(id);
      setCarriles((c) => ({ ...c, [id]: { elementos: datos.elementos, error: null } }));
    } catch (e: any) {
      setCarriles((c) => ({ ...c, [id]: { elementos: null, error: e?.message || 'No se pudo cargar este lazo.' } }));
    }
  }

  // Los otros lazos se piden una vez (sin señal salen de la copia del
  // teléfono si ya se abrieron antes).
  useEffect(() => {
    for (const id of idsOtros.split(',').filter(Boolean)) cargarCarril(id);
  }, [idsOtros]);

  function alternar(id: string) {
    const nuevos = new Set(plegados);
    if (nuevos.has(id)) nuevos.delete(id);
    else nuevos.add(id);
    setPlegados(nuevos);
  }

  const total = lazos.reduce((suma, l) => suma + (l.id === actual.id ? elementosActual.length : l.dispositivos), 0);

  return (
    <div className="rounded-2xl bg-surface border border-line p-3">
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-[13px] border-[1.5px] border-teal text-teal rounded-md px-2 py-1 shrink-0">PCI</span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold truncate">{actual.panel || 'Panel'}</p>
          <p className="text-[12px] text-muted">{lazos.length} lazos · {total} dispositivos</p>
        </div>
      </div>

      {/* El bus del panel baja por la izquierda y de él sale cada lazo. */}
      <div className="relative mt-2 pl-5">
        <div className="absolute left-[15px] top-0 bottom-[30px] w-0.5 bg-line-strong" aria-hidden="true" />
        {lazos.map((l, i) => {
          const color = colorDeLazo(i);
          const esActual = l.id === actual.id;
          const carril = esActual ? { elementos: elementosActual, error: null } : carriles[l.id];
          const cuantos = esActual ? elementosActual.length : l.dispositivos;
          const plegado = plegados.has(l.id);
          return (
            <section key={l.id} className="relative pt-2.5">
              <div className="absolute -left-[5px] top-[30px] w-[17px] h-0.5" style={{ backgroundColor: color }} aria-hidden="true" />
              <div className="rounded-2xl border" style={{ borderColor: fondo(color, esActual ? 55 : 30), backgroundColor: fondo(color, 5) }}>
                <div className="flex items-center gap-1.5 p-2">
                  <button type="button" onClick={() => alternar(l.id)} aria-expanded={!plegado}
                    className="flex-1 min-w-0 flex items-center gap-2 text-left min-h-[40px]">
                    <span className="shrink-0 rounded-lg px-2 py-1 font-mono text-[11.5px] font-bold" style={{ color, backgroundColor: fondo(color, 16) }}>
                      SLC {l.numero ?? '?'}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold truncate">
                        <span className="font-mono" style={{ color }}>{l.codigo}</span> {l.nombre}
                      </span>
                      <span className="flex items-center gap-1.5 text-[12px] text-muted">
                        {cuantos} dispositivos{esActual ? ' · este lazo' : ''}
                        {l.fallaAbierta && <span className="inline-flex items-center gap-0.5 text-amber font-semibold"><AlertTriangle size={12} strokeWidth={2.6} /> falla abierta</span>}
                      </span>
                    </span>
                    <ChevronDown size={17} strokeWidth={2.4} className={`ml-auto shrink-0 text-muted transition-transform ${plegado ? '' : 'rotate-180'}`} />
                  </button>
                  {!esActual && (
                    <button type="button" onClick={() => router.push(`/lazos/${l.id}`)} aria-label={`Abrir ${l.codigo}`}
                      className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-muted hover:bg-surface-2">
                      <ExternalLink size={17} strokeWidth={2.2} />
                    </button>
                  )}
                </div>

                {!plegado && (
                  <div className="px-2 pb-2.5 overflow-x-auto">
                    {!carril || (!carril.elementos && !carril.error) ? (
                      <p className="text-[13px] text-muted px-1 py-3">Cargando…</p>
                    ) : carril.error ? (
                      <p className="text-[13px] text-red px-1 py-2">
                        {carril.error}{' '}
                        <button type="button" onClick={() => cargarCarril(l.id)} className="underline font-semibold">Reintentar</button>
                      </p>
                    ) : (
                      <DiagramaLazo
                        lazo={l}
                        elementos={carril.elementos || []}
                        colorLinea={color}
                        conPanel={false}
                        // En otro lazo, tocar un dispositivo abre ese lazo.
                        onTocar={esActual ? onTocar : () => router.push(`/lazos/${l.id}`)}
                      />
                    )}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <button type="button" onClick={onAgregarLazo}
        className="mt-3 w-full min-h-[46px] rounded-xl border border-dashed border-line-strong text-[13.5px] font-semibold text-muted flex items-center justify-center gap-1.5 hover:text-ink">
        <Plus size={16} strokeWidth={2.6} /> Agregar otro lazo a este panel
      </button>
    </div>
  );
}
