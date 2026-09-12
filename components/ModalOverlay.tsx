'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Fondo oscuro de los modales, con tres cosas que hay que acertar siempre:
//
// 1. Se monta en el <body> mediante un portal. Sin esto, un modal abierto
//    desde la barra superior sale recortado: esa barra usa backdrop-filter, y
//    esa propiedad convierte al elemento en el marco de referencia de todo lo
//    que esté position:fixed dentro. El «inset-0» dejaba de significar la
//    pantalla completa y pasaba a significar la franja de la barra, de unos
//    56 px de alto.
// 2. Click fantasma en móvil: al tocar el botón que abre el modal, el
//    navegador dispara un click ~300 ms después. Si para entonces el fondo ya
//    está montado bajo el dedo, recibe ese click y el modal se cierra solo.
//    Por eso se ignora cualquier cierre por fondo durante los primeros
//    milisegundos.
// 3. Solo cierra si el toque fue en el fondo, no en el contenido.
export default function ModalOverlay({
  onClose,
  children,
  className = '',
}: {
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const montadoEn = useRef(0);
  const [enCliente, setEnCliente] = useState(false);

  useEffect(() => {
    montadoEn.current = Date.now();
    setEnCliente(true);
  }, []);

  // Se congela el desplazamiento de atrás: en un teléfono, arrastrar sobre el
  // fondo movía la lista de abajo y el modal parecía flotar a la deriva.
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previo; };
  }, []);

  // Cerrar con Escape, para cuando se usa desde la computadora.
  useEffect(() => {
    function alPulsar(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [onClose]);

  const fondo = (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        if (Date.now() - montadoEn.current < 400) return;
        onClose();
      }}
      className={`fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4 ${className}`}
    >
      {children}
    </div>
  );

  // En el primer render del servidor no hay document; se espera al cliente.
  if (!enCliente) return null;
  return createPortal(fondo, document.body);
}
