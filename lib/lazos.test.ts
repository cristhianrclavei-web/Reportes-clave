import { describe, expect, it } from 'vitest';
import {
  Elemento, corteSugerido, cortesRestantes, direccionOcupada, direccionVisible, lineaPrincipal,
  nombreSugerido, normalizarDireccion, ordenEntre, posiciones, siguienteDireccion, tramoConFalla,
} from './lazos';

function el(id: string, orden: number, extra: Partial<Elemento> = {}): Elemento {
  return { id, lazo_id: 'L', padre_id: null, orden, tipo: 'SH', nombre: id, direccion: null, ubicacion: null, foto_path: null, ...extra };
}

describe('orden del lazo', () => {
  it('pone la línea principal en orden y deja fuera lo que cuelga', () => {
    const lista = [el('b', 2), el('a', 1), el('hijo', 1, { padre_id: 'a' })];
    expect(lineaPrincipal(lista).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('calcula el orden para insertar al inicio, en medio y al final', () => {
    expect(ordenEntre(null, null)).toBe(1);
    expect(ordenEntre(null, 1)).toBe(0);
    expect(ordenEntre(1, 2)).toBe(1.5);
    expect(ordenEntre(3, null)).toBe(4);
  });

  it('lo que cuelga comparte la posición de su padre, aunque sea una derivación larga', () => {
    const lista = [el('a', 1), el('b', 2), el('h1', 1, { padre_id: 'b' }), el('h2', 1, { padre_id: 'h1' })];
    const pos = posiciones(lista);
    expect(pos.get('a')).toBe(1);
    expect(pos.get('b')).toBe(2);
    expect(pos.get('h2')).toBe(2);
  });
});

describe('nombres y direcciones', () => {
  it('sugiere el siguiente número del mismo tipo', () => {
    const lista = [el('1', 1, { nombre: 'LZ1_SH_4' }), el('2', 2, { nombre: 'LZ1_SH_7' }), el('3', 3, { nombre: 'LZ1_MC_2' })];
    expect(nombreSugerido('LZ1', 'SH', lista)).toBe('LZ1_SH_8');
    expect(nombreSugerido('LZ1', 'MM', lista)).toBe('LZ1_MM_1');
  });

  it('numera las cajas aparte', () => {
    expect(nombreSugerido('LZ1', 'RG', [el('1', 1, { nombre: 'RG-01' })])).toBe('RG-02');
  });

  it('valida y muestra la dirección como el panel', () => {
    expect(normalizarDireccion('d', '08')).toBe('D8');
    expect(normalizarDireccion('M', '160')).toBe('M160');
    expect(normalizarDireccion('X', '1')).toBeNull();
    expect(normalizarDireccion('D', '0')).toBeNull();
    expect(normalizarDireccion('D', '1000')).toBeNull();
    expect(direccionVisible('D8', 1)).toBe('1D008');
    expect(direccionVisible(null, 1)).toBe('');
  });

  it('avisa de una dirección repetida y propone la siguiente libre', () => {
    const lista = [el('1', 1, { direccion: 'D8' }), el('2', 2, { direccion: 'M3' })];
    expect(direccionOcupada('D8', lista)?.id).toBe('1');
    expect(direccionOcupada('D8', lista, '1')).toBeNull();
    expect(siguienteDireccion('D', lista)).toBe(9);
    expect(siguienteDireccion('M', [])).toBe(1);
  });
});

describe('búsqueda de falla a tierra', () => {
  it('sin cortes el tramo es todo el lazo y sugiere cortar a la mitad', () => {
    const tramo = tramoConFalla(34, []);
    expect(tramo).toEqual({ desde: 1, hasta: 34, contradictorio: false });
    expect(corteSugerido(tramo)).toBe(17);
    expect(cortesRestantes(tramo)).toBe(6);
  });

  it('acota el tramo con cada corte', () => {
    const tramo = tramoConFalla(34, [
      { posicion: 17, lado: 'campo' },
      { posicion: 26, lado: 'panel' },
      { posicion: 22, lado: 'campo' },
    ]);
    expect(tramo).toEqual({ desde: 23, hasta: 26, contradictorio: false });
    expect(corteSugerido(tramo)).toBe(24);
    expect(cortesRestantes(tramo)).toBe(2);
  });

  it('con un solo dispositivo ya no sugiere corte', () => {
    const tramo = tramoConFalla(10, [{ posicion: 4, lado: 'campo' }, { posicion: 5, lado: 'panel' }]);
    expect(tramo).toEqual({ desde: 5, hasta: 5, contradictorio: false });
    expect(corteSugerido(tramo)).toBeNull();
  });

  it('marca cortes que se contradicen', () => {
    const tramo = tramoConFalla(10, [{ posicion: 6, lado: 'campo' }, { posicion: 3, lado: 'panel' }]);
    expect(tramo.contradictorio).toBe(true);
    expect(corteSugerido(tramo)).toBeNull();
  });
});
