// Saca el elemento de la posición `desde` y lo mete en `hasta`; los demás se
// recorren solos. Ej.: mover el 7.º al lugar 1 deja al que era 1.º en el 2.º.
// Las posiciones empiezan en 0. Regresa una lista nueva (no cambia la original).
export function moverElemento<T>(lista: T[], desde: number, hasta: number): T[] {
  const fueraDeRango = desde < 0 || desde >= lista.length || hasta < 0 || hasta >= lista.length;
  if (fueraDeRango || desde === hasta) return lista;
  const copia = [...lista];
  const [elemento] = copia.splice(desde, 1);
  copia.splice(hasta, 0, elemento);
  return copia;
}
