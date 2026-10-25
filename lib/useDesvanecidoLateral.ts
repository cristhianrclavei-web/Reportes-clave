'use client';

import { CSSProperties, RefObject, useEffect, useState } from 'react';

// Para filas que se deslizan de lado (pestañas en el celular): cuando hay
// más contenido fuera de la vista, el borde de ese lado se desvanece. Así
// una pestaña a medias se lee como «hay más, desliza» y no como un corte.
// `bordes` dice de qué lado hay más (para mostrar flechas con mouse).
export type BordesLaterales = { izq: boolean; der: boolean };
export function useDesvanecidoLateral(ref: RefObject<HTMLElement | null>): { estilo: CSSProperties; bordes: BordesLaterales } {
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
    // Pestañas que llegan después (Almacén y Facturación, al saber los
    // permisos): se vuelve a medir y se vigilan también.
    const mo = new MutationObserver(() => {
      Array.from(el.children).forEach((h) => ro.observe(h));
      medir();
    });
    mo.observe(el, { childList: true });
    return () => {
      el.removeEventListener('scroll', medir);
      ro.disconnect();
      mo.disconnect();
    };
  }, [ref]);

  if (!bordes.izq && !bordes.der) return { estilo: {}, bordes };
  const mascara = `linear-gradient(to right, ${bordes.izq ? 'transparent, #000 32px' : '#000, #000'}, ${bordes.der ? '#000 calc(100% - 32px), transparent' : '#000'})`;
  return { estilo: { maskImage: mascara, WebkitMaskImage: mascara }, bordes };
}
