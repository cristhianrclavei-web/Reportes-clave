'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

// Une la subpestaña de una sección (Hoy, Agendados, Vales…) con «?sub=» de
// la dirección, en los dos sentidos:
//   · si la dirección cambia (un enlace de la barra lateral o de un aviso),
//     se abre esa subpestaña;
//   · si el usuario cambia de subpestaña dentro de la sección, la dirección
//     se actualiza sin recargar, para que la barra lateral marque la correcta.
// Lo que no esté en `validas` se ignora.
export function useSubseccionUrl<T extends string>(
  actual: T,
  cambiar: (valor: T) => void,
  validas: readonly T[],
) {
  const sub = useSearchParams().get('sub');
  // Último valor de la pestaña que se vio: sirve para saber si lo que cambió
  // fue la pestaña (se escribe en la dirección) o la dirección (se abre la
  // pestaña). Así funciona aunque React corra el efecto dos veces.
  const actualAnterior = useRef<T | undefined>(undefined);

  useEffect(() => {
    const cambioLaPestana = actualAnterior.current !== undefined && actualAnterior.current !== actual;
    actualAnterior.current = actual;
    if (sub === actual) return;

    const subValida = sub !== null && (validas as readonly string[]).includes(sub);
    if (!cambioLaPestana && subValida) {
      cambiar(sub as T);
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('sub', actual);
    window.history.replaceState(null, '', url);
    // `validas` y `cambiar` cambian en cada render; basta con sub y actual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, actual]);
}
