'use client';

// Unidad de una partida: menú con las unidades de siempre y «Otra…» para
// escribir una distinta. Antes era un datalist, que solo ofrece las opciones
// que coinciden con lo ya escrito: con «Servicio» en el campo no mostraba
// nada y parecía que no había lista.

import { useState } from 'react';

const ESCRIBIR_OTRA = '__otra__';

type Props = {
  value: string;
  opciones: string[];
  onChange: (unidad: string) => void;
  className: string;
};

export default function SelectorUnidad({ value, opciones, onChange, className }: Props) {
  const [escribiendo, setEscribiendo] = useState(false);

  if (escribiendo) {
    // Al salir del campo vuelve al menú; la unidad escrita queda como opción.
    return (
      <input
        autoFocus
        className={className}
        value={value}
        maxLength={20}
        placeholder="Escribe la unidad"
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEscribiendo(false)}
        onKeyDown={(e) => { if (e.key === 'Enter') setEscribiendo(false); }}
      />
    );
  }

  // Una unidad escrita a mano (p. ej. «Servicio») se muestra como opción más.
  const actual = value.trim();
  const conLaActual = actual && !opciones.includes(actual) ? [actual, ...opciones] : opciones;

  return (
    <select
      className={className}
      value={actual}
      onChange={(e) => {
        if (e.target.value === ESCRIBIR_OTRA) setEscribiendo(true);
        else onChange(e.target.value);
      }}
    >
      {!actual && <option value="" disabled>Elige…</option>}
      {conLaActual.map((u) => <option key={u} value={u}>{u}</option>)}
      <option value={ESCRIBIR_OTRA}>Otra…</option>
    </select>
  );
}
