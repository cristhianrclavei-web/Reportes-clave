import { describe, expect, it } from 'vitest';
import { moverElemento } from './moverElemento';

describe('moverElemento', () => {
  const lista = ['a', 'b', 'c', 'd', 'e', 'f', 'DVR'];

  it('del 7.º al 1.º: los demás se recorren', () => {
    expect(moverElemento(lista, 6, 0)).toEqual(['DVR', 'a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('hacia abajo', () => {
    expect(moverElemento(lista, 0, 2)).toEqual(['b', 'c', 'a', 'd', 'e', 'f', 'DVR']);
  });

  it('fuera de rango o mismo lugar no cambia nada', () => {
    expect(moverElemento(lista, 0, 0)).toBe(lista);
    expect(moverElemento(lista, 0, 9)).toBe(lista);
    expect(moverElemento(lista, -1, 2)).toBe(lista);
  });
});
