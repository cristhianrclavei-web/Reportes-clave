import { describe, expect, it } from 'vitest';
import { ordenEntre, type Elemento } from './lazos';
import { anteriorDe, conexionesEnPlano, lugarParaConectar, revisarLazo, tieneSiguiente } from './conexionesPlano';

function el(id: string, orden: number, extra: Partial<Elemento> = {}): Elemento {
  return { id, lazo_id: 'L', padre_id: null, orden, tipo: 'SH', nombre: id, direccion: null, ubicacion: null, foto_path: null, ...extra };
}

// a → b → c en la línea; de b sale una rama r1 → r2.
const lazo = [el('a', 1), el('b', 2), el('c', 3), el('r1', 1, { padre_id: 'b' }), el('r2', 1, { padre_id: 'r1' })];

describe('recorrido', () => {
  it('sabe de dónde le llega el cable a cada uno', () => {
    const porId = (id: string) => lazo.find((e) => e.id === id) as Elemento;
    expect(anteriorDe(lazo, porId('a'))).toBe('panel');
    expect((anteriorDe(lazo, porId('c')) as Elemento).id).toBe('b');
    expect((anteriorDe(lazo, porId('r1')) as Elemento).id).toBe('b');
    expect((anteriorDe(lazo, porId('r2')) as Elemento).id).toBe('r1');
  });

  it('sabe si ya sale algo de un dispositivo', () => {
    const porId = (id: string) => lazo.find((e) => e.id === id) as Elemento;
    expect(tieneSiguiente(lazo, porId('a'))).toBe(true);
    expect(tieneSiguiente(lazo, porId('c'))).toBe(false);
    expect(tieneSiguiente(lazo, porId('r1'))).toBe(true);
    expect(tieneSiguiente(lazo, porId('r2'))).toBe(false);
  });
});

describe('conectar desde el plano', () => {
  const porId = (id: string) => lazo.find((e) => e.id === id) as Elemento;

  it('desde el último sigue en serie', () => {
    const lugar = lugarParaConectar(lazo, porId('c'), false);
    expect(lugar.padreId).toBeNull();
    expect(ordenEntre(lugar.ordenAntes, lugar.ordenDespues)).toBe(4);
  });

  it('desde uno que ya tiene siguiente abre una rama, o se mete en medio si se pide', () => {
    expect(lugarParaConectar(lazo, porId('a'), false).padreId).toBe('a');
    const enMedio = lugarParaConectar(lazo, porId('a'), true);
    expect(enMedio.padreId).toBeNull();
    expect(ordenEntre(enMedio.ordenAntes, enMedio.ordenDespues)).toBe(1.5);
  });

  it('al final de una rama sigue colgando en serie', () => {
    const lugar = lugarParaConectar(lazo, porId('r2'), false);
    expect(lugar.padreId).toBe('r2');
  });

  it('desde el panel queda primero', () => {
    expect(ordenEntre(lugarParaConectar([], 'panel', false).ordenAntes, null)).toBe(1);
    const lugar = lugarParaConectar(lazo, 'panel', false);
    expect(lugar.padreId).toBeNull();
    expect(ordenEntre(lugar.ordenAntes, lugar.ordenDespues)).toBe(0);
  });
});

describe('lo que se dibuja', () => {
  const sembrado = {
    equipos: [
      { id: 'pa', tipo: 'SH', x: 0, y: 0, elementoId: 'a' },
      { id: 'pb', tipo: 'SH', x: 10, y: 0, elementoId: 'b' },
      { id: 'pr1', tipo: 'SH', x: 10, y: 10, elementoId: 'r1' },
    ],
    tuberias: [],
  };

  it('une los que están en este plano y marca lo que pasa a otro', () => {
    const planoDe = new Map([['c', 'Nivel 1'], ['r2', 'Sótano']]);
    const { lineas, marcas } = conexionesEnPlano([{ id: 'L', elementos: lazo }], sembrado, planoDe);
    expect(lineas.map((l) => [l.desde, l.hasta])).toEqual([[[0, 0], [10, 0]], [[10, 0], [10, 10]]]);
    expect(marcas.map((m) => m.texto).sort()).toEqual(['Sigue en Nivel 1 »', 'Sigue en Sótano »', '« Panel']);
  });

  it('marca de qué plano viene', () => {
    const soloC = { equipos: [{ id: 'pc', tipo: 'SH', x: 5, y: 5, elementoId: 'c' }], tuberias: [] };
    const { lineas, marcas } = conexionesEnPlano([{ id: 'L', elementos: lazo }], soloC, new Map([['b', 'Planta baja']]));
    expect(lineas).toEqual([]);
    expect(marcas).toEqual([{ lazoId: 'L', en: [5, 5], texto: '« Viene de Planta baja' }]);
  });
});

describe('revisión del lazo', () => {
  const texto = (d: string) => d;

  it('avisa derivaciones en clase A y en notificación', () => {
    expect(revisarLazo({ tipo: 'deteccion', clase: 'A' }, lazo, new Set(lazo.map((e) => e.id)), texto)[0]).toMatch(/clase A con 2/);
    expect(revisarLazo({ tipo: 'deteccion', clase: 'B' }, lazo, new Set(lazo.map((e) => e.id)), texto)).toEqual([]);
    expect(revisarLazo({ tipo: 'estrobos', clase: null }, lazo, new Set(lazo.map((e) => e.id)), texto)[0]).toMatch(/notificación/);
  });

  it('avisa direcciones repetidas y lo que no está en ningún plano', () => {
    const conDirecciones = [el('a', 1, { direccion: 'D1' }), el('b', 2, { direccion: 'D1' }), el('c', 3, { direccion: 'D2' })];
    const avisos = revisarLazo({ tipo: 'deteccion', clase: 'B' }, conDirecciones, new Set(['a']), texto);
    expect(avisos).toEqual(['Dirección repetida: D1.', '2 dispositivos todavía no están en ningún plano.']);
  });
});
