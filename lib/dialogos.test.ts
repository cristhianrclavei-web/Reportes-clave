import { describe, it, expect } from 'vitest';
import { partesDelTexto, verboDe, esDelicado } from './dialogos';

describe('partesDelTexto', () => {
  it('la pregunta es el título y lo demás el detalle', () => {
    expect(partesDelTexto('¿Borrar «X»?\n\nSolo se borra el tuyo.')).toEqual({ titulo: '¿Borrar «X»?', detalle: 'Solo se borra el tuyo.' });
  });
  it('aviso antes de la pregunta', () => {
    expect(partesDelTexto('Esta acción es PERMANENTE. ¿Confirmar eliminación?')).toEqual({ titulo: '¿Confirmar eliminación?', detalle: 'Esta acción es PERMANENTE.' });
  });
  it('detalle después de la pregunta en el mismo renglón', () => {
    expect(partesDelTexto('¿Borrar «doc»? No se puede deshacer.')).toEqual({ titulo: '¿Borrar «doc»?', detalle: 'No se puede deshacer.' });
  });
  it('error con motivo', () => {
    expect(partesDelTexto('No se pudo eliminar: sin conexión')).toEqual({ titulo: 'No se pudo eliminar', detalle: 'sin conexión' });
  });
});

describe('verboDe y esDelicado', () => {
  it('toma el verbo de la pregunta', () => {
    expect(verboDe('¿Quitar este sistema?')).toBe('Quitar');
    expect(verboDe('¿Es correcto?')).toBeNull();
  });
  it('borrar y eliminar son delicados; marcar no', () => {
    expect(esDelicado('¿Eliminar la cotización?')).toBe(true);
    expect(esDelicado('¿Autorizar la corrección?')).toBe(false);
    expect(esDelicado('Se quitarán las marcas. No se puede deshacer.')).toBe(true);
  });
});
