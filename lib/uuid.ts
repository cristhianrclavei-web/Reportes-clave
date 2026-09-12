// crypto.randomUUID() solo existe en contextos seguros (HTTPS o localhost).
// Al abrir la app desde el celular por IP local (http://192.168.x.x:3000),
// o en navegadores Android antiguos, esa función NO existe y rompe el
// guardado. Este helper la usa cuando está disponible y si no genera un
// UUID v4 válido con getRandomValues, o con Math.random como último recurso.
export function generarUUID(): string {
  const c: any = typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined;

  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  // Marcas de versión 4 y variante RFC 4122
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, '0'));

  return (
    hex.slice(0, 4).join('') + '-' +
    hex.slice(4, 6).join('') + '-' +
    hex.slice(6, 8).join('') + '-' +
    hex.slice(8, 10).join('') + '-' +
    hex.slice(10, 16).join('')
  );
}
