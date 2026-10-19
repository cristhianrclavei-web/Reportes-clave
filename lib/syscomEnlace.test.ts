import { describe, it, expect } from 'vitest';
import { idProductoDeEnlace } from './syscomEnlace';

describe('idProductoDeEnlace', () => {
  it('saca el número de los enlaces de SYSCOM', () => {
    expect(idProductoDeEnlace('https://www.syscom.mx/producto/ds-2cd1043g2-liuf-hikvision-213930.html')).toBe('213930');
    expect(idProductoDeEnlace('https://www.syscom.mx/productosinfo/210684')).toBe('210684');
    expect(idProductoDeEnlace(' https://syscom.mx/producto/213930/?ref=x ')).toBe('213930');
  });
  it('ignora otros sitios y textos que no son enlace', () => {
    expect(idProductoDeEnlace('https://www.amazon.com.mx/dp/213930')).toBeNull();
    expect(idProductoDeEnlace('https://syscom.mx.ejemplo.com/producto/213930')).toBeNull();
    expect(idProductoDeEnlace('camara 213930')).toBeNull();
    expect(idProductoDeEnlace('https://www.syscom.mx/')).toBeNull();
  });
});
