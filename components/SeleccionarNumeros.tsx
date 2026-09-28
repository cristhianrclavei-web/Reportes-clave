'use client';

import { useEffect } from 'react';

// Al tocar un campo numérico se selecciona su contenido: lo que se escribe
// reemplaza el valor en vez de quedar pegado al «0» o al número anterior.
// Un solo escucha para toda la app.
export default function SeleccionarNumeros() {
  useEffect(() => {
    function alEnfocar(e: FocusEvent) {
      const el = e.target;
      if (el instanceof HTMLInputElement && el.type === 'number' && !el.readOnly && !el.disabled) {
        // Después del toque: en el celular el cursor se coloca al soltar el
        // dedo y deshacía la selección.
        setTimeout(() => {
          if (document.activeElement !== el) return;
          try {
            el.select();
          } catch {
            // algunos navegadores no permiten seleccionar en type=number
          }
        }, 60);
      }
    }
    document.addEventListener('focusin', alEnfocar);
    return () => document.removeEventListener('focusin', alEnfocar);
  }, []);
  return null;
}
