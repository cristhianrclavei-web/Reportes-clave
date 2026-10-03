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
  // Dirección pública de la app: va dentro del QR de las etiquetas de
  // mantenimiento, así que debe seguir funcionando mientras las etiquetas
  // estén pegadas (si se cambia de dominio, el anterior debe redirigir).
  appUrl: valor(process.env.NEXT_PUBLIC_MARCA_APP_URL, 'https://reportes-clave.vercel.app'),
  // Pie de página del PDF de cotización (dirección y teléfono de la empresa).
  pieCotizacion: valor(process.env.NEXT_PUBLIC_MARCA_PIE_COTIZACION, 'Tejedores 578 Col. La Paz Guadalajara Jalisco 44860 Tel: 3315781794'),
  // Letras dentro del escudo del logo y nombre corto al instalar la app.
  iniciales: valor(process.env.NEXT_PUBLIC_MARCA_INICIALES, 'CI').slice(0, 3),
  nombreCorto: valor(process.env.NEXT_PUBLIC_MARCA_NOMBRE_CORTO, 'Reportes CI'),
  // Tira de íconos de servicios bajo el nombre (propia de Clave Inteligente).
  iconos: valor(process.env.NEXT_PUBLIC_MARCA_ICONOS, '1') === '1',
};

// Datos del emisor para la prefactura (los mismos del CFDI que timbra el PAC).
export const EMISOR = {
  razonSocial: valor(process.env.NEXT_PUBLIC_EMISOR_RAZON_SOCIAL, MARCA.nombre.toUpperCase()),
  rfc: valor(process.env.NEXT_PUBLIC_EMISOR_RFC, 'CIN140820MB3'),
  regimen: valor(process.env.NEXT_PUBLIC_EMISOR_REGIMEN, '(601) General de Ley Personas Morales'),
  telefono: valor(process.env.NEXT_PUBLIC_EMISOR_TELEFONO, '3315781794'),
  correo: valor(process.env.NEXT_PUBLIC_EMISOR_CORREO, 'facturas@clave-i.com'),
  web: valor(process.env.NEXT_PUBLIC_EMISOR_WEB, 'www.clave-i.com'),
  lugarExpedicion: valor(process.env.NEXT_PUBLIC_EMISOR_CP, '44860'),
};

// Modo demostración: aviso fijo arriba y acceso rápido con cuentas de prueba.
// Las credenciales del demo son públicas a propósito (la base del demo solo
// tiene datos ficticios y se reinicia cada noche).
export const DEMO = {
  activo: process.env.NEXT_PUBLIC_DEMO === '1',
  supervisor: {
    correo: process.env.NEXT_PUBLIC_DEMO_SUPERVISOR_CORREO || '',
    contrasena: process.env.NEXT_PUBLIC_DEMO_SUPERVISOR_CONTRASENA || '',
  },
  tecnico: {
    correo: process.env.NEXT_PUBLIC_DEMO_TECNICO_CORREO || '',
    contrasena: process.env.NEXT_PUBLIC_DEMO_TECNICO_CONTRASENA || '',
  },
};

export const MARCA_MAYUS = MARCA.nombre.toUpperCase();
