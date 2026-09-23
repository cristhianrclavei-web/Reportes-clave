'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, PackageCheck, PackageX, X } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import type { ProductoSyscom } from '@/lib/syscom';

function money(n: number | null): string {
  if (n === null) return '—';
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Estado = 'inactivo' | 'buscando' | 'listo' | 'sin-configurar' | 'error';

export default function SelectorProductoSyscom({
  onSeleccionar,
  onClose,
}: {
  onSeleccionar: (producto: ProductoSyscom) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [productos, setProductos] = useState<ProductoSyscom[]>([]);
  const [estado, setEstado] = useState<Estado>('inactivo');
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(texto: string) {
    setQ(texto);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (texto.trim().length < 3) {
      setProductos([]);
      setEstado('inactivo');
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setEstado('buscando');
      setError(null);
      try {
        const respuesta = await fetch(`/api/syscom/productos?q=${encodeURIComponent(texto)}`);
        const datos = await respuesta.json();
        if (!respuesta.ok) {
          setEstado('error');
          setError(datos?.error || 'No se pudo buscar.');
          return;
        }
        if (datos.configurado === false) {
          setEstado('sin-configurar');
          return;
        }
        setProductos(datos.productos || []);
        setEstado('listo');
      } catch {
        setEstado('error');
        setError('No hay conexión con el servidor.');
      }
    }, 450);
  }

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  return (
    <ModalOverlay onClose={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[85vh] flex flex-col glass-strong rounded-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-line">
          <p className="font-display font-semibold text-[15px]">Buscar en SYSCOM</p>
          <button onClick={onClose} aria-label="Cerrar" className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform">
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <div className="p-4 pb-2">
          <div className="relative">
            <Search size={16} strokeWidth={2.4} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              autoFocus
              value={q}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="Nombre, modelo o marca…"
              className="w-full pl-10 pr-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {estado === 'inactivo' && (
            <p className="text-[13px] text-muted text-center py-8">Escribe al menos 3 letras para buscar.</p>
          )}
          {estado === 'sin-configurar' && (
            <p className="text-[13px] text-amber text-center py-8 leading-relaxed">
              La integración con SYSCOM todavía no tiene credenciales configuradas.<br />
              En cuanto estén listas, el buscador funciona solo — no hace falta tocar esta pantalla.
            </p>
          )}
          {estado === 'error' && (
            <p className="text-[13px] text-red text-center py-8">{error}</p>
          )}
          {estado === 'buscando' && (
            <div className="flex flex-col gap-2 pt-2">
              {[0, 1, 2].map((i) => <div key={i} className="h-[64px] rounded-xl bg-surface-2 animate-pulse" />)}
            </div>
          )}
          {estado === 'listo' && productos.length === 0 && (
            <p className="text-[13px] text-muted text-center py-8">Sin resultados para «{q}».</p>
          )}
          {estado === 'listo' && productos.length > 0 && (
            <div className="flex flex-col gap-2 pt-1">
              {productos.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSeleccionar(p)}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-2 border border-line text-left active:scale-[0.98] transition-transform"
                >
                  <div className="w-12 h-12 rounded-lg bg-surface shrink-0 overflow-hidden flex items-center justify-center border border-line">
                    {p.imagen ? (
                      // Imágenes del catálogo de SYSCOM — dominio externo, no vale la pena
                      // pasarlas por next/image para un thumbnail de 48px.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imagen} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <PackageCheck size={18} strokeWidth={1.8} className="text-faint" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-medium leading-snug line-clamp-2">{p.titulo}</p>
                    <p className="text-[11.5px] text-muted">
                      {[p.marca, p.modelo].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13.5px] font-display font-bold text-teal">{money(p.precio)}</p>
                    <p className={`text-[11px] flex items-center gap-1 justify-end ${p.existencia && p.existencia > 0 ? 'text-teal' : 'text-faint'}`}>
                      {p.existencia && p.existencia > 0 ? <PackageCheck size={11} strokeWidth={2.4} /> : <PackageX size={11} strokeWidth={2.4} />}
                      {p.existencia !== null ? `${p.existencia} disp.` : 'sin dato'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
