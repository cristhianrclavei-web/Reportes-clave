import { describe, expect, it } from 'vitest';
import { TIPOS_POR_CIRCUITO } from './lazos';
import { aHoja, figuraDe, girar } from './simbolosPlano';

describe('símbolos del plano', () => {
  it('todos los tipos de equipo tienen dibujo', () => {
    const tipos = Object.values(TIPOS_POR_CIRCUITO).flat().map((t) => t.codigo);
    for (const tipo of tipos) expect(figuraDe(tipo).trazos.length, tipo).toBeGreaterThan(0);
  });

  it('el giro da la vuelta y nunca queda negativo', () => {
    expect(girar(0, -15)).toBe(345);
    expect(girar(350, 15)).toBe(5);
    expect(girar(270, 90)).toBe(0);
  });

  it('gira los puntos del símbolo en el sentido de las manecillas', () => {
    const [x, y] = aHoja(1, 0, 10, 10, 2, 90);
    expect(x).toBeCloseTo(10);
    expect(y).toBeCloseTo(12);
  });
});
