import { describe, expect, it } from 'vitest';
import { separarTipos, textoTiposServicio, tieneTipo, unirTipos } from './tiposServicio';

describe('tipos de servicio', () => {
  it('lee un solo tipo (reportes viejos) y varios', () => {
    expect(separarTipos('Mantenimiento')).toEqual(['Mantenimiento']);
    expect(separarTipos('Instalación nueva, Mantenimiento')).toEqual(['Instalación nueva', 'Mantenimiento']);
    expect(separarTipos(null)).toEqual([]);
  });

  it('une la lista y deja null si no hay ninguno', () => {
    expect(unirTipos(['Correctivo', 'Preventivo'])).toBe('Correctivo, Preventivo');
    expect(unirTipos([])).toBeNull();
  });

  it('encuentra un tipo dentro de la lista', () => {
    expect(tieneTipo('Correctivo, Preventivo', 'Preventivo')).toBe(true);
    expect(tieneTipo('Correctivo', 'Preventivo')).toBe(false);
  });
});

describe('textoTiposServicio', () => {
  it('arma el texto con cada mantenimiento y el «Otro» especificado', () => {
    expect(textoTiposServicio('Instalación nueva, Mantenimiento, Otro', 'Correctivo, Preventivo', 'Poda'))
      .toBe('Instalación nueva · Mantenimiento correctivo · Mantenimiento preventivo · Otro: Poda');
    expect(textoTiposServicio('Mantenimiento', null)).toBe('Mantenimiento');
    expect(textoTiposServicio(null, null)).toBe('');
  });
});
