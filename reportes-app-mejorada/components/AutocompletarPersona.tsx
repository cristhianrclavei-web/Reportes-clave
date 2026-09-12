'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';

// Campo de nombre con sugerencias mientras se escribe.
//
// Se hizo a mano en vez de usar <datalist> porque hacían falta dos cosas que
// el nativo no da:
//
// 1. Ignorar acentos. Nadie escribe «Sánchez» con acento en el teclado del
//    celular, y sin esto «sanchez» no encontraría nada.
// 2. Buscar por cualquier palabra del nombre. «eve» está a media cadena en
//    «Ing. Everardo Sánchez Díaz»; buscando solo por el inicio no aparecería.
//
// Sigue aceptando texto libre a propósito: en un servicio puede entrar alguien
// de fuera, y el reporte no se puede quedar sin poder nombrarlo.

// «Ing. Everardo Sánchez Díaz» -> «ing. everardo sanchez diaz»
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Coincide si alguna palabra del nombre empieza con lo escrito. Se prefiere
// esto a «contiene» para que «ana» no traiga a «Juana» ni a «Santana».
function coincide(nombre: string, consulta: string): boolean {
  const q = normalizar(consulta);
  if (!q) return false;
  const n = normalizar(nombre);
  if (n.startsWith(q)) return true;
  return n.split(/[\s.]+/).some((palabra) => palabra.startsWith(q));
}

export type GrupoSugerencias = { etiqueta: string; nombres: string[] };

export default function AutocompletarPersona({
  value,
  onChange,
  grupos,
  placeholder,
  className = '',
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  grupos: GrupoSugerencias[];
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);

  // Se aplanan los grupos conservando su etiqueta, para poder recorrer la
  // lista con las flechas sin perder de vista a qué grupo pertenece cada uno.
  const sugerencias = useMemo(() => {
    const q = value.trim();
    const fuera: { nombre: string; etiqueta: string; primeroDelGrupo: boolean }[] = [];

    grupos.forEach((g) => {
      const filtrados = q
        ? g.nombres.filter((n) => coincide(n, q) && normalizar(n) !== normalizar(q))
        : g.nombres;
      filtrados.slice(0, 8).forEach((nombre, i) => {
        fuera.push({ nombre, etiqueta: g.etiqueta, primeroDelGrupo: i === 0 });
      });
    });

    return fuera.slice(0, 12);
  }, [value, grupos]);

  useEffect(() => setResaltado(0), [value]);

  // Cerrar al tocar fuera.
  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent | TouchEvent) {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener('mousedown', fuera);
    document.addEventListener('touchstart', fuera);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('touchstart', fuera);
    };
  }, [abierto]);

  function elegir(nombre: string) {
    onChange(nombre);
    setAbierto(false);
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!abierto || sugerencias.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setResaltado((i) => (i + 1) % sugerencias.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setResaltado((i) => (i - 1 + sugerencias.length) % sugerencias.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      elegir(sugerencias[resaltado].nombre);
    } else if (e.key === 'Escape') {
      setAbierto(false);
    }
  }

  const exacto = grupos.some((g) =>
    g.nombres.some((n) => normalizar(n) === normalizar(value)),
  );

  return (
    <div ref={contenedor} className="relative">
      <input
        id={id}
        type="text"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        onKeyDown={alTeclear}
        className={className}
      />

      {/* Palomita cuando el nombre es uno del equipo. Escribirlo a mano es
          válido, pero conviene ver de un vistazo cuál quedó reconocido. */}
      {exacto && value.trim() !== '' && (
        <Check
          size={17}
          strokeWidth={2.8}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-teal pointer-events-none"
        />
      )}

      {abierto && sugerencias.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-xl bg-surface border border-line shadow-glow overflow-hidden max-h-64 overflow-y-auto">
          {sugerencias.map((s, i) => (
            <div key={`${s.etiqueta}-${s.nombre}`}>
              {s.primeroDelGrupo && s.etiqueta && (
                <p className="px-3 pt-2.5 pb-1 text-[10.5px] uppercase tracking-wider text-faint">
                  {s.etiqueta}
                </p>
              )}
              <button
                type="button"
                // onMouseDown y no onClick: el blur del campo dispara antes que
                // el click y cerraría la lista sin llegar a elegir nada.
                onMouseDown={(e) => { e.preventDefault(); elegir(s.nombre); }}
                onMouseEnter={() => setResaltado(i)}
                className={`w-full text-left px-3 min-h-[46px] flex items-center text-[15px] transition-colors ${
                  i === resaltado ? 'bg-surface-2 text-ink' : 'text-ink/85'
                }`}
              >
                {s.nombre}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
