import { describe, expect, it } from 'vitest';
import { textoManejadoPor } from './manejadoPor';

describe('textoManejadoPor', () => {
  it('una sola persona se escribe sin «ida» ni «regreso»', () => {
    expect(textoManejadoPor({ manejadoPor: 'Julio' })).toBe('Julio');
    expect(textoManejadoPor({ manejadoPor: 'Julio', manejadoPorRegreso: 'Julio' })).toBe('Julio');
    expect(textoManejadoPor(null)).toBe('');
  });
  it('si al regreso manejó otra persona, salen las dos', () => {
    expect(textoManejadoPor({ manejadoPor: 'Julio', manejadoPorRegreso: 'Braulio' })).toBe('Ida: Julio · Regreso: Braulio');
    expect(textoManejadoPor({ manejadoPor: '', manejadoPorRegreso: 'Braulio' })).toBe('Regreso: Braulio');
  });
});
