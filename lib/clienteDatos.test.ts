import { describe, it, expect } from 'vitest';
import {
  componerDireccion, datosDesdeCliente, datosClienteVacios, validarDatosCliente, filaClienteDesdeDatos, soloDigitosCP,
} from './clienteDatos';

const base = { calle: '', num_exterior: '', num_interior: '', colonia: '', codigo_postal: '', ciudad: '', estado: '' };

describe('componerDireccion', () => {
  it('arma la línea completa en orden', () => {
    expect(componerDireccion({
      calle: 'Tejedores', num_exterior: '578', num_interior: '2', colonia: 'La Paz',
      codigo_postal: '44860', ciudad: 'Guadalajara', estado: 'Jalisco',
    })).toBe('Tejedores 578 Int. 2, Col. La Paz, C.P. 44860, Guadalajara, Jalisco');
  });

  it('omite lo que está vacío, sin comas sobrantes', () => {
    expect(componerDireccion({ ...base, calle: 'Av. Vallarta', ciudad: 'Zapopan' })).toBe('Av. Vallarta, Zapopan');
    expect(componerDireccion(base)).toBe('');
  });

  it('el interior solo no deja texto colgado', () => {
    expect(componerDireccion({ ...base, num_interior: '4' })).toBe('Int. 4');
  });
});

describe('datosDesdeCliente', () => {
  it('cliente viejo: el texto libre pasa a Calle para no perderse', () => {
    const d = datosDesdeCliente({ nombre: 'Print Pack', direccion: 'Av. Industrial 450, Zona Industrial, Guadalajara' });
    expect(d.calle).toBe('Av. Industrial 450, Zona Industrial, Guadalajara');
    expect(d.tipo_persona).toBe('moral');
  });

  it('cliente con campos separados: no repite el texto libre en Calle', () => {
    const d = datosDesdeCliente({ nombre: 'Juan', tipo_persona: 'fisica', direccion: 'Tejedores 578, C.P. 44860', calle: 'Tejedores', num_exterior: '578', codigo_postal: '44860' });
    expect(d.calle).toBe('Tejedores');
    expect(d.tipo_persona).toBe('fisica');
  });

  it('sin tipo guardado se asume empresa', () => {
    expect(datosDesdeCliente({ nombre: 'X', direccion: null }).tipo_persona).toBe('moral');
  });
});

describe('validarDatosCliente', () => {
  it('pide nombre, con el mensaje según el tipo', () => {
    expect(validarDatosCliente({ ...datosClienteVacios(), tipo_persona: 'fisica' })).toBe('Falta el nombre de la persona.');
    expect(validarDatosCliente(datosClienteVacios())).toBe('Falta el nombre de la empresa.');
  });

  it('el C.P. debe tener 5 dígitos, pero es opcional', () => {
    expect(validarDatosCliente({ ...datosClienteVacios(), nombre: 'A', codigo_postal: '448' })).toBe('El C.P. debe tener 5 dígitos.');
    expect(validarDatosCliente({ ...datosClienteVacios(), nombre: 'A', codigo_postal: '44860' })).toBeNull();
    expect(validarDatosCliente({ ...datosClienteVacios(), nombre: 'A' })).toBeNull();
  });
});

describe('filaClienteDesdeDatos', () => {
  it('vacío pasa a null y arma direccion', () => {
    const f = filaClienteDesdeDatos({ ...datosClienteVacios(), nombre: '  Print Pack ', calle: 'Tejedores', num_exterior: '578', ciudad: 'Guadalajara' });
    expect(f.nombre).toBe('Print Pack');
    expect(f.colonia).toBeNull();
    expect(f.direccion).toBe('Tejedores 578, Guadalajara');
  });

  it('sin dirección deja direccion en null', () => {
    expect(filaClienteDesdeDatos({ ...datosClienteVacios(), nombre: 'A' }).direccion).toBeNull();
  });
});

describe('soloDigitosCP', () => {
  it('quita letras y corta a 5', () => {
    expect(soloDigitosCP('44a8-60123')).toBe('44860');
  });
});
