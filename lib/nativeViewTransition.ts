// Envoltorio único para document.startViewTransition — lo usan
// TransitionLink, CommandPalette y cualquier otro lugar que navegue con
// cruce suave. Un solo lugar para la protección contra el InvalidStateError
// del navegador (una transición ya en vuelo) evita que el mismo bug se
// repita en cada componente que lo use por separado — ya pasó una vez.
let transitionEnCurso = false;

export function navegarConTransicion(mutarDom: () => void) {
  const startViewTransition = (document as any).startViewTransition?.bind(document);
  if (!startViewTransition || transitionEnCurso) {
    mutarDom();
    return;
  }
  try {
    const transition = startViewTransition(mutarDom);
    transitionEnCurso = true;
    // Las tres promesas del objeto se rechazan solas cuando algo interrumpe
    // la transición a medio vuelo (ej. React sigue actualizando el DOM
    // después de que el navegador ya tomó la foto de "después"). Sin
    // capturarlas las tres, Chrome las reporta como "Uncaught (in promise)"
    // en consola aunque la navegación en sí haya terminado bien.
    Promise.allSettled([transition?.ready, transition?.updateCallbackDone, transition?.finished])
      .finally(() => { transitionEnCurso = false; });
  } catch {
    transitionEnCurso = false;
    mutarDom();
  }
}
