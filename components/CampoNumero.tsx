'use client';

import { InputHTMLAttributes, useEffect, useState } from 'react';

// Campo numérico que guarda un número (no texto). Mientras se escribe
// conserva el texto tal cual: si se borra queda vacío en lugar de volver a
// «0» (antes, al escribir después, quedaba «05»). Vacío cuenta como 0.
export default function CampoNumero({
  value,
  onValor,
  ...rest
}: {
  value: number;
  onValor: (n: number) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [texto, setTexto] = useState(value ? String(value) : '');

  // Si el valor cambia desde fuera (p. ej. al copiar conceptos de una
  // cotización), se muestra; si es el mismo número que ya se escribió, se
  // respeta el texto («1.» mientras se teclea «1.5»).
  useEffect(() => {
    setTexto((t) => ((Number(t) || 0) === value ? t : value ? String(value) : ''));
  }, [value]);

  return (
    <input
      {...rest}
      type="number"
      inputMode={rest.inputMode || 'decimal'}
      placeholder={rest.placeholder ?? '0'}
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value);
        onValor(Number(e.target.value) || 0);
      }}
    />
  );
}
