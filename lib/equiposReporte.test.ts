import { describe, it, expect } from 'vitest';
import { faltaModelo, textoEquiposAviso, EquipoFila } from '@/components/EquipoInstaladoRenglon';
import { buscarModelos } from './sugerenciasEquipos';

const fila = (f: Partial<EquipoFila>): EquipoFila => ({ cant: '', desc: '', modelo: '', marca: '', serie: '', ...f });

describe('equipo del reporte', () => {
  it('pide modelo solo en renglones con datos', () => {
    expect(faltaModelo(fila({}))).toBe(false);
    expect(faltaModelo(fila({ desc: 'Fuente' }))).toBe(true);
    expect(faltaModelo(fila({ desc: 'Fuente', sinModelo: true }))).toBe(false);
    expect(faltaModelo(fila({ desc: 'Fuente', modelo: 'PS-12' }))).toBe(false);
  });

  it('resume el equipo para el aviso a supervisión', () => {
    expect(textoEquiposAviso([fila({})])).toBe('');
    expect(textoEquiposAviso([fila({ cant: '2', modelo: 'A' }), fila({ modelo: 'B' })])).toBe(' · 3 equipos (A, B)');
    const muchos = ['A', 'B', 'C', 'D'].map((m) => fila({ cant: '1', modelo: m }));
    expect(textoEquiposAviso(muchos)).toBe(' · 4 equipos (A, B, C…)');
  });

  it('sugiere modelos por modelo, marca o descripción', () => {
    const lista = [
      { modelo: 'DS-2CD1043G2', marca: 'HIKVISION', descripcion: 'Bala IP', imagen: null, enlace: null, veces: 3 },
      { modelo: 'PS-12', marca: 'EPCOM', descripcion: 'Fuente de poder', imagen: null, enlace: null, veces: 1 },
    ];
    expect(buscarModelos(lista, 'fuente').map((m) => m.modelo)).toEqual(['PS-12']);
    expect(buscarModelos(lista, 'ds-2').map((m) => m.modelo)).toEqual(['DS-2CD1043G2']);
    expect(buscarModelos(lista, 'd')).toEqual([]);
  });
});
