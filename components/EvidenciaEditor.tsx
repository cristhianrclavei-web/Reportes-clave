'use client';

import { useEffect, useRef } from 'react';
import { X, Eye, EyeOff, SlidersHorizontal, Check } from 'lucide-react';
import { MarcaVideo } from '@/components/VisorVideo';
import { ETAPAS, EtapaFoto, MetaFoto, textoEtapa } from '@/lib/evidencias';

// Miniatura de una evidencia con sus acciones (incluir o no en el PDF, datos,
// quitar) y la hoja donde se le pone etapa y área. La usan el formulario del
// reporte y el detalle del reporte, para que se vean y se manejen igual.

const ETAPA_CLS: Record<EtapaFoto, string> = {
  antes: 'bg-black/75 text-white',
  durante: 'bg-amber text-white',
  despues: 'bg-teal text-inkOnAccent',
};

const BOTON = 'w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm active:scale-90 transition-transform';

// Etiqueta de etapa sobre la foto.
export function ChipEtapa({ etapa }: { etapa?: EtapaFoto | null }) {
  if (!etapa) return null;
  return <span className={`px-1.5 py-[1px] rounded-md text-[9.5px] font-bold uppercase tracking-wide ${ETAPA_CLS[etapa]}`}>{textoEtapa(etapa)}</span>;
}

// Botón del ojo: dentro del PDF del cliente o solo en la app.
export function BotonIncluir({ interna, onCambiar, className = '' }: { interna?: boolean; onCambiar: () => void; className?: string }) {
  const texto = interna ? 'No sale en el PDF del cliente. Tocar para incluirla' : 'Sale en el PDF del cliente. Tocar para dejarla solo en la app';
  return (
    <button
      type="button"
      onClick={onCambiar}
      aria-label={texto}
      title={texto}
      aria-pressed={!interna}
      className={`${BOTON} ${interna ? 'bg-amber text-white' : 'bg-black/45 text-white'} ${className}`}
    >
      {interna ? <EyeOff size={14} strokeWidth={2.4} /> : <Eye size={14} strokeWidth={2.4} />}
    </button>
  );
}

export function MiniaturaEvidencia({
  src, alt, video, dur, caption, meta, onCaption, onInterna, onDatos, onQuitar,
}: {
  src: string;
  alt: string;
  video?: boolean;
  dur?: number | null;
  caption: string;
  meta: MetaFoto;
  onCaption: (v: string) => void;
  onInterna: () => void;
  onDatos: () => void;
  onQuitar: () => void;
}) {
  return (
    <div className="min-w-0">
      <div className="relative rounded-xl overflow-hidden border border-line bg-surface-2">
        <button type="button" onClick={onDatos} aria-label="Etapa y área de la foto" className="block w-full">
          <img src={src} alt={alt} className={`w-full aspect-[4/3] object-cover transition-opacity ${meta.interna ? 'opacity-45' : ''}`} />
        </button>
        {video && <MarcaVideo dur={dur} chico />}
        <div className="absolute top-1 left-1 flex gap-1">
          <BotonIncluir interna={meta.interna} onCambiar={onInterna} />
        </div>
        <div className="absolute top-1 right-1 flex gap-1">
          <button type="button" onClick={onDatos} aria-label="Etapa y área de la foto" title="Etapa y área" className={`${BOTON} bg-black/45 text-white`}>
            <SlidersHorizontal size={13} strokeWidth={2.4} />
          </button>
          <button type="button" onClick={onQuitar} aria-label="Quitar del reporte" title="Quitar" className={`${BOTON} bg-black/45 text-white`}>
            <X size={15} strokeWidth={2.6} />
          </button>
        </div>
        {(meta.etapa || meta.area) && (
          <div className={`absolute bottom-1 left-1 ${video ? 'right-12' : 'right-1'} flex items-center gap-1 pointer-events-none`}>
            <ChipEtapa etapa={meta.etapa} />
            {meta.area && <span className="min-w-0 truncate px-1.5 py-[1px] rounded-md text-[9.5px] font-semibold bg-black/55 text-white">{meta.area}</span>}
          </div>
        )}
      </div>
      <input
        type="text"
        placeholder="Comentario"
        value={caption}
        onChange={(e) => onCaption(e.target.value)}
        className="w-full mt-1.5 px-2 py-1.5 text-[12px] rounded-lg bg-surface-2 border border-line focus:border-teal focus:outline-none"
      />
    </div>
  );
}

