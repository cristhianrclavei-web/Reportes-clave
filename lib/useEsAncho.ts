'use client';

import { useEffect, useState } from 'react';

// Pantalla ancha (computadora, 1024 px o más). Empieza en false y se lee
// después de montar, para no leer la ventana durante el render del servidor.
export function useEsAncho(): boolean {
  const [ancho, setAncho] = useState(false);
  useEffect(() => {
    const consulta = window.matchMedia('(min-width: 1024px)');
    const revisar = () => setAncho(consulta.matches);
    revisar();
    consulta.addEventListener('change', revisar);
    return () => consulta.removeEventListener('change', revisar);
  }, []);
  return ancho;
}
