'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Paperclip, RefreshCw, Search, Trash2, X, Zap } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import ResumenFallaTierra from '@/components/lazos/ResumenFallaTierra';
import { AnexoFallaTierra, etiquetaDispositivo, fechaHoraEnMexico, huboActividadEl } from '@/lib/anexoFallaTierra';
import { busquedasDelCliente } from '@/lib/lazosDatos';

// Sección «Falla a tierra» del reporte (paso Evidencia). El técnico anexa
// las búsquedas de falla de los lazos de este cliente: la encontrada o la
// que sigue en proceso con los cortes que llevaban. Se guarda una copia en
// reports.data.fallasTierra; supervisión la ve en el reporte y sale en el PDF.

function resumenCorto(a: AnexoFallaTierra): string {
  const cortes = `${a.cortes.length} ${a.cortes.length === 1 ? 'corte' : 'cortes'}`;
  if (a.estado === 'resuelta') {
    const donde = a.encontrada ? `en ${etiquetaDispositivo(a.encontrada)}` : 'en el cable';
    return `${cortes} · encontrada ${donde}`;
  }
  return `${cortes} · quedan ${a.final.quedan} en duda`;
}

// ¿La copia anexada ya no coincide con cómo va la búsqueda?
function cambio(anexada: AnexoFallaTierra, actual: AnexoFallaTierra): boolean {
  return anexada.estado !== actual.estado || anexada.cortes.length !== actual.cortes.length || anexada.causa !== actual.causa;
}

