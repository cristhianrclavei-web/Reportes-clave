import { describe, expect, it } from 'vitest';
import { velocidadScroll } from './useArrastreLista';

describe('velocidadScroll', () => {
  it('fuera de las zonas del borde no hay scroll', () => {
    expect(velocidadScroll(400, 150, 900)).toBe(0);
  });
  it('cerca del borde de abajo baja despacio y acelera hasta un tope', () => {
    const entrando = velocidadScroll(800, 150, 900);
    const pegado = velocidadScroll(900, 150, 900);
    expect(entrando).toBeGreaterThan(0);
    expect(entrando).toBeLessThan(pegado);
    expect(pegado).toBeLessThanOrEqual(11);
  });
  it('arriba cuenta desde la barra fija, no desde el borde de la pantalla', () => {
    expect(velocidadScroll(200, 150, 900)).toBeLessThan(0);
    expect(velocidadScroll(300, 150, 900)).toBe(0);
  });
});
