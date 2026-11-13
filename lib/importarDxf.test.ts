import { describe, expect, it } from 'vitest';
import { leerDxf } from './leerDxf';
import { bloquesDelDxf, etapaDeCapa, importarDispositivos, pareceDireccion, pasarAHoja, sinImportados, tipoSugerido } from './importarDxf';

function dxf(entidades: (string | number)[][]): string {
  const bloque = (nombre: string) => [0, 'BLOCK', 8, '0', 2, nombre, 70, 0, 10, 0, 20, 0, 0, 'CIRCLE', 8, '0', 10, 0, 20, 0, 40, 0.5, 0, 'ENDBLK'];
  return [
    '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER',
    '0', 'LAYER', '2', 'SIMB', '70', '0', '62', '7',
    '0', 'LAYER', '2', 'Apagada', '70', '0', '62', '-7',
    '0', 'ENDTAB', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'BLOCKS', ...[bloque('DET-PHOTO'), bloque('EMAN'), bloque('SILLA')].flat().map(String), '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES', ...entidades.flat().map(String), '0', 'ENDSEC', '0', 'EOF',
  ].join('\n');
}
const insertar = (nombre: string, x: number, y: number, extra: (string | number)[] = [], capa = 'SIMB') => [0, 'INSERT', 8, capa, 2, nombre, 10, x, 20, y, ...extra];
const texto = (t: string, x: number, y: number) => [0, 'TEXT', 8, 'TXT', 10, x, 20, y, 40, 0.3, 1, t];

describe('pasar dispositivos del DXF a la app', () => {
  it('sugiere el tipo por el nombre del bloque (y reconoce los que exporta la app)', () => {
    expect(tipoSugerido('DET-PHOTO')).toBe('SH');
    expect(tipoSugerido('DET CALOR')).toBe('SC');
    expect(tipoSugerido('EMAN')).toBe('EMA');
    expect(tipoSugerido('FA_MM')).toBe('MM');
    // Nombres de la simbología de Clave.
    expect(tipoSugerido('SIRENA')).toBe('SE');
    expect(tipoSugerido('MOD-CONTROL')).toBe('MC');
    expect(tipoSugerido('EST-ABORTO')).toBe('EA');
    expect(tipoSugerido('topes')).toBeNull();
  });

  it('reconoce direcciones pero no números de cuarto', () => {
    expect(pareceDireccion('L01D017')).toBe(true);
    expect(pareceDireccion('1-045')).toBe(true);
    expect(pareceDireccion('04')).toBe(false);
    expect(pareceDireccion('PASILLO')).toBe(false);
  });

  it('cada dirección va a su equipo más cercano, respetando D detector y M módulo', () => {
    const leido = leerDxf(dxf([
      insertar('DET-PHOTO', 10, 10),
      insertar('EMAN', 11, 10, [50, 90]),
      insertar('SILLA', 30, 30),
      insertar('DET-PHOTO', 50, 50, [], 'Apagada'),
      // El M queda más cerca del detector, pero es del módulo.
      texto('L01M004', 9.6, 9.2),
      texto('L01D001', 9.2, 10.8),
      texto('04', 10, 11),
    ]));
    expect(bloquesDelDxf(leido).map((b) => b.nombre)).toEqual(['DET-PHOTO', 'EMAN', 'SILLA']);
    let n = 0;
    const r = importarDispositivos(leido, new Map([['DET-PHOTO', 'SH'], ['EMAN', 'EMA']]), () => `e${++n}`);
    expect(r.equipos.map((e) => [e.tipo, e.etiqueta])).toEqual([['SH', 'L01D001'], ['EMA', 'L01M004']]);
    // AutoCAD 90° (contra las manecillas) = 270° en la app.
    expect(r.equipos[1].rotacion).toBe(270);
    expect(r.conDireccion).toBe(2);
    // Se quitan del fondo los 2 bloques y las 2 direcciones; la silla y el «04» se quedan.
    expect(sinImportados(leido, r.usadas).entidades.map((e) => e.tipo)).toEqual(['INSERT', 'INSERT', 'TEXT']);
  });

  it('un texto lejano no se toma como dirección', () => {
    const leido = leerDxf(dxf([insertar('DET-PHOTO', 0, 0), texto('L01D009', 20, 0)]));
    const r = importarDispositivos(leido, new Map([['DET-PHOTO', 'SH']]), () => 'x');
    expect(r.equipos[0].etiqueta).toBeNull();
  });

  it('pasa del dibujo a la hoja con el tamaño que tenía', () => {
    // Hoja de 1100 de ancho: símbolo normal de 10. El del dibujo mide 0.5 → 5 en la hoja → la mitad.
    const [e] = pasarAHoja([{ id: 'a', tipo: 'SH', x: 2110, y: 950, medida: 0.5 }], { x0: 2100, y1: 970, k: 0.1 }, { ancho: 1100, alto: 500 });
    expect(e.x).toBeCloseTo(100);
    expect(e.y).toBeCloseTo(200);
    expect(e.tamano).toBe(0.5);
    expect('medida' in e).toBe(false);
  });

  it('toma la etapa de la capa del bloque o de la zona dibujada que lo encierra', () => {
    expect(etapaDeCapa('DH-ETAPA 2')).toBe(2);
    expect(etapaDeCapa('etapa_04')).toBe(4);
    expect(etapaDeCapa('DH-SIMBOLOGIA')).toBeNull();
    // Zona de la etapa 3: un cuadro de (0,0) a (10,10) como polilínea cerrada.
    const zona = [0, 'LWPOLYLINE', 8, 'DH-ETAPA 3', 90, 4, 70, 1, 10, 0, 20, 0, 10, 10, 20, 0, 10, 10, 20, 10, 10, 0, 20, 10];
    const leido = leerDxf(dxf([
      zona,
      insertar('DET-PHOTO', 5, 5),
      insertar('DET-PHOTO', 50, 50),
      insertar('DET-PHOTO', 80, 80, [], 'DH-ETAPA 1'),
    ]));
    let n = 0;
    const { equipos } = importarDispositivos(leido, new Map([['DET-PHOTO', 'SH']]), () => `e${++n}`);
    expect(equipos.map((e) => e.etapa)).toEqual([3, null, 1]);
  });
});
