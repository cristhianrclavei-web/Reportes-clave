'use client';

import { useEffect, useState } from 'react';
import { History, RotateCcw, Save } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import { confirmar } from '@/lib/dialogos';
import { compararPropuesta, NOMBRE_DOCUMENTO, type TipoDocumento } from '@/lib/propuestas';
import { guardarVersionManual, leerOriginal, listarVersiones, restaurarVersion, type Version } from '@/lib/propuestasDatos';

// Versiones de un plano, unifilar o guía: se guardan solas antes de cada
// fusión y de cada restauración, y a mano con «Guardar versión». Cada una
// dice cuántos cambios hay contra lo de ahora y se puede restaurar.

export default function HistorialVersiones({ tipo, objetoId, onCerrar, onRestaurada }: {
  tipo: TipoDocumento;
  objetoId: string;
  onCerrar: () => void;
  onRestaurada: () => void;
}) {
  const [versiones, setVersiones] = useState<(Version & { autor: string; diferencias: number })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function cargar() {
    setError(null);
    try {
      const [lista, actual] = await Promise.all([listarVersiones(tipo, objetoId), leerOriginal(tipo, objetoId)]);
      setVersiones(lista.map((v) => ({ ...v, diferencias: compararPropuesta(tipo, actual.doc, v.datos, actual.doc).length })));
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar las versiones.');
    }
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tipo, objetoId]);

  async function restaurar(v: Version & { diferencias: number }) {
    if (!(await confirmar(`¿Regresar ${NOMBRE_DOCUMENTO[tipo].toLowerCase()} a esta versión?`, {
      detalle: `Cambian ${v.diferencias} ${v.diferencias === 1 ? 'cosa' : 'cosas'}. Lo de ahora se guarda antes como otra versión, así que se puede volver.`,
      textoAceptar: 'Restaurar',
    }))) return;
    setOcupado(true);
    try {
      await restaurarVersion(v);
      showToast('Versión restaurada', 'success');
      onRestaurada();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo restaurar.', 'error');
      setOcupado(false);
    }
  }

  async function guardarAhora() {
    setOcupado(true);
    try {
      await guardarVersionManual(tipo, objetoId, 'Versión guardada a mano');
      showToast('Versión guardada', 'success');
      await cargar();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo guardar la versión.', 'error');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <ModalOverlay onClose={() => !ocupado && onCerrar()}>
      <div className="glass-strong rounded-3xl max-w-lg w-full p-5 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center gap-2 mb-1">
          <History size={19} className="text-teal" />
          <p className="font-display font-bold text-[19px] flex-1">Versiones</p>
          <button type="button" onClick={guardarAhora} disabled={ocupado} className="min-h-[38px] px-3 rounded-xl border border-line bg-surface-2 text-[13px] font-semibold flex items-center gap-1.5 disabled:opacity-60">
            <Save size={14} /> Guardar versión
          </button>
        </div>
        <p className="text-[13px] text-muted mb-4">Se guardan solas antes de aceptar cambios de un técnico y antes de restaurar.</p>
        {error && <p className="rounded-xl bg-red/10 text-red text-[14px] px-3 py-2">{error}</p>}
        {versiones === null && !error && <p className="text-[14px] text-muted">Cargando…</p>}
        {versiones && versiones.length === 0 && <p className="text-[14px] text-muted">Todavía no hay versiones guardadas.</p>}
        <div className="grid gap-1.5">
          {versiones?.map((v) => (
            <div key={v.id} className="rounded-xl border border-line bg-surface-2 p-3 flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-semibold">{new Date(v.creado_en).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="block text-[12.5px] text-muted">{v.nota || 'Versión'} · {v.autor}</span>
                <span className="block text-[12px] text-faint">{v.diferencias === 0 ? 'Igual a como está ahora' : `${v.diferencias} ${v.diferencias === 1 ? 'diferencia' : 'diferencias'} con lo de ahora`}</span>
              </span>
              <button type="button" disabled={ocupado || v.diferencias === 0} onClick={() => restaurar(v)}
                className="min-h-[38px] px-3 rounded-lg border border-line bg-surface text-[13px] font-semibold flex items-center gap-1 disabled:opacity-40">
                <RotateCcw size={14} /> Restaurar
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={onCerrar} disabled={ocupado} className="mt-4 w-full min-h-[48px] rounded-2xl border border-line-strong font-semibold text-[14.5px]">Cerrar</button>
      </div>
    </ModalOverlay>
  );
}
