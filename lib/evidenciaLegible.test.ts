import { describe, it, expect } from 'vitest';
import { fotoEnMemoria, separarEvidenciasIlegibles, avisoEvidenciasIlegibles, esErrorDeLectura, textoDeError } from './evidenciaLegible';

// Imita un archivo al que Android ya le quitó el permiso de lectura.
function archivoIlegible(): File {
  const archivo = new File(['x'], 'rota.jpg', { type: 'image/jpeg' });
  const fallar = () => Promise.reject(new DOMException('The requested file could not be read', 'NotReadableError'));
  archivo.arrayBuffer = fallar;
  archivo.slice = () => ({ arrayBuffer: fallar }) as unknown as Blob;
  return archivo;
}

describe('fotoEnMemoria', () => {
  it('regresa una copia con el mismo contenido', async () => {
    const original = new File(['hola'], 'foto.jpg', { type: 'image/jpeg' });
    const copia = await fotoEnMemoria(original);
    expect(copia).not.toBe(original);
    expect(copia.name).toBe('foto.jpg');
    expect(await copia.text()).toBe('hola');
  });

  it('falla si el archivo no se puede leer', async () => {
    await expect(fotoEnMemoria(archivoIlegible())).rejects.toThrow();
  });
});

describe('separarEvidenciasIlegibles', () => {
  it('aparta las ilegibles y dice su número en la lista', async () => {
    const buena = new File(['a'], 'a.jpg');
    const evidencias = [
      { file: buena },
      { file: archivoIlegible() },
      { file: buena, video: archivoIlegible() },
      { file: buena, video: buena },
    ];
    const resultado = await separarEvidenciasIlegibles(evidencias);
    expect(resultado.legibles).toEqual([evidencias[0], evidencias[3]]);
    expect(resultado.numerosIlegibles).toEqual([2, 3]);
  });
});

describe('mensajes', () => {
  it('no avisa nada si todas se leyeron', () => {
    expect(avisoEvidenciasIlegibles([])).toBe('');
    expect(avisoEvidenciasIlegibles([3])).toContain('La evidencia 3');
    expect(avisoEvidenciasIlegibles([1, 4])).toContain('Las evidencias 1, 4');
  });

  it('traduce el error de lectura y deja pasar los demás', () => {
    const lectura = new DOMException('The requested file could not be read, typically due to permission problems', 'NotReadableError');
    expect(esErrorDeLectura(lectura)).toBe(true);
    expect(textoDeError(lectura, 'x')).toContain('vuelve a tomarla');
    expect(textoDeError(new Error('sin red'), 'x')).toBe('sin red');
    expect(textoDeError(null, 'error de conexión')).toBe('error de conexión');
  });
});
