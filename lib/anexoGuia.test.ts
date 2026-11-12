import { describe, expect, it } from 'vitest';
import { anexosGuiaDeReporte, resumenCortoGuia, resumirGuia } from './anexoGuia';
import { PLANTILLAS_BASE } from './guiasPlantillas';
import type { Guia } from './guias';

const marca = { por: 'u1', nombre: 'Ana', en: '2026-11-11T10:00:00Z' };
const guia: Guia = {
  id: 'g1', nombre: 'Acceso principal', sistema: 'Control de acceso', descripcion: null, es_plantilla: false,
  cliente_id: 'c1', servicio_grupo_id: null, datos: PLANTILLAS_BASE[0].datos,
  avance: { conexiones: { 'c-alim-pos': marca, 'c-alim-neg': marca }, pruebas: { 'p-alim': { ...marca, valor: 9 } } },
  creado_por: 'u0', creado_en: '', actualizado_en: '',
};

describe('anexo de la guía al reporte', () => {
  it('resume qué se conectó, quién y qué dieron las pruebas', () => {
    const anexo = resumirGuia(guia, '2026-11-11T12:00:00Z');
    expect(anexo.conexiones[0]).toEqual({ de: 'Terminal · A1 · 12 VDC', a: 'Fuente 12 VDC · +12 V', cable: 'rojo', hecha: true, por: 'Ana' });
    expect(anexo.pruebas[0]).toMatchObject({ rango: '11 a 13 V', valor: 9, estado: 'fuera', por: 'Ana' });
    expect(anexo.pruebas[1]).toMatchObject({ valor: null, estado: 'sin-medir' });
    expect(resumenCortoGuia(anexo)).toBe('2 de 9 conexiones · 1 de 2 pruebas · 1 fuera de rango');
    expect(anexo.terminado).toBe(false);
  });

  it('lee del reporte solo lo que tiene la forma de un anexo', () => {
    const anexo = resumirGuia(guia, '2026-11-11T12:00:00Z');
    expect(anexosGuiaDeReporte([anexo, { version: 2 }, null, 'x'])).toEqual([anexo]);
    expect(anexosGuiaDeReporte(undefined)).toEqual([]);
  });
});
