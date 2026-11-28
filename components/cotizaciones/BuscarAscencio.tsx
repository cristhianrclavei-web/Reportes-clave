'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Search, X, Zap } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import type { ProductoAscencio } from '@/lib/ascencio';

// Buscar material eléctrico en el catálogo de Grupo Ascencio y llenar el
// concepto (descripción, modelo, marca, foto y ficha técnica). El precio no
// viene: se captura a mano.

// compacto: botón bajo en fila (partida abierta); el grande es cuadrado.
export function BotonAscencio({ onClick, compacto = false }: { onClick: () => void; compacto?: boolean }) {
  if (compacto) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Buscar en el catálogo de Grupo Ascencio"
        title="Buscar en el catálogo de Grupo Ascencio (material eléctrico)"
        className="min-h-[38px] px-3 rounded-lg flex items-center gap-1.5 bg-amber text-white font-display font-bold text-[11.5px] tracking-[0.06em] active:scale-95 transition-transform"
      >
        <Zap size={15} strokeWidth={2.6} />
        ASCENCIO
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Buscar en el catálogo de Grupo Ascencio"
      title="Buscar en el catálogo de Grupo Ascencio (material eléctrico)"
      className="shrink-0 w-[68px] min-h-[70px] rounded-xl flex flex-col items-center justify-center gap-1 bg-amber text-white shadow-[0_6px_18px_-6px_rgba(217,119,6,0.6)] active:scale-95 transition-transform"
    >
      <Zap size={18} strokeWidth={2.6} />
      <span className="font-display font-bold text-[10.5px] tracking-[0.06em] leading-none">ASCENCIO</span>
    </button>
  );
}

type Estado = 'inactivo' | 'buscando' | 'listo' | 'error';

export default function BuscarAscencio({ busquedaInicial = '', onSeleccionar, onClose }: {
  busquedaInicial?: string;
  onSeleccionar: (producto: ProductoAscencio) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState(busquedaInicial);
  const [productos, setProductos] = useState<ProductoAscencio[]>([]);
  const [estado, setEstado] = useState<Estado>('inactivo');
  const [error, setError] = useState<string | null>(null);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function buscar(texto: string) {
    setEstado('buscando');
    setError(null);
    try {
      const respuesta = await fetch(`/api/ascencio/productos?q=${encodeURIComponent(texto.trim())}`);
      const datos = await respuesta.json();
      if (!respuesta.ok) {
        setEstado('error');
        setError(datos?.error || 'No se pudo buscar.');
        return;
      }
      setProductos(datos.productos || []);
      setEstado('listo');
    } catch {
      setEstado('error');
      setError('No hay conexión. Revisa tu señal e intenta de nuevo.');
    }
  }

  function escribir(texto: string) {
    setQ(texto);
    if (espera.current) clearTimeout(espera.current);
    if (texto.trim().length < 3) {
      setProductos([]);
      setEstado('inactivo');
      return;
    }
    espera.current = setTimeout(() => buscar(texto), 600);
  }

  useEffect(() => {
    if (busquedaInicial.trim().length >= 3) buscar(busquedaInicial);
    return () => { if (espera.current) clearTimeout(espera.current); };
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ModalOverlay onClose={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg max-h-[85vh] flex flex-col glass-strong rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-line">
          <div className="min-w-0">
            <p className="font-display font-semibold text-[15px]">Buscar en Grupo Ascencio</p>
            <p className="text-[12px] text-muted">Llena descripción, modelo, marca, foto y ficha. El precio va a mano.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center active:scale-90 transition-transform">
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>
        <div className="p-4 pb-2">
          <form className="relative" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 3) buscar(q); }}>
            <Search size={16} strokeWidth={2.4} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
            <input autoFocus value={q} onChange={(e) => escribir(e.target.value)} placeholder="Contactor, interruptor, THQB2180…" enterKeyHint="search"
              className="w-full pl-10 pr-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]" />
          </form>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {estado === 'inactivo' && <p className="text-[13px] text-muted text-center py-8">Escribe al menos 3 letras: nombre, modelo o marca.</p>}
          {estado === 'error' && <p role="alert" className="text-[13px] text-red text-center py-8">{error}</p>}
          {estado === 'buscando' && (
            <div className="flex flex-col gap-2 pt-2" aria-busy="true">
              {[0, 1, 2].map((i) => <div key={i} className="h-[64px] rounded-xl bg-surface-2 animate-pulse" />)}
            </div>
          )}
          {estado === 'listo' && productos.length === 0 && <p className="text-[13px] text-muted text-center py-8">No encontramos nada con «{q.trim()}». Prueba con otra palabra o el modelo.</p>}
          {estado === 'listo' && productos.length > 0 && (
            <ul className="flex flex-col gap-2 pt-1">
              {productos.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onSeleccionar(p)}
                    className="w-full text-left rounded-xl border border-line bg-surface hover:border-teal/60 p-2.5 flex items-center gap-3 active:scale-[0.99] transition-transform">
                    {p.imagen
                      ? <img src={p.imagen} alt="" className="w-14 h-14 rounded-lg object-contain bg-white shrink-0" />
                      : <span className="w-14 h-14 rounded-lg bg-surface-2 shrink-0" />}
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13.5px] font-semibold leading-snug line-clamp-2">{p.titulo}</span>
                      <span className="block text-[12px] text-muted mt-0.5 truncate">
                        {[p.marca, p.modelo].filter(Boolean).join(' · ') || 'Sin marca ni modelo'}
                        {p.ficha && <span className="inline-flex items-center gap-0.5 ml-2 text-teal"><FileText size={11} /> Ficha</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
