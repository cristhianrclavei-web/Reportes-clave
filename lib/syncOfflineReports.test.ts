import { describe, it, expect } from 'vitest';
import { esRechazoDefinitivo, yaEstabaSubido } from './syncOfflineReports';

describe('esRechazoDefinitivo', () => {
  it('reconoce tipo o tamaño no permitido', () => {
    expect(esRechazoDefinitivo({ statusCode: '415', message: 'mime type application/x-msdownload is not supported' })).toBe(true);
    expect(esRechazoDefinitivo({ statusCode: '413', message: 'The object exceeded the maximum allowed size' })).toBe(true);
    expect(esRechazoDefinitivo({ message: 'mime type text/html is not supported' })).toBe(true);
  });
  it('un fallo de red o de sesión no es definitivo: se reintenta', () => {
    expect(esRechazoDefinitivo({ message: 'Failed to fetch' })).toBe(false);
    expect(esRechazoDefinitivo({ statusCode: '401', message: 'jwt expired' })).toBe(false);
    expect(esRechazoDefinitivo({ statusCode: '500', message: 'Internal Server Error' })).toBe(false);
    expect(esRechazoDefinitivo(null)).toBe(false);
  });
});

describe('yaEstabaSubido', () => {
  it('un archivo que ya existe cuenta como subido', () => {
    expect(yaEstabaSubido({ statusCode: '409', message: 'The resource already exists' })).toBe(true);
    expect(yaEstabaSubido({ message: 'Failed to fetch' })).toBe(false);
  });
});
