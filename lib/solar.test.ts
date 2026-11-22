import { describe, expect, it } from 'vitest';
import {
  consumoAnual, diasHabilesDesde, dimensionar, documentosRequeridos, precioKwh, precioPromedio,
} from './solar';
import { etapasDe, etapaValida, nombreEtapa, siguienteEtapa, sistemaDeTexto } from './proyectosEtapas';

const recibo = (kwh: number, importe: number, extra: Partial<{ fecha_inicio: string; fecha_fin: string; precio_kwh_manual: number | null }> = {}) => ({
  kwh, importe, fecha_inicio: extra.fecha_inicio ?? null, fecha_fin: extra.fecha_fin ?? null, precio_kwh_manual: extra.precio_kwh_manual ?? null,
});

describe('recibos', () => {
  it('precio del kWh de cada recibo: importe ÷ kWh, o el capturado', () => {
    expect(precioKwh(recibo(500, 1500))).toBe(3);
    expect(precioKwh(recibo(500, 1500, { precio_kwh_manual: 2.5 }))).toBe(2.5);
    expect(precioKwh(recibo(0, 100))).toBeNull();
  });

  it('consumo anual: sin fechas supone bimestres; con fechas lleva a 365 días', () => {
    expect(consumoAnual([recibo(2000, 0), recibo(2000, 0)])).toBeCloseTo((4000 / 120) * 365);
    expect(consumoAnual([recibo(1000, 0, { fecha_inicio: '2026-01-01', fecha_fin: '2026-01-30' })])).toBeCloseTo((1000 / 30) * 365);
  });

  it('precio promedio pesado por consumo', () => {
    expect(precioPromedio([recibo(100, 100), recibo(300, 900)])).toBeCloseTo(2.5);
  });
});

describe('dimensionar', () => {
  it('kWp, módulos, ahorro y retorno', () => {
    const recibos = Array.from({ length: 6 }, () => recibo(2000, 6000)); // 12,000 kWh al año a $3
    const d = dimensionar({ hsp: 5.5, factor_perdidas: 0.8, modulo_w: 550, modulos: null, cobertura_pct: 100, costo_sistema: 150000 }, recibos);
    expect(d.consumoAnual).toBeCloseTo(12166.7, 0);
    expect(d.kwpNecesario).toBeCloseTo(12166.7 / (5.5 * 365 * 0.8), 2);
    expect(d.modulos).toBe(14);
    expect(d.kwp).toBeCloseTo(7.7);
    expect(d.ahorroAnual).toBeCloseTo(d.consumoAnual * 3, 0);
    expect(d.retornoAnos).toBeCloseTo(150000 / d.ahorroAnual);
  });

  it('lo que se produce de más no cuenta como ahorro', () => {
    const d = dimensionar({ hsp: 5.5, factor_perdidas: 0.8, modulo_w: 550, modulos: 40, cobertura_pct: 100, costo_sistema: null }, [recibo(1000, 3000)]);
    expect(d.ahorroAnual).toBeCloseTo(d.consumoAnual * 3);
    expect(d.retornoAnos).toBeNull();
  });
});

describe('trámite', () => {
  it('días hábiles sin fines de semana', () => {
    // Viernes 20 al viernes 27 de noviembre de 2026: 5 días hábiles.
    expect(diasHabilesDesde('2026-11-20', '2026-11-27')).toBe(5);
    expect(diasHabilesDesde('2026-11-27', '2026-11-20')).toBe(0);
  });

  it('persona moral pide acta y poder; los dos piden unifilar', () => {
    const moral = documentosRequeridos('moral').map((d) => d.tipo);
    expect(moral).toContain('acta');
    expect(documentosRequeridos('fisica').map((d) => d.tipo)).not.toContain('acta');
    expect(moral).toContain('unifilar');
  });
});

describe('etapas', () => {
  it('el trámite de CFE solo aparece con solar y «Terminado» se llama «Interconectado»', () => {
    expect(etapasDe(['cctv'])).not.toContain('tramite_cfe');
    expect(etapasDe(['solar'])).toEqual(['prospecto', 'cotizado', 'vendido', 'instalacion', 'tramite_cfe', 'terminado']);
    expect(nombreEtapa('terminado', ['solar'])).toBe('Interconectado');
    expect(nombreEtapa('terminado', ['cctv'])).toBe('Terminado');
    expect(siguienteEtapa('instalacion', ['cctv'])).toBe('terminado');
    expect(siguienteEtapa('instalacion', ['solar'])).toBe('tramite_cfe');
    expect(etapaValida('tramite_cfe', ['cctv'])).toBe('instalacion');
  });

  it('texto libre de sistemas a su clave', () => {
    expect(sistemaDeTexto('Alarma & Detección de Humo')).toBe('deteccion');
    expect(sistemaDeTexto('Paneles Solares')).toBe('solar');
    expect(sistemaDeTexto('Alarma de Intrusión')).toBe('intrusion');
    expect(sistemaDeTexto('Control de Acceso Vehicular')).toBe('acceso');
    expect(sistemaDeTexto('Automatización')).toBe('otro');
  });
});
