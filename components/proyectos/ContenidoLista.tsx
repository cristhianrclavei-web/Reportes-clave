'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, FolderInput, Link2Off, Plus } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import { confirmar } from '@/lib/dialogos';
import { NOMBRE_CONTENIDO, contenidoSinProyecto, moverAProyecto, type ElementoContenido, type TipoContenido } from '@/lib/proyectoContenido';

// Lista de lo que pertenece al proyecto (cotizaciones, planos, servicios…),
// con «Quitar del proyecto» y «Agregar existente» para traer lo que el
// cliente ya tenía sin proyecto.

export function TituloSeccion({ titulo, cuenta, accion }: { titulo: string; cuenta?: number; accion?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2.5 mt-1">
      <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint">{titulo}</span>
      {cuenta !== undefined && <span className="font-mono text-[11.5px] text-faint">{cuenta}</span>}
      <span className="flex-1 h-px bg-line" aria-hidden="true" />
      {accion}
    </div>
  );
}

export const BOTON_CHICO = 'min-h-[38px] px-3 rounded-xl border border-line bg-surface-2 text-[13px] font-semibold flex items-center gap-1.5 hover:border-teal/60 shrink-0';

export default function ContenidoLista({ elementos, vacio, proyectoId, clienteId, tipos, onCambio, abrirEnNueva = false }: {
  elementos: ElementoContenido[];
  vacio: string;
  proyectoId: string;
  clienteId: string;
  // Qué se puede traer del cliente al proyecto desde esta lista.
  tipos: TipoContenido[];
  onCambio: () => void;
  // PDF (levantamientos): se abre en otra pestaña.
  abrirEnNueva?: boolean;
}) {
  const [agregando, setAgregando] = useState(false);

  async function quitar(e: ElementoContenido) {
    if (!(await confirmar(`¿Quitar «${e.titulo}» de este proyecto?`, { detalle: 'No se borra: queda en el cliente, en «Sin proyecto».', textoAceptar: 'Quitar' }))) return;
    try {
      await moverAProyecto(e, null);
      showToast('Quitado del proyecto', 'success');
      onCambio();
    } catch (err: any) {
      showToast(err?.message || 'No se pudo quitar.', 'error');
    }
  }

  return (
    <div>
      {elementos.length === 0 && <p className="text-[13.5px] text-muted mb-2">{vacio}</p>}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-2">
        {elementos.map((e) => (
          <div key={`${e.tipo}-${e.id}`} className="rounded-xl bg-surface-2 border border-line flex items-center gap-1 pr-1">
            <Link href={e.enlace} target={abrirEnNueva ? '_blank' : undefined} className="flex-1 min-w-0 flex items-center gap-2 p-3 hover:text-teal">
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-semibold truncate">{e.titulo}</span>
                <span className="block text-[12px] text-muted truncate">{NOMBRE_CONTENIDO[e.tipo].uno} · {e.detalle}</span>
              </span>
              <ChevronRight size={16} className="text-faint shrink-0" />
            </Link>
            <button type="button" onClick={() => quitar(e)} aria-label={`Quitar ${e.titulo} del proyecto`} title="Quitar del proyecto"
              className="w-10 h-10 rounded-lg flex items-center justify-center text-faint hover:text-red shrink-0">
              <Link2Off size={16} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setAgregando(true)} className="mt-2 text-[13px] font-semibold text-teal flex items-center gap-1.5 min-h-[36px]">
        <FolderInput size={15} /> Traer algo que el cliente ya tiene
      </button>
      {agregando && (
        <TraerExistente clienteId={clienteId} proyectoId={proyectoId} tipos={tipos}
          onCerrar={() => setAgregando(false)} onListo={() => { setAgregando(false); onCambio(); }} />
      )}
    </div>
  );
}

function TraerExistente({ clienteId, proyectoId, tipos, onCerrar, onListo }: {
  clienteId: string;
  proyectoId: string;
  tipos: TipoContenido[];
  onCerrar: () => void;
  onListo: () => void;
}) {
  const [lista, setLista] = useState<ElementoContenido[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const [movidos, setMovidos] = useState(0);

  useEffect(() => {
    let vigente = true;
    contenidoSinProyecto(clienteId)
      .then((c) => { if (vigente) setLista(tipos.flatMap((t) => c[t])); })
      .catch((e) => { if (vigente) setError(e?.message || 'No se pudo cargar.'); });
    return () => { vigente = false; };
    // `tipos` es un arreglo nuevo en cada render; basta con el cliente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  async function traer(e: ElementoContenido) {
    setMoviendo(e.id);
    try {
      await moverAProyecto(e, proyectoId);
      setLista((l) => (l ? l.filter((x) => x !== e) : l));
      setMovidos((n) => n + 1);
    } catch (err: any) {
      showToast(err?.message || 'No se pudo mover.', 'error');
    } finally {
      setMoviendo(null);
    }
  }

  return (
    <ModalOverlay onClose={() => (movidos ? onListo() : onCerrar())}>
      <div className="glass-strong rounded-3xl max-w-lg w-full p-5 max-h-[88vh] overflow-y-auto">
        <p className="font-display font-bold text-[19px]">Traer al proyecto</p>
        <p className="text-[13px] text-muted mt-1 mb-4">Lo del cliente que todavía no está en ningún proyecto ({tipos.map((t) => NOMBRE_CONTENIDO[t].varios.toLowerCase()).join(', ')}).</p>
        {error && <p className="rounded-xl bg-red/10 text-red text-[14px] px-3 py-2">{error}</p>}
        {lista === null && !error && <p className="text-[14px] text-muted">Cargando…</p>}
        {lista && lista.length === 0 && <p className="text-[14px] text-muted">No hay nada suelto de ese tipo en este cliente.</p>}
        <div className="grid gap-1.5">
          {lista?.map((e) => (
            <div key={`${e.tipo}-${e.id}`} className="rounded-xl border border-line bg-surface-2 p-2.5 flex items-center gap-2">
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-semibold truncate">{e.titulo}</span>
                <span className="block text-[12px] text-muted truncate">{NOMBRE_CONTENIDO[e.tipo].uno} · {e.detalle}</span>
              </span>
              <button type="button" disabled={moviendo !== null} onClick={() => traer(e)}
                className="min-h-[40px] px-3 rounded-lg bg-teal text-inkOnAccent text-[13px] font-semibold flex items-center gap-1 disabled:opacity-60">
                <Plus size={14} /> {moviendo === e.id ? 'Moviendo…' : 'Traer'}
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => (movidos ? onListo() : onCerrar())} className="mt-4 w-full min-h-[48px] rounded-2xl border border-line-strong font-semibold text-[14.5px]">
          {movidos ? `Listo (${movidos} ${movidos === 1 ? 'traído' : 'traídos'})` : 'Cerrar'}
        </button>
      </div>
    </ModalOverlay>
  );
}