// Hoja inferior: etapa, área y si sale en el PDF. Los cambios se aplican al
// momento; «Listo» solo la cierra.
export function HojaEvidencia({
  src, caption, meta, areas, onCaption, onMeta, onCerrar,
}: {
  src: string;
  caption: string;
  meta: MetaFoto;
  // Áreas ya usadas en otras fotos, para elegirlas de un toque.
  areas: string[];
  onCaption?: (v: string) => void;
  onMeta: (cambio: Partial<MetaFoto>) => void;
  onCerrar: () => void;
}) {
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrarRef.current(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  const chip = (activo: boolean) =>
    `px-3.5 min-h-[38px] rounded-full border text-[13.5px] font-semibold transition-colors ${activo ? 'bg-teal border-teal text-inkOnAccent' : 'bg-surface-2 border-line text-ink/80'}`;
  const sugeridas = areas.filter((a) => a.toLowerCase() !== (meta.area || '').trim().toLowerCase()).slice(0, 6);

  return (
    <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center bg-black/55" onClick={onCerrar}>
      <div
        role="dialog"
        aria-label="Datos de la evidencia"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-surface border border-line rounded-t-3xl sm:rounded-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[92vh] overflow-y-auto"
      >
        <div className="flex gap-3 mb-4">
          <img src={src} alt="" className="w-24 h-24 rounded-xl object-cover border border-line shrink-0" />
          <div className="min-w-0 flex-1 flex flex-col">
            <p className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-1.5">Comentario</p>
            {onCaption ? (
              <textarea
                value={caption}
                onChange={(e) => onCaption(e.target.value)}
                rows={3}
                placeholder="Qué se ve en la foto"
                className="w-full flex-1 px-3 py-2 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14px] resize-none"
              />
            ) : (
              <p className="text-[14px] text-ink/80 leading-snug">{caption || 'Sin comentario'}</p>
            )}
          </div>
        </div>

        <p className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-1.5">Etapa</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {ETAPAS.map((e) => (
            <button key={e.clave} type="button" className={chip(meta.etapa === e.clave)} onClick={() => onMeta({ etapa: meta.etapa === e.clave ? null : e.clave })}>
              {e.texto}
            </button>
          ))}
        </div>

        <p className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-1.5">Área o sistema</p>
        <input
          type="text"
          value={meta.area || ''}
          maxLength={60}
          onChange={(e) => onMeta({ area: e.target.value })}
          placeholder="Ej. Cuarto de control"
          className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14px]"
        />
        {sugeridas.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {sugeridas.map((a) => (
              <button key={a} type="button" onClick={() => onMeta({ area: a })} className="px-2.5 min-h-[30px] rounded-full border border-line bg-surface-2 text-[12.5px] text-ink/80">
                {a}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => onMeta({ interna: !meta.interna })}
          aria-pressed={!meta.interna}
          className="w-full mt-4 px-3 min-h-[48px] rounded-xl border border-line bg-surface-2 flex items-center gap-3 text-left"
        >
          <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${meta.interna ? 'bg-amber/20 text-amber' : 'bg-teal/15 text-teal'}`}>
            {meta.interna ? <EyeOff size={16} strokeWidth={2.4} /> : <Eye size={16} strokeWidth={2.4} />}
          </span>
          <span className="text-[14px] font-semibold">{meta.interna ? 'Solo en la app' : 'Sale en el PDF del cliente'}</span>
        </button>

        <button type="button" onClick={onCerrar} className="w-full mt-3 min-h-[48px] rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform">
          <Check size={17} strokeWidth={2.6} /> Listo
        </button>
      </div>
    </div>
  );
}
