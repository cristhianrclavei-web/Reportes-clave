import { describe, expect, it } from 'vitest';
import { agruparPorSistema } from './cotizaciones';

describe('agruparPorSistema', () => {
  it('separa dos sistemas con el mismo nombre y distinto título', () => {
    const lineas = [
      { sistema: 'CCTV', titulo_sistema: 'Respaldo de energía' },
      { sistema: 'CCTV', titulo_sistema: 'Respaldo de energía' },
      { sistema: 'CCTV', titulo_sistema: 'Póliza de mantenimiento' },
      { sistema: 'CCTV', titulo_sistema: null },
    ];
    expect(agruparPorSistema(lineas).map((g) => g.lineas.length)).toEqual([2, 1, 1]);
  });
});
