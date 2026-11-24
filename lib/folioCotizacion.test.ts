import { describe, expect, it } from 'vitest';
import { armarFolio, folioActualizado, siglasDeSistema, siguienteNumero } from './folioCotizacion';

describe('folio de cotización', () => {
  it('siglas por palabra clave, con o sin acentos y mayúsculas', () => {
    expect(siglasDeSistema('CCTv')).toBe('CCTV');
    expect(siglasDeSistema('Mantenimiento correctivo CCTV')).toBe('CCTV');
    expect(siglasDeSistema('Alarma & Detección de Humo')).toBe('DH');
    expect(siglasDeSistema('Alarma de Intrusión')).toBe('ALM');
    expect(siglasDeSistema('CDA - Equipo central')).toBe('CA');
    expect(siglasDeSistema('Paneles Solares - En red')).toBe('FV');
    expect(siglasDeSistema('Bombeo hidráulico')).toBe('BOMB');
    expect(siglasDeSistema('General')).toBeNull();
  });

  it('número a dos dígitos que crece solo, siglas sin repetir', () => {
    expect(armarFolio(7, ['CCTV'])).toBe('COT-07-CCTV');
    expect(armarFolio(51, ['CCTV', 'CCTV'])).toBe('COT-51-CCTV');
    expect(armarFolio(100, ['CCTV', 'Detección de humo'])).toBe('COT-100-CCTV-DH');
    expect(armarFolio(1000, ['CCTV', 'Alarma de Intrusión', 'Control de Acceso'])).toBe('COT-1000-VARIOS');
    expect(armarFolio(52, ['General'])).toBe('COT-52');
  });

  it('el siguiente número sale del mayor, mezclando folios viejos y nuevos', () => {
    expect(siguienteNumero(['COT-0049', 'COT-0050', 'COT-51-CCTV'])).toBe(52);
    expect(siguienteNumero([])).toBe(1);
  });

  it('al editar cambia las siglas pero no el número; los viejos no se tocan', () => {
    expect(folioActualizado('COT-51-CCTV', ['CCTV', 'Detección de humo'])).toBe('COT-51-CCTV-DH');
    expect(folioActualizado('COT-0049', ['CCTV'])).toBe('COT-0049');
  });
});
