'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, FileText, PackageCheck, PackageX, Search, ShieldCheck, X } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import type { FichaSyscom } from '@/lib/syscom';

function money(n: number | null): string {
  if (n === null) return '—';
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Botón de SYSCOM junto a la descripción del concepto: azul, con su nombre,
// para que se distinga de una lupa cualquiera.
export function BotonSyscom({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Buscar en el catálogo de SYSCOM"
      title="Buscar en el catálogo de SYSCOM"
      className="group relative shrink-0 w-[68px] min-h-[70px] rounded-xl overflow-hidden flex flex-col items-center justify-center gap-1 text-white shadow-[0_6px_18px_-6px_rgba(22,115,230,0.65)] active:scale-95 transition-transform bg-[linear-gradient(150deg,#1d7cf2_0%,#0b4fa8_100%)]"
    >
      {/* Brillo diagonal al pasar el cursor */}
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_30%,rgba(255,255,255,0.28)_50%,transparent_70%)] -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
      <Search size={18} strokeWidth={2.6} />
      <span className="font-display font-bold text-[11px] tracking-[0.08em] leading-none">SYSCOM</span>
    </button>
  );
}

// Ficha de un producto de SYSCOM dentro de la app: fotos, precio,
// existencia, características, descripción y documentos (ficha técnica,
// manuales). Así no hay que salir a syscom.mx para revisar el equipo.
export default function FichaProductoSyscom({
  id,
  onUsar,
  onClose,
}: {
  id: string;
  // Llena el concepto con este producto (descripción, costo y foto).
  onUsar?: (ficha: FichaSyscom) => void;
  onClose: () => void;
}) {
  const [ficha, setFicha] = useState<FichaSyscom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fotoActiva, setFotoActiva] = useState(0);

  useEffect(() => {
    let vigente = true;
    leerFichaSyscom(id)
      .then((f) => { if (vigente) setFicha(f); })
      .catch((e) => { if (vigente) setError(e?.message || 'No se pudo consultar SYSCOM.'); });
    return () => { vigente = false; };
  }, [id]);

  const fotos = ficha?.imagenes || [];
  const fotoGrande = fotos[fotoActiva] || fotos[0];

  return (
    <ModalOverlay onClose={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl max-h-[90vh] flex flex-col glass-strong rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
          <span className="px-2 py-1 rounded-md text-white font-display font-bold text-[10.5px] tracking-[0.08em] bg-[linear-gradient(150deg,#1d7cf2_0%,#0b4fa8_100%)]">SYSCOM</span>
          <p className="flex-1 font-display font-semibold text-[15px]">Ficha del producto</p>
          <button onClick={onClose} aria-label="Cerrar" className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform">
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && <p className="text-[13px] text-red text-center py-10">{error}</p>}
          {!error && !ficha && (
            <div className="flex flex-col gap-3">
              <div className="h-56 rounded-xl bg-surface-2 animate-pulse" />
              <div className="h-5 w-3/4 rounded bg-surface-2 animate-pulse" />
              <div className="h-4 w-1/2 rounded bg-surface-2 animate-pulse" />
            </div>
          )}
          {ficha && (
            <div className="flex flex-col gap-5">
              <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4">
                {/* Fotos */}
                <div>
                  <div className="aspect-square rounded-xl bg-white border border-line flex items-center justify-center overflow-hidden">
                    {fotoGrande ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fotoGrande} alt={ficha.titulo} className="w-full h-full object-contain p-3" />
                    ) : (
                      <PackageCheck size={36} strokeWidth={1.5} className="text-faint" />
                    )}
                  </div>
                  {fotos.length > 1 && (
                    <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
                      {fotos.slice(0, 8).map((f, i) => (
                        <button
                          key={f}
                          onClick={() => setFotoActiva(i)}
                          aria-label={`Foto ${i + 1}`}
                          className={`shrink-0 w-12 h-12 rounded-lg bg-white border-2 overflow-hidden ${i === fotoActiva ? 'border-teal' : 'border-transparent'}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={f} alt="" className="w-full h-full object-contain p-0.5" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Datos principales */}
                <div className="flex flex-col gap-2.5">
                  <p className="text-[11.5px] uppercase tracking-wider text-muted">{[ficha.marca, ficha.modelo].filter(Boolean).join(' · ')}</p>
                  <h3 className="font-display font-semibold text-[16px] leading-snug">{ficha.titulo}</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-bold text-[22px] text-teal tabular-nums">{money(ficha.precio)}</span>
                    <span className="text-[11.5px] text-muted">costo sin IVA</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[12px]">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-2 ${ficha.existencia && ficha.existencia > 0 ? 'text-teal' : 'text-muted'}`}>
                      {ficha.existencia && ficha.existencia > 0 ? <PackageCheck size={13} /> : <PackageX size={13} />}
                      {ficha.existencia !== null ? `${ficha.existencia} disponibles` : 'Existencia sin dato'}
                    </span>
                    {ficha.garantia && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-2 text-muted">
                        <ShieldCheck size={13} /> Garantía {ficha.garantia}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {onUsar && (
                      <button
                        onClick={() => onUsar(ficha)}
                        className="min-h-[40px] px-3.5 rounded-xl bg-teal text-inkOnAccent font-semibold text-[13.5px] active:scale-95 transition-transform"
                      >
                        Usar en el concepto
                      </button>
                    )}
                    {ficha.link && (
                      <a
                        href={ficha.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[40px] px-3.5 rounded-xl border border-line-strong font-semibold text-[13.5px] inline-flex items-center gap-1.5"
                      >
                        <ExternalLink size={14} /> Abrir en syscom.mx
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {ficha.caracteristicas.length > 0 && (
                <section>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Características</h4>
                  <ul className="flex flex-col gap-1.5">
                    {ficha.caracteristicas.map((c, i) => (
                      <li key={i} className="flex gap-2 text-[13.5px] leading-snug">
                        <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-teal shrink-0" />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {ficha.recursos.length > 0 && (
                <section>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Documentos</h4>
                  <div className="flex flex-col gap-1.5">
                    {ficha.recursos.map((r) => (
                      <a
                        key={r.url}
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-2 border border-line text-[13.5px] active:scale-[0.99] transition-transform"
                      >
                        <FileText size={15} className="text-teal shrink-0" />
                        <span className="flex-1 min-w-0 truncate">{r.nombre}</span>
                        <ExternalLink size={13} className="text-faint shrink-0" />
                      </a>
                    ))}
                  </div>
                </section>
              )}

              {ficha.descripcion && (
                <section>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Descripción</h4>
                  <p className="text-[13.5px] leading-relaxed whitespace-pre-line text-ink">{ficha.descripcion}</p>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}

// Pide la ficha a la app (que a su vez consulta SYSCOM). Lanza un error con
// un mensaje para el usuario si algo falla.
export async function leerFichaSyscom(id: string): Promise<FichaSyscom> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`/api/syscom/productos/${encodeURIComponent(id)}`);
  } catch {
    throw new Error('No hay conexión con el servidor. Revisa tu señal e intenta de nuevo.');
  }
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok || !datos?.ficha) {
    throw new Error(datos?.error || 'No se pudo consultar SYSCOM.');
  }
  return datos.ficha as FichaSyscom;
}
