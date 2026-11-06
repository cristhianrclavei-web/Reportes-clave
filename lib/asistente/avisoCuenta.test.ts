import { describe, expect, it } from 'vitest';
import { AVISO_CREDITOS, AVISO_LLAVE, avisoDeCuenta } from './avisoCuenta';

describe('aviso cuando falla la cuenta de Anthropic', () => {
  it('distingue llave vencida, falta de créditos y errores pasajeros', () => {
    expect(avisoDeCuenta(401, 'invalid x-api-key')).toBe(AVISO_LLAVE);
    expect(avisoDeCuenta(400, 'Your credit balance is too low to access the Anthropic API.')).toBe(AVISO_CREDITOS);
    expect(avisoDeCuenta(500, 'Overloaded')).toBeNull();
    expect(avisoDeCuenta(400, 'messages: field required')).toBeNull();
  });
});
