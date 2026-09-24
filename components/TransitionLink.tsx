'use client';

import Link, { LinkProps } from 'next/link';
import { useRouter } from 'next/navigation';
import { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { navegarConTransicion } from '@/lib/nativeViewTransition';

// Envoltorio de next/link que usa la View Transitions API nativa del
// navegador (document.startViewTransition) para cruzar suavemente entre
// secciones. A propósito NO usa el componente <ViewTransition> de React:
// ese solo existe en React 19, y producción sigue en React 18 (Next 14.2.35
// comiteado) mientras la actualización mayor se queda en local. La API
// nativa es pura del navegador, no depende de la versión de React/Next, y
// se degrada sola (sin animación) en navegadores que no la soportan.
export default function TransitionLink({
  href,
  children,
  onClick,
  ...rest
}: LinkProps & AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode }) {
  const router = useRouter();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    // Clic con modificador (nueva pestaña, etc.) o botón distinto al
    // principal: se deja que el navegador haga lo suyo, sin interceptar.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

    e.preventDefault();
    navegarConTransicion(() => router.push(href.toString()));
  }

  return (
    <Link href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
