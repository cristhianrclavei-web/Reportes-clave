import { describe, expect, it } from 'vitest';
import {
  Cambio, Elemento, armarDiagrama, planDeMovimiento, planDeMovimientoVarios, corteSugerido, describirCambio, cortesRestantes, direccionOcupada, direccionVisible, enOrdenDeRecorrido, lineaPrincipal,
  armarUbicacion, conteoPorNivel, conteoPorTipo, lazosDelMismoPanel, sugerenciaPara, partesDe, valoresUsados, nombreSugerido, siguienteNumeroDeLazo, sinDireccion, normalizarDireccion, ordenEntre, posiciones, siguienteDireccion, zonaConFalla,
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
    expect(direccionVisible('D8', 1)).toBe('L01D008');
    expect(direccionVisible('M21', 12)).toBe('L12M021');
    expect(direccionVisible('D8', null)).toBe('D008');
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
  // Línea de 1 a n, sin ramas.
  function linea(n: number): Elemento[] {
    return Array.from({ length: n }, (_, i) => el(`p${i + 1}`, i + 1));
  }
  const ids = (zona: { ids: Set<string> }) => [...zona.ids].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

  it('sin cortes la falla puede estar en todo el lazo y sugiere cortar a la mitad', () => {
    const lista = linea(34);
    const zona = zonaConFalla(lista, []);
    expect(zona.ids.size).toBe(34);
    expect(corteSugerido(lista, zona)?.id).toBe('p17');
    expect(cortesRestantes(zona.ids.size)).toBe(6);
  });

  it('acota la zona con cada corte en la línea principal', () => {
    const lista = linea(34);
    const zona = zonaConFalla(lista, [
      { elementoId: 'p17', lado: 'campo' },
      { elementoId: 'p26', lado: 'panel' },
      { elementoId: 'p22', lado: 'campo' },
    ]);
    expect(ids(zona)).toEqual(['p23', 'p24', 'p25', 'p26']);
    expect(corteSugerido(lista, zona)?.id).toBe('p24');
    expect(cortesRestantes(zona.ids.size)).toBe(2);
  });

  it('con un solo dispositivo ya no sugiere corte', () => {
    const lista = linea(10);
    const zona = zonaConFalla(lista, [{ elementoId: 'p4', lado: 'campo' }, { elementoId: 'p5', lado: 'panel' }]);
    expect(ids(zona)).toEqual(['p5']);
    expect(corteSugerido(lista, zona)).toBeNull();
  });

  it('marca cortes que se contradicen', () => {
    const lista = linea(10);
    const zona = zonaConFalla(lista, [{ elementoId: 'p6', lado: 'campo' }, { elementoId: 'p3', lado: 'panel' }]);
    expect(zona.contradictorio).toBe(true);
    expect(corteSugerido(lista, zona)).toBeNull();
  });

  it('permite cortar dentro de una rama', () => {
    // p1 — p2 — p3; de p2 cuelgan dos ramas: a1→a2→a3 y b1.
    const lista = [
      el('p1', 1), el('p2', 2), el('p3', 3),
      el('a1', 1, { padre_id: 'p2' }), el('a2', 1, { padre_id: 'a1' }), el('a3', 1, { padre_id: 'a2' }),
      el('b1', 2, { padre_id: 'p2' }),
    ];
    expect(enOrdenDeRecorrido(lista).map((e) => e.id)).toEqual(['p1', 'p2', 'a1', 'a2', 'a3', 'b1', 'p3']);

    // Abrir la salida de p2 en la línea: sus ramas quedan del lado panel.
    const sinP3 = zonaConFalla(lista, [{ elementoId: 'p2', lado: 'panel' }]);
    expect(sinP3.ids.has('p3')).toBe(false);
    expect(sinP3.ids.has('a3')).toBe(true);

    // Abrir dentro de la rama: la falla después de a1 deja solo a2 y a3.
    const enRama = zonaConFalla(lista, [{ elementoId: 'a1', lado: 'campo' }]);
    expect([...enRama.ids].sort()).toEqual(['a2', 'a3']);
    expect(corteSugerido(lista, enRama)?.id).toBe('a2');
  });
});

