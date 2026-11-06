import { describe, expect, it } from 'vitest';
import {
  Cambio, Elemento, corteSugerido, describirCambio, cortesRestantes, direccionOcupada, direccionVisible, enOrdenDeRecorrido, lineaPrincipal,
  conteoPorTipo, lazosDelMismoPanel, nombreSugerido, siguienteNumeroDeLazo, sinDireccion, normalizarDireccion, ordenEntre, posiciones, siguienteDireccion, zonaConFalla,
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

  it('cuenta por tipo y encuentra los que no tienen dirección', () => {
    const els = [
      { id: '1', tipo: 'SH', direccion: 'D1' }, { id: '2', tipo: 'SH', direccion: null },
      { id: '3', tipo: 'EMA', direccion: 'M1' }, { id: '4', tipo: 'RG', direccion: null },
    ].map((e, i) => ({ lazo_id: 'a', padre_id: null, orden: i, nombre: e.id, ubicacion: null, foto_path: null, ...e }));
    expect(conteoPorTipo(els)).toEqual([{ tipo: 'SH', cuantos: 2 }, { tipo: 'EMA', cuantos: 1 }, { tipo: 'RG', cuantos: 1 }]);
    expect(sinDireccion(els).map((e) => e.id)).toEqual(['2']);
  });
});
