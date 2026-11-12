import { describe, it, expect } from 'vitest';
import { arreglarEnlaceSyscom, enlaceDeProducto, idProductoDeEnlace } from './syscomEnlace';

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

describe('arreglarEnlaceSyscom', () => {
  it('cambia la forma que ya no abre por la que sí', () => {
    expect(arreglarEnlaceSyscom('https://www.syscom.mx/producto/231391')).toBe('https://www.syscom.mx/products/231391');
    expect(arreglarEnlaceSyscom('https://www.syscom.mx/products/producto/231391')).toBe('https://www.syscom.mx/products/231391');
    expect(enlaceDeProducto(231391)).toBe('https://www.syscom.mx/products/231391');
  });
  it('deja igual los enlaces buenos y los de otros sitios', () => {
    const conNombre = 'https://www.syscom.mx/producto/ds-2cd1043g2-liuf-hikvision-213930.html';
    expect(arreglarEnlaceSyscom(conNombre)).toBe(conNombre);
    expect(arreglarEnlaceSyscom('https://ejemplo.com/producto/123')).toBe('https://ejemplo.com/producto/123');
    expect(arreglarEnlaceSyscom('no es enlace')).toBe('no es enlace');
  });
});
