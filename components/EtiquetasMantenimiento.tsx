'use client';

import { useEffect, useState } from 'react';
import { X, Share2, Download, Tag } from 'lucide-react';
import ModalOverlay from './ModalOverlay';
import { FormatoLlenado } from '@/lib/formatosMantenimiento';
import { DatosEtiqueta, generarEtiqueta, sistemaCorto } from '@/lib/etiquetaMantenimiento';

type Generada = { titulo: string; url: string; archivo: File };

// Etiquetas de mantenimiento (una por formato) listas para mandar a la app
// de la impresora portátil: «Compartir» abre el menú del teléfono y ahí se
// elige Brother iPrint&Label (o la que use la impresora).
export default function EtiquetasMantenimiento({
  formatos,
  token,
  cliente,
  fecha,
  tecnico,
  folio,
  onClose,
}: {
  formatos: FormatoLlenado[];
  token: string;
  cliente: string;
  fecha: string;
  tecnico: string;
  folio?: string;
  onClose: () => void;
}) {
  const [etiquetas, setEtiquetas] = useState<Generada[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [puedeCompartir, setPuedeCompartir] = useState(false);

  useEffect(() => {
    let vivo = true;
    const urls: string[] = [];
    (async () => {
      try {
        const lista: Generada[] = [];
        for (const f of formatos) {
          const datos: DatosEtiqueta = { formato: f, token, cliente, fecha, tecnico, folio };
          const blob = await generarEtiqueta(datos);
          const nombre = `etiqueta-${f.plantillaId}-${fecha}.png`;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          lista.push({ titulo: sistemaCorto(f), url, archivo: new File([blob], nombre, { type: 'image/png' }) });
        }
        if (!vivo) return;
        setEtiquetas(lista);
        setPuedeCompartir(
          typeof navigator !== 'undefined' &&
            typeof navigator.canShare === 'function' &&
            lista.length > 0 &&
            navigator.canShare({ files: [lista[0].archivo] })
        );
      } catch (e: any) {
        if (vivo) setError(e?.message || 'No se pudo generar la etiqueta');
      }
    })();
    return () => {
      vivo = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [formatos, token, cliente, fecha, tecnico, folio]);

  async function compartir(e: Generada) {
    try {
      await navigator.share({ files: [e.archivo], title: `Etiqueta · ${e.titulo}` });
    } catch {
      // cancelado por el usuario: no pasa nada
    }
  }

  function descargar(e: Generada) {
    const a = document.createElement('a');
    a.href = e.url;
    a.download = e.archivo.name;
    a.click();
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="glass-strong rounded-3xl max-w-lg w-full p-5 shadow-glow max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl bg-teal/12 text-teal flex items-center justify-center shrink-0">
              <Tag size={19} strokeWidth={2.2} />
            </span>
            <div>
              <h2 className="font-display font-semibold text-[17px] leading-tight">Etiquetas de mantenimiento</h2>
              <p className="text-[12px] text-muted">Una por sistema · cinta de 24 mm</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-2">
            <X size={19} />
          </button>
        </div>

        {error && <p className="text-[13px] text-red">{error}</p>}
        {!etiquetas && !error && <p className="text-[13px] text-muted py-6 text-center">Generando…</p>}

        <div className="flex flex-col gap-4">
          {etiquetas?.map((e) => (
            <div key={e.archivo.name}>
              <p className="text-[12px] font-semibold uppercase tracking-wider text-muted mb-1.5">{e.titulo}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={e.url} alt={`Etiqueta ${e.titulo}`} className="w-full rounded-lg border border-line bg-white" />
              <div className="grid grid-cols-2 gap-2 mt-2">
                {puedeCompartir ? (
                  <button
                    type="button"
                    onClick={() => compartir(e)}
                    className="min-h-[44px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[14px] flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                  >
                    <Share2 size={16} strokeWidth={2.4} /> Imprimir / compartir
                  </button>
                ) : (
                  <span className="text-[12px] text-muted self-center">Descárgala y ábrela en la app de la impresora.</span>
                )}
                <button
                  type="button"
                  onClick={() => descargar(e)}
                  className="min-h-[44px] rounded-xl border border-line-strong font-semibold text-[14px] flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                >
                  <Download size={16} strokeWidth={2.4} /> Descargar
                </button>
              </div>
            </div>
          ))}
        </div>

        {etiquetas && etiquetas.length > 0 && (
          <p className="text-[12px] text-muted mt-4 leading-relaxed">
            En «Imprimir / compartir» elige <b>Brother iPrint&amp;Label</b> (o la app de tu impresora) e imprime como imagen en cinta de
            24 mm. El QR lleva a la página de verificación; funciona en cuanto el reporte se guarda y sube.
          </p>
        )}
      </div>
    </ModalOverlay>
  );
}
