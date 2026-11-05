import { describe, expect, it } from 'vitest';
import { anexosDeReporte, huboActividadEl, resumirBusqueda } from './anexoFallaTierra';
import { Corte, Elemento, Falla, Lazo } from './lazos';

const lazo: Lazo = {
  id: 'L', cliente_id: 'C', tipo: 'deteccion', codigo: 'LZ1', nombre: 'Nivel -2', numero: 1,
  clase: 'B', panel: 'NFS2-640', notas: null, creado_en: '2026-11-01T00:00:00Z',
};

function el(id: string, orden: number, extra: Partial<Elemento> = {}): Elemento {
  return { id, lazo_id: 'L', padre_id: null, orden, tipo: 'SH', nombre: `SH_${id}`, direccion: `D${orden}`, ubicacion: null, foto_path: null, ...extra };
}

// Línea de 8 dispositivos.
const elementos = Array.from({ length: 8 }, (_, i) => el(`p${i + 1}`, i + 1));

function corte(id: string, elementoId: string, lado: 'panel' | 'campo', hora: string): Corte {
  return { id, falla_id: 'F', elemento_id: elementoId, lado, medicion: null, notas: null, creado_en: `2026-11-04T${hora}:00Z` };
}

describe('resumen de la búsqueda de falla a tierra', () => {
  it('repite los cortes: qué se sugería, si se siguió y cuánto quedaba', () => {
    const falla: Falla = { id: 'F', lazo_id: 'L', estado: 'abierta', elemento_id: null, causa: null, abierta_en: '2026-11-04T16:00:00Z', resuelta_en: null };
    const cortes = [corte('c2', 'p6', 'panel', '17:00'), corte('c1', 'p4', 'campo', '16:30')];
    const r = resumirBusqueda(lazo, elementos, falla, cortes, '2026-11-04T18:00:00Z');

    expect(r.cortes.map((c) => c.donde?.direccion)).toEqual(['L01D004', 'L01D006']);
    expect(r.cortes[0].sugerido?.nombre).toBe('SH_p4');
    expect(r.cortes[0].siguioSugerencia).toBe(true);
    expect(r.cortes[0].quedan).toBe(4);
    expect(r.cortes[0].tramo).toBe('posiciones 5 a 8');
    // Después de p4 la mitad de 5..8 es p6: también se siguió.
    expect(r.cortes[1].siguioSugerencia).toBe(true);
    expect(r.final).toEqual({ quedan: 2, tramo: 'posiciones 5 a 6', contradictorio: false, siguiente: expect.objectContaining({ nombre: 'SH_p5' }) });
    expect(r.lazo.circuito).toBe('Lazo de detección');
  });

  it('una búsqueda cerrada no sugiere siguiente corte y dice dónde se encontró', () => {
    const falla: Falla = { id: 'F', lazo_id: 'L', estado: 'resuelta', elemento_id: 'p5', causa: 'Agua', abierta_en: '2026-11-04T16:00:00Z', resuelta_en: '2026-11-04T19:00:00Z' };
    const r = resumirBusqueda(lazo, elementos, falla, [corte('c1', 'p4', 'campo', '16:30')], '2026-11-04T19:00:00Z');
    expect(r.final.siguiente).toBeNull();
    expect(r.encontrada?.direccion).toBe('L01D005');
    expect(r.encontrada?.lugar).toBe('Pos. 5');
  });

  it('detecta actividad en el día del reporte en hora de México', () => {
    const falla: Falla = { id: 'F', lazo_id: 'L', estado: 'abierta', elemento_id: null, causa: null, abierta_en: '2026-11-03T16:00:00Z', resuelta_en: null };
    // 02:00 UTC del 5 = 20:00 del 4 en México.
    const r = resumirBusqueda(lazo, elementos, falla, [{ ...corte('c1', 'p4', 'campo', '00:00'), creado_en: '2026-11-05T02:00:00Z' }], 'x');
    expect(huboActividadEl(r, '2026-11-04')).toBe(true);
    expect(huboActividadEl(r, '2026-11-05')).toBe(false);
  });

  it('ignora anexos con otra forma', () => {
    expect(anexosDeReporte(null)).toEqual([]);
    expect(anexosDeReporte([{ version: 2 }, 'x'])).toEqual([]);
  });
});