describe('historial de cambios', () => {
  const base = { id: 'h', registro_id: 'e1', usuario_nombre: 'Juan', creado_en: '2026-11-04T20:00:00Z' };
  const nombreDe = (id: string | null) => (id === 'e1' ? 'LZ1_SH_4' : null);

  it('describe altas, correcciones y borrados de dispositivos', () => {
    const alta: Cambio = { ...base, tabla: 'lazo_elementos', elemento_id: 'e1', accion: 'alta', antes: null, despues: { nombre: 'LZ1_SH_4', direccion: 'D4' } };
    expect(describirCambio(alta, 1, nombreDe)).toBe('Agregó LZ1_SH_4 (L01D004)');

    const cambio: Cambio = { ...base, tabla: 'lazo_elementos', elemento_id: 'e1', accion: 'cambio', antes: { direccion: 'D4', ubicacion: null }, despues: { direccion: 'D5', ubicacion: 'Pasillo B' } };
    expect(describirCambio(cambio, 1, nombreDe)).toBe('Corrigió LZ1_SH_4: dirección L01D004 → L01D005; ubicación vacío → «Pasillo B»');

    const movido: Cambio = { ...base, tabla: 'lazo_elementos', elemento_id: 'e1', accion: 'cambio', antes: { orden: 1 }, despues: { orden: 2 } };
    expect(describirCambio(movido, 1, nombreDe)).toBe('Corrigió LZ1_SH_4: lo cambió de lugar en el lazo');

    const baja: Cambio = { ...base, tabla: 'lazo_elementos', elemento_id: 'e9', accion: 'baja', antes: { nombre: 'LZ1_MC_2', direccion: 'M2' }, despues: null };
    expect(describirCambio(baja, 1, nombreDe)).toBe('Borró LZ1_MC_2 (L01M002)');
  });

  it('describe cortes y cierre de la búsqueda', () => {
    const corte: Cambio = { ...base, tabla: 'lazo_cortes', elemento_id: 'e1', accion: 'alta', antes: null, despues: { lado: 'campo', medicion: '40 kΩ' } };
    expect(describirCambio(corte, 1, nombreDe)).toBe('Registró un corte a la salida de LZ1_SH_4: la falla quedó del lado campo · 40 kΩ');

    const cierre: Cambio = { ...base, tabla: 'lazo_fallas', elemento_id: 'e1', accion: 'cambio', antes: { estado: 'abierta' }, despues: { estado: 'resuelta', causa: 'Agua en la caja' } };
    expect(describirCambio(cierre, 1, nombreDe)).toBe('Cerró la búsqueda de falla en LZ1_SH_4: Agua en la caja');
  });
});

describe('resumen del lazo y lazos del mismo panel', () => {
  const base = { cliente_id: 'C', tipo: 'deteccion' as const, nombre: 'x', clase: 'B' as const, notas: null, creado_en: '' };
  const l1 = { ...base, id: 'a', codigo: 'LZ1', numero: 1, panel: 'Firelite ES-1000X' };
  const l2 = { ...base, id: 'b', codigo: 'LZ2', numero: 2, panel: '  firelite   es-1000x ' };
  const otro = { ...base, id: 'c', codigo: 'LZ1', numero: 1, panel: 'Notifier' };
  const otroCliente = { ...l2, id: 'd', cliente_id: 'Z' };

  it('junta los lazos del mismo panel aunque cambien mayúsculas y espacios', () => {
    expect(lazosDelMismoPanel(l1, [l2, otro, l1, otroCliente]).map((l) => l.id)).toEqual(['a', 'b']);
    expect(siguienteNumeroDeLazo([l1, l2])).toBe(3);
  });

  it('con panel registrado junta todos sus circuitos: SLC, luego NAC', () => {
    const nac2 = { ...l1, id: 'n2', tipo: 'estrobos' as const, codigo: 'NAC2', numero: 2, panel_id: 'P' };
    const slc1 = { ...l1, panel_id: 'P' };
    expect(lazosDelMismoPanel(slc1, [nac2, slc1, l2]).map((l) => l.id)).toEqual(['a', 'n2']);
    expect(siguienteNumeroDeLazo([slc1, nac2], 'estrobos')).toBe(3);
  });

  it('cuenta por tipo y encuentra los que no tienen dirección', () => {
    const els = [
      { id: '1', tipo: 'SH', direccion: 'D1' }, { id: '2', tipo: 'SH', direccion: null },
      { id: '3', tipo: 'EMA', direccion: 'M1' }, { id: '4', tipo: 'RG', direccion: null },
    ].map((e, i) => ({ lazo_id: 'a', padre_id: null, orden: i, nombre: e.id, ubicacion: null, foto_path: null, ...e }));
    expect(conteoPorTipo(els)).toEqual([{ tipo: 'SH', cuantos: 2 }, { tipo: 'EMA', cuantos: 1 }, { tipo: 'RG', cuantos: 1 }]);
    expect(sinDireccion(els).map((e) => e.id)).toEqual(['2']);
  });
});

