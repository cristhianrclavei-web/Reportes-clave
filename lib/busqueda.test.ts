import { describe, it, expect } from 'vitest';
import { coincideBusqueda } from './busqueda';

describe('coincideBusqueda', () => {
  it('ignora acentos y mayúsculas', () => {
    expect(coincideBusqueda('Centro de Negocios Del Ángel', 'angel')).toBe(true);
    expect(coincideBusqueda('Centro de Negocios Del Angel', 'ÁNGEL')).toBe(true);
  });
  it('todas las palabras, en cualquier orden', () => {
    expect(coincideBusqueda('Centro de Negocios Del Ángel', 'angel centro')).toBe(true);
    expect(coincideBusqueda('Centro de Negocios Del Ángel', 'angel plaza')).toBe(false);
  });
  it('vacía coincide con todo', () => {
    expect(coincideBusqueda('lo que sea', '  ')).toBe(true);
  });
});
