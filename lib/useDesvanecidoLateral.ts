'use client';

import { CSSProperties, RefObject, useEffect, useState } from 'react';

// Para filas que se deslizan de lado (pestañas en el celular): cuando hay
// más contenido fuera de la vista, el borde de ese lado se desvanece. Así
// una pestaña a medias se lee como «hay más, desliza» y no como un corte.
export function useDesvanecidoLateral(ref: RefObject<HTMLElement | null>): CSSProperties {
  const [bordes, setBordes] = useState({ izq: false, der: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => {
      const izq = el.scrollLeft > 4;
      const der = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setBordes((b) => (b.izq === izq && b.der === der ? b : { izq, der }));
    };
    medir();
    el.addEventListener('scroll', medir, { passive: true });
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    Array.from(el.children).forEach((h) => ro.observe(h));
    return () => {
      el.removeEventListener('scroll', medir);
      ro.disconnect();
    };
  }, [ref]);

  if (!bordes.izq && !bordes.der) return {};
  const mascara = `linear-gradient(to right, ${bordes.izq ? 'transparent, #000 32px' : '#000, #000'}, ${bordes.der ? '#000 calc(100% - 32px), transparent' : '#000'})`;
  return { maskImage: mascara, WebkitMaskImage: mascara };
}
