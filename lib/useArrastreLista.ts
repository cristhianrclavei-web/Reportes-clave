'use client';

import { useEffect, useRef, useState } from 'react';

// Zona (en px) junto al borde de arriba o de abajo donde, al arrastrar, la
// página se desplaza sola. Velocidad en px por cuadro (~60 por segundo):
// arranca lenta y sube hasta el tope mientras más cerca del borde esté el dedo.
const ZONA_SCROLL = 110;
const VELOCIDAD_MIN = 1.5;
const VELOCIDAD_MAX = 11;

type Arrastre = { grupoId: string; itemId: string; y: number; indiceEsperado: number | null };

// Velocidad de scroll según qué tan metido está el dedo en la zona del borde.
// Negativa hacia arriba, positiva hacia abajo, 0 fuera de las zonas.
export function velocidadScroll(y: number, limiteArriba: number, limiteAbajo: number): number {
  const dentroArriba = limiteArriba + ZONA_SCROLL - y;
  if (dentroArriba > 0) {
    const fuerza = Math.min(1, dentroArriba / ZONA_SCROLL);
    return -(VELOCIDAD_MIN + (VELOCIDAD_MAX - VELOCIDAD_MIN) * fuerza * fuerza);
  }
  const dentroAbajo = y - (limiteAbajo - ZONA_SCROLL);
  if (dentroAbajo > 0) {
    const fuerza = Math.min(1, dentroAbajo / ZONA_SCROLL);
    return VELOCIDAD_MIN + (VELOCIDAD_MAX - VELOCIDAD_MIN) * fuerza * fuerza;
  }
  return 0;
}

// Arrastrar partidas con el dedo o el mouse desde su agarradera. La partida
// cambia de lugar cuando el dedo pasa la mitad de la vecina (las demás se
// recorren con su animación) y la página se desplaza sola, a velocidad
// controlada, si el dedo se acerca al borde.
// Hecho a mano porque el arrastre de motion hace scroll demasiado rápido y
// no deja ajustar la velocidad.
export function useArrastreLista(onMover: (grupoId: string, itemId: string, hasta: number) => void) {
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const arrastre = useRef<Arrastre | null>(null);
  const cuadro = useRef<number | null>(null);
  const onMoverActual = useRef(onMover);
  onMoverActual.current = onMover;

  function elementosDelGrupo(grupoId: string): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>(`[data-grupo="${grupoId}"] [data-concepto]`));
  }

  function limiteArriba(): number {
    const barra = document.querySelector<HTMLElement>('[data-barra-superior]');
    const abajoDeLaBarra = barra ? barra.getBoundingClientRect().bottom : 0;
    return Math.max(0, abajoDeLaBarra);
  }

  function revisarCambioDeLugar(a: Arrastre) {
    const elementos = elementosDelGrupo(a.grupoId);
    const indice = elementos.findIndex((el) => el.dataset.concepto === a.itemId);
    if (indice < 0) return;
    // Esperar a que React pinte el cambio anterior antes de pedir otro.
    if (a.indiceEsperado !== null && a.indiceEsperado !== indice) return;
    a.indiceEsperado = null;

    const anterior = elementos[indice - 1];
    if (anterior) {
      const r = anterior.getBoundingClientRect();
      if (a.y < r.top + r.height / 2) {
        a.indiceEsperado = indice - 1;
        onMoverActual.current(a.grupoId, a.itemId, indice - 1);
        return;
      }
    }
    const siguiente = elementos[indice + 1];
    if (siguiente) {
      const r = siguiente.getBoundingClientRect();
      if (a.y > r.top + r.height / 2) {
        a.indiceEsperado = indice + 1;
        onMoverActual.current(a.grupoId, a.itemId, indice + 1);
      }
    }
  }

  function enCadaCuadro() {
    const a = arrastre.current;
    if (!a) return;
    const velocidad = velocidadScroll(a.y, limiteArriba(), window.innerHeight);
    if (velocidad !== 0) window.scrollBy(0, velocidad);
    revisarCambioDeLugar(a);
    cuadro.current = requestAnimationFrame(enCadaCuadro);
  }

  function alMover(e: PointerEvent) {
    if (arrastre.current) arrastre.current.y = e.clientY;
  }

  function terminar() {
    arrastre.current = null;
    setArrastrando(null);
    if (cuadro.current !== null) cancelAnimationFrame(cuadro.current);
    cuadro.current = null;
    window.removeEventListener('pointermove', alMover);
    window.removeEventListener('pointerup', terminar);
    window.removeEventListener('pointercancel', terminar);
  }

  function iniciar(e: React.PointerEvent, grupoId: string, itemId: string) {
    e.preventDefault();
    terminar();
    arrastre.current = { grupoId, itemId, y: e.clientY, indiceEsperado: null };
    setArrastrando(itemId);
    window.addEventListener('pointermove', alMover);
    window.addEventListener('pointerup', terminar);
    window.addEventListener('pointercancel', terminar);
    cuadro.current = requestAnimationFrame(enCadaCuadro);
  }

  // Si el formulario se cierra a media acción, soltar todo.
  useEffect(() => terminar, []);

  return { arrastrando, iniciar };
}
