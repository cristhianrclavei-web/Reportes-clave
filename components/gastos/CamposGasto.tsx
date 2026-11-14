'use client';

import { useEffect, useMemo } from 'react';
import { Camera, ReceiptText, X } from 'lucide-react';
import CampoNumero from '@/components/CampoNumero';
import { showToast } from '@/components/Toast';
import { fotoEnMemoria } from '@/lib/evidenciaLegible';
import { FOTOS_MAXIMO, type DatosGasto, type TipoGasto } from '@/lib/paradas';

// Monto y foto del ticket de un gasto (combustible o material). Si no hubo
// ticket se marca y se explica por qué. Las fotos se copian a la memoria de
// la app al elegirlas (ya reducidas), para no depender del archivo de la galería.
export default function CamposGasto({ tipo, valor, onCambio, deshabilitado = false }: {
  tipo: TipoGasto;
  valor: DatosGasto;
  onCambio: (valor: DatosGasto) => void;
  deshabilitado?: boolean;
}) {
  const vistas = useMemo(() => valor.fotos.map((f) => URL.createObjectURL(f)), [valor.fotos]);
  useEffect(() => () => vistas.forEach((u) => URL.revokeObjectURL(u)), [vistas]);

  async function agregarFotos(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    const nuevas: File[] = [];
    for (const archivo of Array.from(lista)) {
      try {
        nuevas.push(await fotoEnMemoria(archivo));
      } catch {
        showToast('No se pudo leer esa foto. Tómala otra vez.', 'error');
      }
    }
    const todas = [...valor.fotos, ...nuevas];
    if (todas.length > FOTOS_MAXIMO) showToast(`Máximo ${FOTOS_MAXIMO} fotos de ticket.`, 'error');
    onCambio({ ...valor, fotos: todas.slice(0, FOTOS_MAXIMO) });
  }

  function quitarFoto(indice: number) {
    onCambio({ ...valor, fotos: valor.fotos.filter((_, i) => i !== indice) });
  }

  return (
    <div className="rounded-2xl border border-line bg-surface-2/50 p-3.5 flex flex-col gap-3">
      <p className="text-[12px] uppercase tracking-wider text-muted font-semibold flex items-center gap-1.5">
        <ReceiptText size={14} /> {tipo === 'combustible' ? 'Gasto de combustible' : 'Gasto de material'}
      </p>

      <label className="block">
        <span className="text-[13px] text-ink/75 block mb-1.5">¿Cuánto fue? (total con IVA)</span>
        <span className="relative block">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-[16px]">$</span>
          <CampoNumero
            value={valor.monto}
            onValor={(monto) => onCambio({ ...valor, monto })}
            disabled={deshabilitado}
            min={0}
            step="0.01"
            className="w-full pl-7 pr-3.5 min-h-[48px] rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[17px] font-semibold tabular-nums"
          />
        </span>
      </label>

      {!valor.sinTicket && (
        <div>
          <span className="text-[13px] text-ink/75 block mb-1.5">Foto del ticket</span>
          <div className="grid grid-cols-3 gap-2">
            {vistas.map((url, i) => (
              <div key={url} className="relative aspect-[3/4] rounded-xl overflow-hidden border border-line bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Ticket ${i + 1}`} className="w-full h-full object-cover" />
                <button type="button" onClick={() => quitarFoto(i)} disabled={deshabilitado} aria-label={`Quitar foto ${i + 1}`}
                  className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center">
                  <X size={15} strokeWidth={2.6} />
                </button>
              </div>
            ))}
            {valor.fotos.length < FOTOS_MAXIMO && (
              <label className={`aspect-[3/4] rounded-xl border-2 border-dashed border-teal/50 text-teal flex flex-col items-center justify-center gap-1 text-[12.5px] font-semibold cursor-pointer active:scale-95 transition-transform ${deshabilitado ? 'opacity-50 pointer-events-none' : ''}`}>
                <Camera size={22} strokeWidth={2.2} />
                {valor.fotos.length === 0 ? 'Tomar foto' : 'Otra foto'}
                <input type="file" accept="image/*" multiple className="sr-only"
                  onChange={(e) => { agregarFotos(e.target.files); e.target.value = ''; }} />
              </label>
            )}
          </div>
        </div>
      )}

      <label className="flex items-center gap-2.5 text-[14px] cursor-pointer">
        <input type="checkbox" checked={valor.sinTicket} disabled={deshabilitado}
          onChange={(e) => onCambio({ ...valor, sinTicket: e.target.checked })}
          className="w-5 h-5 accent-teal" />
        No me dieron ticket
      </label>
      {valor.sinTicket && (
        <label className="block">
          <span className="text-[13px] text-ink/75 block mb-1.5">¿Por qué no hay ticket? (obligatorio)</span>
          <textarea value={valor.motivoSinTicket} rows={2} maxLength={500} disabled={deshabilitado}
            onChange={(e) => onCambio({ ...valor, motivoSinTicket: e.target.value })}
            className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[15px]" />
        </label>
      )}
    </div>
  );
}
