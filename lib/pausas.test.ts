import { describe, it, expect } from 'vitest';
import {
  AJUSTES_POR_DEFECTO, limiteDePausa, estadoPausa, avisoQueToca, fueraDeSitio, distanciaTexto, minutosTexto,
  resultadoVerificacion, textoTipoPausa, resumenPausas, EventoPausa,
} from './pausas';

const desde = '2026-10-09T19:00:00.000Z';
const a = (min: number) => new Date(desde).getTime() + min * 60000;

describe('limiteDePausa', () => {
  it('la comida usa el tiempo configurado', () => {
    expect(limiteDePausa('comida', { ...AJUSTES_POR_DEFECTO, comida_min: 45 })).toBe(45);
  });
  it('la salida por material usa lo que el técnico estimó', () => {
    expect(limiteDePausa('material', AJUSTES_POR_DEFECTO, 50)).toBe(50);
    expect(limiteDePausa('material', AJUSTES_POR_DEFECTO)).toBe(30);
    expect(limiteDePausa('material', AJUSTES_POR_DEFECTO, 900)).toBe(240);
  });
  it('las demás usan el tiempo de otras pausas', () => {
    expect(limiteDePausa('otro', AJUSTES_POR_DEFECTO)).toBe(30);
  });
});

describe('estadoPausa', () => {
  it('va normal, por terminar, terminada y excedida', () => {
    expect(estadoPausa(desde, 60, a(20), 15)).toMatchObject({ transcurridos: 20, restantes: 40, excedidos: 0, nivel: 'normal' });
    expect(estadoPausa(desde, 60, a(52), 15)).toMatchObject({ restantes: 8, nivel: 'por_terminar' });
    expect(estadoPausa(desde, 60, a(60), 15)).toMatchObject({ restantes: 0, excedidos: 0, nivel: 'terminada' });
    expect(estadoPausa(desde, 60, a(70), 15)).toMatchObject({ excedidos: 10, nivel: 'terminada' });
    expect(estadoPausa(desde, 60, a(75), 15)).toMatchObject({ excedidos: 15, nivel: 'excedida' });
  });
  it('sin límite nunca se excede', () => {
    expect(estadoPausa(desde, null, a(300), 15).nivel).toBe('normal');
  });
  it('una pausa corta no avisa «por terminar» desde el inicio', () => {
    expect(estadoPausa(desde, 15, a(6), 15).nivel).toBe('normal');
  });
  it('sin tolerancia, pasa directo a excedida al primer minuto de más', () => {
    expect(estadoPausa(desde, 60, a(60), 0).nivel).toBe('terminada');
    expect(estadoPausa(desde, 60, a(61), 0).nivel).toBe('excedida');
  });
});

describe('avisoQueToca', () => {
  it('manda cada aviso una sola vez y nunca retrocede', () => {
    const porTerminar = estadoPausa(desde, 60, a(52), 15);
    expect(avisoQueToca(porTerminar, 0)).toBe(1);
    expect(avisoQueToca(porTerminar, 1)).toBeNull();
    expect(avisoQueToca(estadoPausa(desde, 60, a(61), 15), 1)).toBe(2);
    expect(avisoQueToca(estadoPausa(desde, 60, a(61), 15), 2)).toBeNull();
    expect(avisoQueToca(estadoPausa(desde, 60, a(80), 15), 2)).toBe(3);
    expect(avisoQueToca(estadoPausa(desde, 60, a(200), 15), 3)).toBeNull();
  });
  it('si el cron se atrasó, manda solo el más avanzado', () => {
    expect(avisoQueToca(estadoPausa(desde, 60, a(90), 15), 0)).toBe(3);
  });
  it('en tiempo normal no manda nada', () => {
    expect(avisoQueToca(estadoPausa(desde, 60, a(10), 15), 0)).toBeNull();
  });
});

describe('fueraDeSitio', () => {
  it('la imprecisión del GPS juega a favor', () => {
    expect(fueraDeSitio(150, 0, 120)).toBe(false);
    expect(fueraDeSitio(260, 0, 120)).toBe(true);
    expect(fueraDeSitio(260, 90, 120)).toBe(false);
    expect(fueraDeSitio(1800, 40, 120)).toBe(true);
  });
});

describe('textos', () => {
  it('distancia y minutos', () => {
    expect(distanciaTexto(456)).toBe('460 m');
    expect(distanciaTexto(1840)).toBe('1.8 km');
    expect(distanciaTexto(23400)).toBe('23 km');
    expect(minutosTexto(45)).toBe('45 min');
    expect(minutosTexto(60)).toBe('1 h');
    expect(minutosTexto(65)).toBe('1 h 05 min');
  });
  it('tipo de pausa desconocido', () => {
    expect(textoTipoPausa('comida')).toBe('Comida');
    expect(textoTipoPausa(null)).toBe('Pausa');
  });
});

describe('resultadoVerificacion', () => {
  it('pendiente vencida cuenta como sin respuesta', () => {
    const v = { resultado: 'pendiente' as const, vence_en: '2026-10-09T19:10:00.000Z' };
    expect(resultadoVerificacion(v, a(5))).toBe('pendiente');
    expect(resultadoVerificacion(v, a(10))).toBe('sin_respuesta');
    expect(resultadoVerificacion({ ...v, resultado: 'en_sitio' }, a(30))).toBe('en_sitio');
  });
});

describe('resumenPausas', () => {
  const ev = (o: Partial<EventoPausa>): EventoPausa => ({
    tipo: 'reanudacion', pausa_tipo: 'comida', minutos: 60, limite_min: 60, fuera_sitio: false, created_by: 'a', nombre: 'Ana', ...o,
  });
  it('promedia la comida y cuenta excesos solo pasada la tolerancia', () => {
    const r = resumenPausas([ev({ minutos: 55 }), ev({ minutos: 70 }), ev({ minutos: 85 })], 15);
    expect(r).toEqual([{ id: 'a', nombre: 'Ana', comidas: 3, comidaPromedio: 70, excedidas: 1, fuera: 0 }]);
  });
  it('cuenta salidas y reanudaciones fuera del sitio, y ordena primero a quien más tiene', () => {
    const r = resumenPausas([
      ev({ created_by: 'b', nombre: 'Beto' }),
      ev({ tipo: 'salida_sitio', pausa_tipo: null, minutos: null, limite_min: null, fuera_sitio: true }),
      ev({ pausa_tipo: 'material', minutos: 20, limite_min: 30, fuera_sitio: true }),
    ], 15);
    expect(r.map((p) => [p.nombre, p.comidas, p.fuera])).toEqual([['Ana', 0, 2], ['Beto', 1, 0]]);
  });
  it('ignora pausas viejas sin tipo y eventos sin autor', () => {
    expect(resumenPausas([ev({ pausa_tipo: null }), ev({ created_by: null })], 15)).toEqual([]);
  });
});
