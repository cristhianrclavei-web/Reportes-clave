// Datos de un cliente tal como los captura el formulario, y la lógica pura
// (sin base de datos) para armarlos: sirve al alta y a la edición.

export type TipoPersona = 'fisica' | 'moral';

export type DatosCliente = {
  tipo_persona: TipoPersona;
  nombre: string;
  calle: string;
  num_exterior: string;
  num_interior: string;
  colonia: string;
  codigo_postal: string;
  ciudad: string;
  estado: string;
};

export const ESTADOS_MX = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua',
  'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero',
  'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla',
  'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas',
  'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
];

export function datosClienteVacios(): DatosCliente {
  return { tipo_persona: 'moral', nombre: '', calle: '', num_exterior: '', num_interior: '', colonia: '', codigo_postal: '', ciudad: '', estado: '' };
}

export function soloDigitosCP(v: string): string {
  return v.replace(/\D/g, '').slice(0, 5);
}

// La dirección como una línea de texto, para mostrarla y buscarla. Se guarda
// en `clientes.direccion` cada vez que se guardan los campos separados.
export function componerDireccion(d: Pick<DatosCliente, 'calle' | 'num_exterior' | 'num_interior' | 'colonia' | 'codigo_postal' | 'ciudad' | 'estado'>): string {
  const calleNum = [d.calle.trim(), d.num_exterior.trim(), d.num_interior.trim() ? `Int. ${d.num_interior.trim()}` : '']
    .filter(Boolean)
    .join(' ');
  return [
    calleNum,
    d.colonia.trim() ? `Col. ${d.colonia.trim()}` : '',
    d.codigo_postal.trim() ? `C.P. ${d.codigo_postal.trim()}` : '',
    d.ciudad.trim(),
    d.estado.trim(),
  ]
    .filter(Boolean)
    .join(', ');
}

// Un cliente dado de alta antes de que existieran los campos separados solo
// tiene `direccion` en texto libre. Al editarlo se pone ese texto en "Calle"
// en vez de dejar los campos vacíos: así no se pierde al guardar, y la
// persona puede repartirlo en los campos correctos.
export function datosDesdeCliente(c: {
  tipo_persona?: TipoPersona | null;
  nombre: string;
  direccion: string | null;
  calle?: string | null;
  num_exterior?: string | null;
  num_interior?: string | null;
  colonia?: string | null;
  codigo_postal?: string | null;
  ciudad?: string | null;
  estado?: string | null;
}): DatosCliente {
  const tieneEstructura = [c.calle, c.num_exterior, c.num_interior, c.colonia, c.codigo_postal, c.ciudad, c.estado].some(Boolean);
  return {
    tipo_persona: c.tipo_persona === 'fisica' ? 'fisica' : 'moral',
    nombre: c.nombre,
    calle: c.calle || (tieneEstructura ? '' : c.direccion || ''),
    num_exterior: c.num_exterior || '',
    num_interior: c.num_interior || '',
    colonia: c.colonia || '',
    codigo_postal: c.codigo_postal || '',
    ciudad: c.ciudad || '',
    estado: c.estado || '',
  };
}

export function validarDatosCliente(d: DatosCliente): string | null {
  if (!d.nombre.trim()) return d.tipo_persona === 'fisica' ? 'Falta el nombre de la persona.' : 'Falta el nombre de la empresa.';
  if (d.codigo_postal.trim() && !/^\d{5}$/.test(d.codigo_postal.trim())) return 'El C.P. debe tener 5 dígitos.';
  return null;
}

// Lo que se escribe en la tabla: vacío → null, y `direccion` armada.
export function filaClienteDesdeDatos(d: DatosCliente) {
  const nul = (v: string) => v.trim() || null;
  return {
    nombre: d.nombre.trim(),
    tipo_persona: d.tipo_persona,
    calle: nul(d.calle),
    num_exterior: nul(d.num_exterior),
    num_interior: nul(d.num_interior),
    colonia: nul(d.colonia),
    codigo_postal: nul(d.codigo_postal),
    ciudad: nul(d.ciudad),
    estado: nul(d.estado),
    direccion: componerDireccion(d) || null,
  };
}
