'use client';

import Link, { LinkProps } from 'next/link';
import { useRouter } from 'next/navigation';
import { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';

// Envoltorio de next/link que usa la View Transitions API nativa del
// navegador (document.startViewTransition) para cruzar suavemente entre
// secciones. A propósito NO usa el componente <ViewTransition> de React:
// ese solo existe en React 19, y producción sigue en React 18 (Next 14.2.35
// comiteado) mientras la actualización mayor se queda en local. La API
// nativa es pura del navegador, no depende de la versión de React/Next, y
// se degrada sola (sin animación) en navegadores que no la soportan — por
// eso se accede vía `(document as any)` en vez de tipar la interfaz global:
// así ni siquiera el tipo depende de qué versión de TypeScript/lib.dom la
// máquina tenga instalada.
//
// El navegador solo permite una transición activa a la vez: si alguien
// toca otra pestaña antes de que la anterior termine, startViewTransition
// truena con "InvalidStateError". Por eso el flag a nivel de módulo (todas
// las instancias comparten el mismo documento) y el try/catch: si algo
// sale mal, se navega igual, solo que sin la animación.
let transitionEnCurso = false;

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

    const startViewTransition = (document as any).startViewTransition?.bind(document);
    if (!startViewTransition || transitionEnCurso) return; // sin soporte, o ya hay una en vuelo: Link navega normal

    e.preventDefault();
    try {
      const transition = startViewTransition(() => {
        router.push(href.toString());
      });
      transitionEnCurso = true;
      // Las tres promesas del objeto (ready/updateCallbackDone/finished) se
      // rechazan solas cuando algo interrumpe la transición a medio vuelo
      // (por ejemplo, si React sigue actualizando el DOM después de que el
      // navegador ya tomó la foto de "después"). Sin capturarlas las tres,
      // Chrome las reporta como "Uncaught (in promise)" en consola aunque
      // la navegación en sí haya terminado bien.
      Promise.allSettled([transition?.ready, transition?.updateCallbackDone, transition?.finished])
        .finally(() => { transitionEnCurso = false; });
    } catch {
      transitionEnCurso = false;
      router.push(href.toString());
    }
  }

  return (
    <Link href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