describe('ubicación por partes', () => {
  const el = (id: string, area: string | null, nivel: string | null) =>
    ({ id, lazo_id: 'a', padre_id: null, orden: 1, tipo: 'SH', nombre: id, direccion: null, ubicacion: null, foto_path: null, area, nivel });

  it('junta las partes sin dejar separadores sueltos', () => {
    expect(armarUbicacion({ area: 'Cocina', nivel: 'Planta baja', referencia: ' sobre plafón ' })).toBe('Cocina · Planta baja · sobre plafón');
    expect(armarUbicacion({ area: '', nivel: 'Nivel -1', referencia: '' })).toBe('Nivel -1');
    expect(armarUbicacion({ area: ' ', nivel: '', referencia: '' })).toBeNull();
  });

  it('un dispositivo viejo pone su ubicación completa en «Área»', () => {
    expect(partesDe({ ubicacion: 'Central de enfermeras nivel -1' })).toEqual({ area: 'Central de enfermeras nivel -1', nivel: '', referencia: '' });
    expect(partesDe({ ubicacion: 'x', area: 'Cocina', nivel: 'PB' })).toEqual({ area: 'Cocina', nivel: 'PB', referencia: '' });
  });

  it('sugiere los niveles más usados y los cuenta', () => {
    const els = [el('1', 'Cocina', 'Planta baja'), el('2', 'Cocina', 'Nivel 1'), el('3', 'Bodega 1', 'Planta baja'), el('4', null, null)];
    expect(valoresUsados(els, 'nivel')).toEqual(['Planta baja', 'Nivel 1']);
    expect(valoresUsados(els, 'area')).toEqual(['Cocina', 'Bodega 1']);
    expect(conteoPorNivel(els)).toEqual([{ nivel: 'Planta baja', cuantos: 2 }, { nivel: 'Nivel 1', cuantos: 1 }]);
  });
});

describe('sugerenciaPara', () => {
  const usados = ['Habitación 30', 'Habitación 31', 'Pasillo'];
  it('da la primera que empieza con lo escrito, sin importar acentos ni mayúsculas', () => {
    expect(sugerenciaPara('habitacion', usados)).toBe('Habitación 30');
    expect(sugerenciaPara('Habitación 31', usados)).toBeNull();
    expect(sugerenciaPara('habitación 3', usados)).toBe('Habitación 30');
    expect(sugerenciaPara('pa', usados)).toBe('Pasillo');
  });
  it('nada si no hay texto o nada coincide', () => {
    expect(sugerenciaPara('', usados)).toBeNull();
    expect(sugerenciaPara('cocina', usados)).toBeNull();
  });
});

