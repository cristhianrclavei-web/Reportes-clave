import { describe, expect, it } from 'vitest';
import { enOrdenDeRecorrido, lineaPrincipal, ordenEntre, type Elemento } from './lazos';
import { anteriorDe, conectarTramo, conexionesEnPlano, lugarParaConectar, lugarTramoSinConectar, revisarLazo, tieneSiguiente } from './conexionesPlano';

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

  it('si el panel está sembrado, la línea sale de él', () => {
    const conPanel = { ...sembrado, equipos: [...sembrado.equipos, { id: 'pp', tipo: 'FACP', x: -20, y: 0, panelId: 'P1' }] };
    const { lineas, marcas } = conexionesEnPlano([{ id: 'L', panel_id: 'P1', elementos: lazo }], conPanel, new Map());
    expect(lineas[0]).toEqual({ lazoId: 'L', desde: [-20, 0], hasta: [0, 0], camino: [[-20, 0], [0, 0]] });
    expect(marcas.map((m) => m.texto)).not.toContain('« Panel');
  });

  it('un lazo sin panel registrado sale del panel sin registrar del plano', () => {
    const conPanel = { ...sembrado, equipos: [...sembrado.equipos, { id: 'pp', tipo: 'FACP', x: -20, y: 0 }] };
    const { lineas } = conexionesEnPlano([{ id: 'L', elementos: lazo }], conPanel, new Map());
    expect(lineas[0].desde).toEqual([-20, 0]);
  });

  it('con tubería que los une, la conexión va por la tubería', () => {
    // De a (0,0) sube a y=-5, corre a x=10 y baja a b (10,0).
    const conTubo = { ...sembrado, tuberias: [{ id: 't', tipo: 'conduit', diametro: '3/4', puntos: [[0, 0], [0, -5], [10, -5], [10, 0]] as [number, number][] }] };
    const { lineas } = conexionesEnPlano([{ id: 'L', elementos: lazo }], conTubo, new Map(), 2);
    expect(lineas[0].camino).toEqual([[0, 0], [0, -5], [10, -5], [10, 0]]);
    // r1 no está junto a la tubería: línea directa.
    expect(lineas[1].camino).toEqual([[10, 0], [10, 10]]);
  });

  it('si el panel está en otro plano, lo dice', () => {
    const { marcas } = conexionesEnPlano([{ id: 'L', panel_id: 'P1', elementos: lazo }], sembrado, new Map([['P1', 'Sótano']]));
    expect(marcas.map((m) => m.texto)).toContain('« Panel en Sótano');
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

describe('tramo sin conectar (otro nivel que se une después)', () => {
  // Línea a → b. Tramo suelto: s1 → s2 → s3 (capturado en otro nivel).
  const conTramo = [
    el('a', 1), el('b', 2),
    el('s1', 1, { sin_conectar: true }), el('s2', 1, { padre_id: 's1' }), el('s3', 1, { padre_id: 's2' }),
  ];
  const porId = (id: string) => conTramo.find((e) => e.id === id) as Elemento;

  it('no cuenta en la línea hasta que se une, pero sí en el recorrido (al final)', () => {
    expect(lineaPrincipal(conTramo).map((e) => e.id)).toEqual(['a', 'b']);
    expect(enOrdenDeRecorrido(conTramo).map((e) => e.id)).toEqual(['a', 'b', 's1', 's2', 's3']);
    expect(anteriorDe(conTramo, porId('s1'))).toBeNull();
  });

  it('un tramo nuevo queda marcado sin conectar y lo siguiente cuelga de él', () => {
    expect(lugarTramoSinConectar(conTramo).sinConectar).toBe(true);
    expect(lugarParaConectar(conTramo, porId('s3'), false).padreId).toBe('s3');
  });

  it('al unirlo después del último, su serie pasa a la línea principal en orden', () => {
    const cambios = conectarTramo(conTramo, 's1', porId('b'), false);
    const unido = conTramo.map((e) => cambios.find((c) => c.id === e.id) || e);
    expect(lineaPrincipal(unido).map((e) => e.id)).toEqual(['a', 'b', 's1', 's2', 's3']);
    expect(unido.some((e) => e.sin_conectar)).toBe(false);
  });

  it('si el dispositivo ya tiene siguiente, queda como rama; o en medio si se pide', () => {
    const rama = conectarTramo(conTramo, 's1', porId('a'), false);
    expect(rama).toHaveLength(1);
    expect(rama[0].padre_id).toBe('a');
    const enMedio = conectarTramo(conTramo, 's1', porId('a'), true);
    const unido = conTramo.map((e) => enMedio.find((c) => c.id === e.id) || e);
    expect(lineaPrincipal(unido).map((e) => e.id)).toEqual(['a', 's1', 's2', 's3', 'b']);
  });

  it('no se une consigo mismo', () => {
    expect(() => conectarTramo(conTramo, 's1', porId('s3'), false)).toThrow();
  });
});
