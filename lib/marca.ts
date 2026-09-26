// Datos de la empresa que usa la app: nombre, contacto, formato de reporte.
//
// Para instalar la app a otro cliente basta con definir estas variables de
// entorno en su proyecto de Vercel (y reemplazar las imágenes de
// public/brand/). Sin ellas, se usan los de Clave Inteligente, así que esta
// instalación no cambia en nada.
//
// Van con prefijo NEXT_PUBLIC_ y escritas una por una porque Next solo
// incrusta en el navegador las que aparecen literalmente en el código.

function valor(v: string | undefined, porDefecto: string): string {
  const limpio = (v || '').trim();
  return limpio || porDefecto;
}

export const MARCA = {
  nombre: valor(process.env.NEXT_PUBLIC_MARCA_NOMBRE, 'Clave Inteligente'),
  appNombre: valor(process.env.NEXT_PUBLIC_MARCA_APP, 'Reportes de Servicio'),
  telefonos: valor(process.env.NEXT_PUBLIC_MARCA_TELEFONOS, '3315672378, 3315672377'),
  sitioWeb: valor(process.env.NEXT_PUBLIC_MARCA_WEB, 'www.clave-i.mx'),
  correoSoporte: valor(process.env.NEXT_PUBLIC_MARCA_CORREO, 'soporte@clave-i.mx'),
  domicilio: valor(process.env.NEXT_PUBLIC_MARCA_DOMICILIO, 'Tejedores 578, Col. La Paz, Guadalajara, Jalisco'),
  // Clave del formato del reporte de servicio (aparece en PDF y Excel).
  claveFormato: valor(process.env.NEXT_PUBLIC_MARCA_CLAVE_FORMATO, 'CRM0851'),
  // Quien firma la revisión final de los reportes.
  revisor: valor(process.env.NEXT_PUBLIC_MARCA_REVISOR, 'Ing. Everardo Sánchez'),
};

export const MARCA_MAYUS = MARCA.nombre.toUpperCase();
