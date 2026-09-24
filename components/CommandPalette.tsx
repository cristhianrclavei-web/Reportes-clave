'use client';

import { useEffect, useRef, useState, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import ModalOverlay from './ModalOverlay';
import { TABS, TAB_ALMACEN } from './DashboardTabs';
import { navegarConTransicion } from '@/lib/nativeViewTransition';
import { Search } from 'lucide-react';

// Buscador rápido (Cmd/Ctrl+K) para saltar entre secciones sin tocar el
// mouse. Por ahora solo indexa las secciones del panel — no clientes ni
// cotizaciones individuales, eso requeriría traer datos y es un paso
// aparte si se quiere ampliar después.
export default function CommandPalette({ puedeAlmacen }: { puedeAlmacen?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const items = puedeAlmacen ? [...TABS, TAB_ALMACEN] : TABS;
  const filtrados = items.filter((it) => it.label.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    function alPulsar(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  function ir(href: string) {
    setOpen(false);
    navegarConTransicion(() => router.push(href));
  }

  function alTeclear(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtrados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const elegido = filtrados[activeIndex];
      if (elegido) ir(elegido.href);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar (Cmd+K)"
        title="Buscar (Cmd+K)"
        className="w-9 h-9 rounded-full border border-line-strong flex items-center justify-center shrink-0 active:scale-90 transition-transform bg-surface-2 hover:bg-white/10"
      >
        <Search size={15} strokeWidth={2.2} />
      </button>

      {open && (
        <ModalOverlay onClose={() => setOpen(false)}>
          <div className="glass-strong rounded-3xl w-full max-w-md overflow-hidden shadow-diffuse">
            <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-line">
              <Search size={17} strokeWidth={2.2} className="text-faint shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
                onKeyDown={alTeclear}
                placeholder="Ir a una sección..."
                className="flex-1 min-w-0 bg-transparent outline-none text-[15px] placeholder:text-faint"
              />
              <kbd className="hidden sm:block text-[10px] text-faint border border-line-strong rounded px-1.5 py-0.5 shrink-0">Esc</kbd>
            </div>
            <div className="max-h-[320px] overflow-y-auto p-2">
              {filtrados.length === 0 && (
                <p className="text-center text-muted text-[13px] py-6">Sin resultados</p>
              )}
              {filtrados.map((it, i) => (
                <button
                  key={it.key}
                  onClick={() => ir(it.href)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium text-left transition-colors ${
                    i === activeIndex ? 'bg-teal/15 text-teal' : 'text-ink/85'
                  }`}
                >
                  <it.Icono size={17} strokeWidth={2.2} className="shrink-0" />
                  {it.label}
                </button>
              ))}
            </div>
          </div>
        </ModalOverlay>
      )}
    </>
  );
}
