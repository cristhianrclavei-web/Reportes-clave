import { describe, expect, it } from 'vitest';
import { aplicaAnexo } from './anexosPorSistema';

describe('anexos según el sistema del reporte', () => {
  it('la falla a tierra solo aplica en detección o supresión', () => {
    expect(aplicaAnexo('fallaTierra', ['CCTV', 'Alarma&Det'])).toBe(true);
    expect(aplicaAnexo('fallaTierra', ['Supresión'])).toBe(true);
    expect(aplicaAnexo('fallaTierra', ['Paneles solares'])).toBe(false);
    expect(aplicaAnexo('fallaTierra', [])).toBe(false);
  });
});
