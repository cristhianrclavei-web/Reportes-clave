'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, X } from 'lucide-react';

// Menú desplegable de varias opciones con autollenado: al escribir se filtra
// la lista; lo elegido queda como etiquetas que se pueden quitar; y si lo
// escrito no está en la lista se puede agregar como «otra». Reemplaza a las
// filas de botones cuando las opciones son muchas (especialidades, sistemas).

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export default function SelectorOpciones({
  opciones, valor, onCambiar, placeholder = 'Escribe para buscar…', permitirOtra = true, maxLargo = 40, etiquetaOtra = 'otra',
}: {
  opciones: readonly string[];
  valor: string[];
  onCambiar: (v: string[]) => void;
  placeholder?: string;
  // Permite agregar una opción que no está en la lista.
  permitirOtra?: boolean;
  maxLargo?: number;
  // Cómo se nombra lo que no está en la lista: «Agregar otra: …».
  etiquetaOtra?: string;
}) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent | TouchEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) { setAbierto(false); setTexto(''); }
    };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('touchstart', fuera);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('touchstart', fuera); };
  }, [abierto]);

  const q = norm(texto);
  const elegidas = useMemo(() => new Set(valor.map(norm)), [valor]);
  const filtradas = useMemo(() => opciones.filter((o) => !q || norm(o).includes(q)), [opciones, q]);
  const yaExiste = !!q && (opciones.some((o) => norm(o) === q) || elegidas.has(q));
  const ofrecerOtra = permitirOtra && !!q && !yaExiste;
  const total = filtradas.length + (ofrecerOtra ? 1 : 0);

  function alternar(o: string) {
    onCambiar(elegidas.has(norm(o)) ? valor.filter((x) => norm(x) !== norm(o)) : [...valor, o]);
    setTexto('');
    setActiva(0);
    input.current?.focus();
  }
  function agregarOtra() {
    const limpio = texto.trim().slice(0, maxLargo);
    if (limpio) onCambiar([...valor, limpio]);
    setTexto('');
    setActiva(0);
    input.current?.focus();
  }
  function elegirActiva() {
    if (activa < filtradas.length) alternar(filtradas[activa]);
    else if (ofrecerOtra) agregarOtra();
  }

  return (
    <div ref={caja} className="relative">
      <div
        onClick={() => { setAbierto(true); input.current?.focus(); }}
        className={`min-h-[48px] w-full rounded-xl bg-surface-2 border px-2 py-1.5 flex flex-wrap items-center gap-1.5 cursor-text transition-colors ${abierto ? 'border-teal' : 'border-line'}`}
      >
        {valor.map((v) => (
          <span key={v} className="pl-2.5 pr-1 py-1 rounded-full bg-teal/15 text-teal text-[13px] font-semibold flex items-center gap-0.5 max-w-full">
            <span className="truncate">{v}</span>
            <button type="button" aria-label={`Quitar ${v}`} onClick={(e) => { e.stopPropagation(); onCambiar(valor.filter((x) => x !== v)); }}
              className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-teal/20 shrink-0">
              <X size={13} strokeWidth={2.6} />
            </button>
          </span>
        ))}
        <input
          ref={input}
          value={texto}
          maxLength={maxLargo}
          onChange={(e) => { setTexto(e.target.value); setAbierto(true); setActiva(0); }}
          onFocus={() => setAbierto(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setAbierto(true); setActiva((a) => Math.min(a + 1, Math.max(total - 1, 0))); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActiva((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); if (abierto && total > 0) elegirActiva(); }
            else if (e.key === 'Escape') { setAbierto(false); setTexto(''); }
            else if (e.key === 'Backspace' && !texto && valor.length > 0) onCambiar(valor.slice(0, -1));
          }}
          placeholder={valor.length === 0 ? placeholder : ''}
          role="combobox"
          aria-expanded={abierto}
          aria-autocomplete="list"
          className="flex-1 min-w-[120px] h-8 px-1.5 bg-transparent text-[15px] placeholder:text-faint focus:outline-none"
        />
        <ChevronDown size={17} className={`text-muted shrink-0 mr-1 transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`} />
      </div>

      {abierto && (
        <ul role="listbox" className="absolute left-0 right-0 top-full mt-1.5 z-30 max-h-60 overflow-y-auto rounded-xl bg-surface border border-line shadow-diffuse p-1.5">
          {filtradas.map((o, i) => {
            const sel = elegidas.has(norm(o));
            return (
              <li key={o}>
                <button type="button" role="option" aria-selected={sel} onMouseEnter={() => setActiva(i)} onClick={() => alternar(o)}
                  className={`w-full flex items-center gap-2.5 px-2.5 min-h-[40px] rounded-lg text-left text-[14px] ${i === activa ? 'bg-surface-2' : ''}`}>
                  <span className={`w-[18px] h-[18px] rounded-md border flex items-center justify-center shrink-0 ${sel ? 'bg-teal border-teal text-inkOnAccent' : 'border-line-strong'}`}>
                    {sel && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className="truncate">{o}</span>
                </button>
              </li>
            );
          })}
          {ofrecerOtra && (
            <li>
              <button type="button" role="option" aria-selected={false} onMouseEnter={() => setActiva(filtradas.length)} onClick={agregarOtra}
                className={`w-full flex items-center gap-2.5 px-2.5 min-h-[40px] rounded-lg text-left text-[14px] text-teal font-semibold ${activa === filtradas.length ? 'bg-surface-2' : ''}`}>
                <Plus size={16} strokeWidth={2.6} className="shrink-0" />
                <span className="truncate">Agregar {etiquetaOtra}: «{texto.trim()}»</span>
              </button>
            </li>
          )}
          {total === 0 && <li className="px-2.5 py-2.5 text-[13px] text-muted">Sin coincidencias.</li>}
          {permitirOtra && !q && (
            <li className="px-2.5 pt-2 pb-1.5 mt-1 border-t border-line text-[12px] text-faint">
              ¿No está en la lista? Escríbela y elige «Agregar {etiquetaOtra}».
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