export default function AnexarFallaTierra({ clienteId, fecha, visible, anexos, onCambiar }: {
  clienteId: string | null;
  // Fecha del reporte (AAAA-MM-DD) para sugerir lo que se trabajó ese día.
  fecha: string;
  // Solo se consulta la base cuando el paso está a la vista.
  visible: boolean;
  anexos: AnexoFallaTierra[];
  onCambiar: (anexos: AnexoFallaTierra[]) => void;
}) {
  const [busquedas, setBusquedas] = useState<AnexoFallaTierra[] | null>(null);
  const [sinConexion, setSinConexion] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!clienteId) return;
    setCargando(true);
    setError(null);
    try {
      const resultado = await busquedasDelCliente(clienteId);
      setBusquedas(resultado.busquedas);
      setSinConexion(resultado.sinConexion);
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar las búsquedas de falla.');
    }
    setCargando(false);
  }, [clienteId]);

  useEffect(() => {
    if (visible && clienteId) cargar();
  }, [visible, clienteId, cargar]);

  const anexadas = new Set(anexos.map((a) => a.falla_id));
  const disponibles = busquedas || [];
  // Lo que se trabajó el día del reporte y aún no se anexa: se sugiere.
  const sugeridas = disponibles.filter((b) => !anexadas.has(b.falla_id) && huboActividadEl(b, fecha));

  function anexar(b: AnexoFallaTierra) {
    if (anexadas.has(b.falla_id)) return;
    onCambiar([...anexos, b]);
    setEligiendo(false);
    setAbierto(b.falla_id);
  }

  function quitar(fallaId: string) {
    onCambiar(anexos.filter((a) => a.falla_id !== fallaId));
  }

  function actualizar(actual: AnexoFallaTierra) {
    onCambiar(anexos.map((a) => (a.falla_id === actual.falla_id ? actual : a)));
  }

  return (
    <div className="glass rounded-2xl p-4 lg:p-5 lg:col-span-2">
      <p className="font-display font-semibold text-[16px] tracking-wide text-ink mb-1 flex items-center gap-2.5">
        <span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Falla a tierra
      </p>
      <p className="text-[12.5px] text-muted mb-3">
        Si buscaron una falla a tierra, anéxala: va con los cortes que hicieron, dónde quedó la falla y las fotos. Se anexa aunque no la hayan encontrado.
      </p>

      {!clienteId && (
        <p className="text-[13px] text-muted rounded-xl bg-surface-2 border border-line p-3">
          Elige el cliente de la lista en el paso 1 para ver sus lazos.
        </p>
      )}

      {clienteId && sugeridas.map((b) => (
        <div key={b.falla_id} className="mb-2 rounded-2xl border border-amber/50 bg-amber/10 p-3 flex items-center gap-3">
          <Zap size={20} strokeWidth={2.2} className="text-amber shrink-0" />
          <div className="flex-1 min-w-0 text-[13px]">
            <p className="font-semibold">Este día trabajaron en {b.lazo.codigo} {b.lazo.nombre}</p>
            <p className="text-muted">{resumenCorto(b)}</p>
          </div>
          <button type="button" onClick={() => anexar(b)} className="shrink-0 min-h-[40px] px-3 rounded-xl bg-amber text-inkOnAccent font-semibold text-[13.5px]">
            Anexar
          </button>
        </div>
      ))}

      {anexos.length > 0 && (
        <ul className="flex flex-col gap-2 mb-3">
          {anexos.map((a) => {
            const actual = disponibles.find((b) => b.falla_id === a.falla_id);
            const hayCambios = !!actual && cambio(a, actual);
            const expandido = abierto === a.falla_id;
            return (
              <li key={a.falla_id} className="rounded-2xl border border-line bg-surface">
                <div className="flex items-center gap-2 p-3">
                  <button type="button" onClick={() => setAbierto(expandido ? null : a.falla_id)} aria-expanded={expandido}
                    className="flex-1 min-w-0 text-left flex items-center gap-2">
                    <Paperclip size={16} strokeWidth={2.2} className="text-teal shrink-0" />
                    <span className="min-w-0">
                      <span className="block font-semibold text-[14px] truncate">{a.lazo.codigo} {a.lazo.nombre}</span>
                      <span className="flex items-center gap-1.5 text-[12.5px] text-muted min-w-0">
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${a.estado === 'resuelta' ? 'bg-teal/15 text-teal' : 'bg-amber/15 text-amber'}`}>
                          {a.estado === 'resuelta' ? 'Encontrada' : 'En proceso'}
                        </span>
                        <span className="truncate">{resumenCorto(a)}</span>
                      </span>
                    </span>
                    <ChevronDown size={16} strokeWidth={2.4} className={`shrink-0 text-muted transition-transform ${expandido ? 'rotate-180' : ''}`} />
                  </button>
                  <button type="button" onClick={() => quitar(a.falla_id)} aria-label={`Quitar ${a.lazo.codigo} del reporte`}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-faint hover:text-red shrink-0">
                    <Trash2 size={16} strokeWidth={2.2} />
                  </button>
                </div>
                {hayCambios && actual && (
                  <button type="button" onClick={() => actualizar(actual)}
                    className="mx-3 mb-3 w-[calc(100%-1.5rem)] min-h-[40px] rounded-xl border border-teal/50 bg-teal/10 text-teal text-[13px] font-semibold flex items-center justify-center gap-1.5">
                    <RefreshCw size={14} strokeWidth={2.4} /> Hubo cortes o cambios después de anexarla · Actualizar
                  </button>
                )}
                {expandido && (
                  <div className="px-3 pb-3 pt-1 border-t border-line">
                    <div className="pt-3"><ResumenFallaTierra anexo={a} conEncabezado={false} /></div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {clienteId && (
        <button type="button" onClick={() => { setEligiendo(true); if (!busquedas) cargar(); }}
          className="w-full min-h-[48px] rounded-xl border border-dashed border-line-strong bg-surface-2 text-[14px] font-semibold flex items-center justify-center gap-2">
          <Paperclip size={17} strokeWidth={2.2} /> Anexar búsqueda de falla a tierra
        </button>
      )}
      {error && <p className="text-red font-semibold text-[13px] mt-2">{error}</p>}

      {eligiendo && (
        <ModalOverlay onClose={() => setEligiendo(false)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="font-display font-bold text-[21px]">Anexar búsqueda</h2>
              <button type="button" onClick={() => setEligiendo(false)} aria-label="Cerrar" className="w-10 h-10 rounded-full flex items-center justify-center text-muted hover:bg-surface-2">
                <X size={20} strokeWidth={2.4} />
              </button>
            </div>
            <p className="text-[12.5px] text-muted mb-3">Búsquedas en proceso y las encontradas en los últimos 30 días en los lazos de este cliente.</p>
            {sinConexion && (
              <p className="text-[12.5px] text-amber mb-2">Sin señal: solo se ven las búsquedas en proceso de los lazos abiertos en este teléfono.</p>
            )}
            {cargando && <p className="text-[13px] text-muted py-4 text-center">Buscando…</p>}
            {error && (
              <div className="text-[13px] text-red py-2">
                {error}
                <button type="button" onClick={cargar} className="ml-2 underline font-semibold">Reintentar</button>
              </div>
            )}
            {!cargando && busquedas && busquedas.length === 0 && (
              <div className="text-[13px] text-muted py-4 text-center flex flex-col items-center gap-2">
                <Search size={22} strokeWidth={2} />
                No hay búsquedas de falla a tierra en los lazos de este cliente. Se inician en Lazos → el lazo → «Falla a tierra».
              </div>
            )}
            <ul className="flex flex-col gap-2 overflow-y-auto">
              {disponibles.map((b) => {
                const ya = anexadas.has(b.falla_id);
                const hoy = huboActividadEl(b, fecha);
                return (
                  <li key={b.falla_id}>
                    <button type="button" disabled={ya} onClick={() => anexar(b)}
                      className="w-full text-left rounded-2xl border border-line bg-surface p-3 hover:border-teal disabled:opacity-55 disabled:hover:border-line">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[14.5px]"><span className="text-teal">{b.lazo.codigo}</span> {b.lazo.nombre}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${b.estado === 'resuelta' ? 'bg-teal/15 text-teal' : 'bg-amber/15 text-amber'}`}>
                          {b.estado === 'resuelta' ? 'Encontrada' : 'En proceso'}
                        </span>
                        {hoy && <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold bg-ink text-bg">Este día</span>}
                        {ya && <span className="text-[11.5px] text-muted">Ya anexada</span>}
                      </span>
                      <span className="block text-[12.5px] text-muted mt-1">{resumenCorto(b)}</span>
                      <span className="block text-[12px] text-faint mt-0.5">
                        Inició {fechaHoraEnMexico(b.abierta_en)}{b.resuelta_en ? ` · encontrada ${fechaHoraEnMexico(b.resuelta_en)}` : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
