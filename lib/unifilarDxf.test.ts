import { describe, expect, it } from 'vitest';
import { exportarUnifilarDxf, trazoAPuntos } from './unifilarDxf';
import { plantilla } from './unifilar';

describe('unifilar a DXF', () => {
  it('curvas a polilíneas', () => {
    const [f] = trazoAPuntos('M0 0 C4 -8 8 -8 12 0', 10, 10);
    expect(f.puntos).toHaveLength(13);
    expect(f.puntos[12]).toEqual([22, 10]);
  });

  it('arma un DXF con capas y entidades', () => {
    let n = 0;
    const texto = new TextDecoder('latin1').decode(exportarUnifilarDxf(plantilla('interconectado', () => `d${n++}`)));
    expect(texto).toContain('FV-UNIFILAR');
    expect(texto).toContain('FV-TIERRA');
    expect(texto).toContain('POLYLINE');
    expect(texto).toContain('kWh');
    expect(texto.trim().endsWith('EOF')).toBe(true);
  });
});
