'use client';
import { useCallback, useState } from 'react';

// Avance de un guardado para la pantalla de «guardando»
// (components/SavingOverlay.tsx): porcentaje de 0 a 100 y la etapa en curso.
// Las funciones de lib/ que guardan en varios pasos lo reciben como
// `onAvance` opcional y van avisando.
export type Avance = (pct: number, etapa: string) => void;

export function useAvanceGuardado() {
  const [progreso, setProgreso] = useState({ pct: 0, etapa: '' });
  const avance = useCallback<Avance>((pct, etapa) => setProgreso({ pct, etapa }), []);
  return { progreso, avance };
}

// Deja ver el 100 % un instante antes de cerrar la pantalla de guardado.
export function pausaFinal(): Promise<void> {
  return new Promise((r) => setTimeout(r, 700));
}