describe('acomodo del diagrama', () => {
  // A B C en la línea; de B cuelga una rama chica (b1) y una larga (r1→r2→r3→r4→r5).
  const els = [
    el('A', 1), el('B', 2), el('C', 3),
    el('b1', 1, { padre_id: 'B' }),
    el('r1', 2, { padre_id: 'B' }), el('r2', 1, { padre_id: 'r1' }), el('r3', 1, { padre_id: 'r2' }),
    el('r4', 1, { padre_id: 'r3' }), el('r5', 1, { padre_id: 'r4' }),
  ];
  it('aparta las ramas largas como su propia línea y deja colgadas las chicas', () => {
    const a = armarDiagrama(els);
    expect(a.principal.map((e) => e.id)).toEqual(['A', 'B', 'C']);
    expect(a.bloques).toHaveLength(1);
    expect(a.bloques[0].letra).toBe('A');
    expect(a.bloques[0].origen?.id).toBe('B');
    expect(a.bloques[0].linea.map((e) => e.id)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(a.letraDeRama.get('r1')).toBe('A');
    expect(a.letraDeRama.has('b1')).toBe(false);
  });
});

describe('mover un dispositivo', () => {
  function aplicar(base: Elemento[], cambios: Elemento[]): Elemento[] {
    const porId = new Map(cambios.map((c) => [c.id, c]));
    return base.map((e) => porId.get(e.id) || e);
  }
  function rama(lista: Elemento[], inicio: string): string[] {
    const ids = [inicio];
    let actual = inicio;
    for (;;) {
      const hijos = lista.filter((e) => e.padre_id === actual);
      if (hijos.length !== 1) break;
      actual = hijos[0].id;
      ids.push(actual);
    }
    return ids;
  }

  it('en la línea principal: lo pone después del destino', () => {
    const base = [el('A', 1), el('B', 2), el('C', 3)];
    const final = aplicar(base, planDeMovimiento(base, 'A', 'C', 'despues'));
    expect(lineaPrincipal(final).map((e) => e.id)).toEqual(['B', 'C', 'A']);
  });

  it('antes de un dispositivo de la línea', () => {
    const base = [el('A', 1), el('B', 2), el('C', 3)];
    const final = aplicar(base, planDeMovimiento(base, 'C', 'A', 'antes'));
    expect(lineaPrincipal(final).map((e) => e.id)).toEqual(['C', 'A', 'B']);
  });

  it('sacarlo de una rama cierra el hueco y meterlo en otra respeta la serie', () => {
    // A ─ r1 → r2 → r3 ; B
    const base = [el('A', 1), el('B', 2), el('r1', 1, { padre_id: 'A' }), el('r2', 1, { padre_id: 'r1' }), el('r3', 1, { padre_id: 'r2' })];
    const final = aplicar(base, planDeMovimiento(base, 'r2', 'B', 'colgar'));
    expect(rama(final, 'r1')).toEqual(['r1', 'r3']);
    expect(final.find((e) => e.id === 'r2')?.padre_id).toBe('B');
  });

  it('después de uno en medio de una rama: lo que seguía queda detrás del movido', () => {
    const base = [el('A', 1), el('X', 2), el('r1', 1, { padre_id: 'A' }), el('r2', 1, { padre_id: 'r1' })];
    const final = aplicar(base, planDeMovimiento(base, 'X', 'r1', 'despues'));
    expect(lineaPrincipal(final).map((e) => e.id)).toEqual(['A']);
    expect(rama(final, 'r1')).toEqual(['r1', 'X', 'r2']);
  });

  it('se lleva sus ramas y no deja ponerlo dentro de ellas', () => {
    const base = [el('A', 1), el('B', 2), el('b1', 1, { padre_id: 'B' }), el('b2', 2, { padre_id: 'B' })];
    const final = aplicar(base, planDeMovimiento(base, 'B', 'A', 'antes'));
    expect(lineaPrincipal(final).map((e) => e.id)).toEqual(['B', 'A']);
    expect(final.filter((e) => e.padre_id === 'B').map((e) => e.id).sort()).toEqual(['b1', 'b2']);
    expect(() => planDeMovimiento(base, 'B', 'b1', 'despues')).toThrow();
    expect(() => planDeMovimiento(base, 'B', 'B', 'despues')).toThrow();
  });

  // A B C D E F G en serie, pero C D E en realidad salen de G.
  const serie = () => ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((id, i) => el(id, i + 1));

  it('varios a la vez: colgando quedan en serie como rama nueva, en su orden', () => {
    const base = serie();
    const final = aplicar(base, planDeMovimientoVarios(base, ['E', 'C', 'D'], 'G', 'colgar'));
    expect(lineaPrincipal(final).map((e) => e.id)).toEqual(['A', 'B', 'F', 'G']);
    expect(rama(final, 'C')).toEqual(['C', 'D', 'E']);
    expect(final.find((e) => e.id === 'C')?.padre_id).toBe('G');
  });

  it('varios a la vez en estrella: cada uno sale directo del destino', () => {
    const base = serie();
    const final = aplicar(base, planDeMovimientoVarios(base, ['C', 'D', 'E'], 'G', 'estrella'));
    expect(lineaPrincipal(final).map((e) => e.id)).toEqual(['A', 'B', 'F', 'G']);
    expect(final.filter((e) => e.padre_id === 'G').sort((a, b) => a.orden - b.orden).map((e) => e.id)).toEqual(['C', 'D', 'E']);
  });

  it('varios a la vez antes y después de un dispositivo de la línea', () => {
    const base = serie();
    const antes = aplicar(base, planDeMovimientoVarios(base, ['F', 'G'], 'B', 'antes'));
    expect(lineaPrincipal(antes).map((e) => e.id)).toEqual(['A', 'F', 'G', 'B', 'C', 'D', 'E']);
    const despues = aplicar(base, planDeMovimientoVarios(base, ['A', 'B'], 'E', 'despues'));
    expect(lineaPrincipal(despues).map((e) => e.id)).toEqual(['C', 'D', 'E', 'A', 'B', 'F', 'G']);
  });

  it('varios a la vez: de una rama a la línea principal y no al destino mismo', () => {
    const base = [el('A', 1), el('B', 2), el('r1', 1, { padre_id: 'A' }), el('r2', 1, { padre_id: 'r1' }), el('r3', 1, { padre_id: 'r2' })];
    const final = aplicar(base, planDeMovimientoVarios(base, ['r1', 'r2'], 'B', 'despues'));
    expect(lineaPrincipal(final).map((e) => e.id)).toEqual(['A', 'B', 'r1', 'r2']);
    expect(final.find((e) => e.id === 'r3')?.padre_id).toBe('A');
    expect(() => planDeMovimientoVarios(base, ['A', 'B'], 'B', 'despues')).toThrow();
  });
});

describe('dirección escrita en el plano', () => {
  it('entiende L01D017, D17 y M-4; lo demás no', async () => {
    const { direccionDeTexto } = await import('./lazos');
    expect(direccionDeTexto('L01D017')).toBe('D017');
    expect(direccionDeTexto('d17')).toBe('D017');
    expect(direccionDeTexto('M-4')).toBe('M004');
    expect(direccionDeTexto('L01D000')).toBeNull();
    expect(direccionDeTexto('Pasillo')).toBeNull();
  });
});
