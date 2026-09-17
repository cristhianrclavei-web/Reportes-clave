'use client';

import { useEffect, useState } from 'react';
import {
  Levantamiento, SistemaLevantamiento, obtenerLevantamiento, eliminarLevantamiento, urlsDeFotos,
} from '@/lib/levantamientos';
import LevantamientoForm from './LevantamientoForm';
import { showToast } from '@/components/Toast';
import { X, Pencil, Trash2 } from 'lucide-react';

const cardCls = 'glass rounded-2xl p-4';

function formatFecha(fecha: string): string {
  if (!fecha) return '—';
  const [y, m, d] = fecha.split('-');
  if (!y || !m || !d) return fecha;
  return `${d}/${m}/${y}`;
}
function nombreCreador(profiles: Levantamiento['profiles']): string {
  if (!profiles) return '—';
  return Array.isArray(profiles) ? profiles[0]?.full_name || '—' : profiles.full_name || '—';
}

function GaleriaFotos({ fotos }: { fotos: { path: string; caption: string }[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (fotos.length === 0) return;
    urlsDeFotos(fotos.map((f) => f.path)).then(setUrls);
  }, [fotos]);
  if (fotos.length === 0) return null;
  return (
    <div className="grid grid-cols-4 gap-2 mt-3">
      {fotos.map((f) => (
        <a key={f.path} href={urls[f.path] || '#'} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-lg overflow-hidden border border-line bg-surface-2 block">
          {urls[f.path] ? <img src={urls[f.path]} className="w-full h-full object-cover" /> : <div className="w-full h-full animate-pulse" />}
        </a>
      ))}
    </div>
  );
}

export default function LevantamientoDetalleModal({
  levantamientoId,
  puedeEditar,
  onClose,
  onEliminado,
  onActualizado,
}: {
  levantamientoId: string;
  puedeEditar: boolean;
  onClose: () => void;
  onEliminado?: (id: string) => void;
  onActualizado?: () => void;
}) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [levantamiento, setLevantamiento] = useState<Levantamiento | null>(null);
  const [sistemas, setSistemas] = useState<SistemaLevantamiento[]>([]);
  const [editando, setEditando] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const { levantamiento: lev, sistemas: sis } = await obtenerLevantamiento(levantamientoId);
      setLevantamiento(lev);
      setSistemas(sis);
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el levantamiento');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, [levantamientoId]);

  async function handleEliminar() {
    if (!levantamiento) return;
    if (!confirm(`¿Eliminar el levantamiento de «${levantamiento.empresa}» (folio ${levantamiento.folio})?\n\nEsta acción es permanente.`)) return;
    setEliminando(true);
    try {
      await eliminarLevantamiento(levantamiento.id);
      showToast('Levantamiento eliminado', 'success');
      onEliminado?.(levantamiento.id);
      onClose();
    } catch (e: any) {
      alert('No se pudo eliminar: ' + (e?.message || 'error'));
      setEliminando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="glass-strong rounded-t-3xl sm:rounded-3xl max-w-2xl w-full max-h-[94vh] overflow-y-auto p-5 relative">
        <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 w-9 h-9 rounded-full bg-surface-2 border border-line flex items-center justify-center active:scale-90 transition-transform z-10">
          <X size={17} strokeWidth={2.4} />
        </button>

        {cargando && <p className="text-center text-muted py-14 text-[14px]">Cargando…</p>}
        {error && <p className="text-center text-red py-14 text-[14px]">{error}</p>}

        {!cargando && !error && levantamiento && editando && (
          <>
            <p className="font-display font-bold text-[18px] mb-4 pr-10">Editar levantamiento · {levantamiento.folio}</p>
            <LevantamientoForm
              modo="editar"
              levantamientoId={levantamiento.id}
              inicial={{ levantamiento, sistemas }}
              onCancelar={() => setEditando(false)}
              onGuardado={async () => {
                setEditando(false);
                await cargar();
                onActualizado?.();
              }}
            />
          </>
        )}

        {!cargando && !error && levantamiento && !editando && (
          <div className="flex flex-col gap-4 pr-6">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[13px] font-mono font-semibold text-teal">{levantamiento.folio}</span>
                <span className="text-faint">·</span>
                <span className="text-[12.5px] text-muted">{formatFecha(levantamiento.fecha)}</span>
              </div>
              <h2 className="font-display font-bold text-[21px] leading-snug">{levantamiento.empresa}</h2>
              <p className="text-[13px] text-muted mt-0.5">Hecho por {nombreCreador(levantamiento.profiles)}</p>
            </div>

            <div className={cardCls}>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                {levantamiento.atencion && <div><div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Atención</div>{levantamiento.atencion}</div>}
                {levantamiento.telefono && <div><div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Teléfono</div>{levantamiento.telefono}</div>}
                {levantamiento.correo && <div><div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Correo</div>{levantamiento.correo}</div>}
                {levantamiento.direccion && <div><div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Dirección</div>{levantamiento.direccion}</div>}
              </div>
            </div>

            {sistemas.map((s) => (
              <div key={s.id} className={cardCls}>
                <p className="font-display font-semibold text-[13px] uppercase tracking-wider text-teal mb-2.5">{s.sistema}</p>
                {s.estado_actual && (
                  <div className="mb-2.5">
                    <p className="text-[10.5px] uppercase tracking-wider text-muted mb-1">Estado actual</p>
                    <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{s.estado_actual}</p>
                  </div>
                )}
                {s.observaciones && (
                  <div>
                    <p className="text-[10.5px] uppercase tracking-wider text-muted mb-1">Observaciones</p>
                    <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{s.observaciones}</p>
                  </div>
                )}
                <GaleriaFotos fotos={s.fotos} />
              </div>
            ))}

            {(levantamiento.notas || levantamiento.fotos.length > 0) && (
              <div className={cardCls}>
                <p className="font-display font-semibold text-[13px] uppercase tracking-wider text-teal mb-2.5">Notas generales del sitio</p>
                {levantamiento.notas && <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{levantamiento.notas}</p>}
                <GaleriaFotos fotos={levantamiento.fotos} />
              </div>
            )}

            {puedeEditar && (
              <div className="flex gap-2.5 mt-1">
                <button
                  onClick={() => setEditando(true)}
                  className="flex-1 min-h-[50px] rounded-2xl border border-line-strong text-ink/80 font-semibold text-[14.5px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <Pencil size={16} strokeWidth={2.3} />
                  Editar
                </button>
                <button
                  onClick={handleEliminar}
                  disabled={eliminando}
                  className="flex-1 min-h-[50px] rounded-2xl border border-red/40 text-red font-semibold text-[14.5px] flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
                >
                  <Trash2 size={16} strokeWidth={2.3} />
                  {eliminando ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
