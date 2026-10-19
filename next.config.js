/** @type {import('next').NextConfig} */

// Origen de Supabase — usado en CSP para permitir API, Storage y Realtime.
// La base de ESTA instalación (cada cliente y el demo tienen la suya). Sin
// la variable se usa la de Clave Inteligente, como antes.
const SUPABASE_ORIGIN = new URL(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxtedvxqnqrzuxpvgpih.supabase.co'
).origin;
const SUPABASE_WSS = SUPABASE_ORIGIN.replace(/^https:/, 'wss:');
const esDesarrollo = process.env.NODE_ENV === 'development';

// Content Security Policy.
//
// ALCANCE REAL DE ESTA POLITICA:
// Restringe DE DONDE se pueden cargar recursos. Un script alojado en un
// dominio ajeno queda bloqueado.
//
// NO bloquea scripts inline, porque script-src incluye 'unsafe-inline'.
// Esto es necesario: el App Router de Next.js inyecta scripts inline para
// la hidratacion y el streaming de React Server Components. Quitarlo
// requiere nonces por peticion generados en middleware, no una constante.
//
// En resumen: protege contra carga de scripts externos, no contra
// inyeccion de scripts inline. La defensa real contra XSS sigue siendo
// no renderizar HTML sin sanear (evitar dangerouslySetInnerHTML con
// datos del usuario) y la validacion en servidor.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${esDesarrollo ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  // syscom.mx: miniaturas del catálogo en el buscador de cotizaciones.
  `img-src 'self' data: blob: ${SUPABASE_ORIGIN} https://*.syscom.mx`,
  "font-src 'self' data:",
  // nominatim: búsqueda de direcciones (gratis, sin llave) al capturar la
  // ubicación de un sitio programado.
  `connect-src 'self' ${SUPABASE_ORIGIN} ${SUPABASE_WSS} https://nominatim.openstreetmap.org https://photon.komoot.io`,
  // Supabase: los videos de evidencia se reproducen desde su enlace firmado.
  `media-src 'self' blob: ${SUPABASE_ORIGIN}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

// Direcciones IPv4 de esta computadora en la red local (para abrir la app
// en desarrollo desde un celular conectado al mismo Wi-Fi).
function direccionesLocales() {
  const interfaces = Object.values(require('os').networkInterfaces()).flat();
  return interfaces.filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
}

const nextConfig = {
  reactStrictMode: true,

  // Sin esto, "next dev" bloquea las peticiones a /_next/* (el bundle de
  // JS, HMR, fuentes) cuando la app se abre desde otra IP de la red local
  // -por ejemplo un celular probando contra la compu-. React nunca hidrata
  // y el login (y cualquier formulario) deja de responder sin avisar nada:
  // el <form> se envía como HTML plano y solo recarga la página.
  // Se toman las direcciones que tenga la compu en ese momento: el router
  // la cambia de vez en cuando y una dirección fija dejaba de servir.
  ...(esDesarrollo && { allowedDevOrigins: direccionesLocales() }),

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Restringe origenes de carga de recursos.
          { key: 'Content-Security-Policy', value: csp },

          // Obliga HTTPS en visitas futuras. Sin 'preload': ese flag
          // implica inscribir el dominio en la lista de navegadores y
          // es dificil de revertir.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },

          // Impide que el navegador adivine el tipo de contenido.
          { key: 'X-Content-Type-Options', value: 'nosniff' },

          // Impide que la app se embeba en un iframe (clickjacking).
          { key: 'X-Frame-Options', value: 'DENY' },

          // Limita que informacion de origen se envia al navegar fuera.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

          // geolocation=(self): la app la usa en bitacora y detalle de
          // servicios. Bloquearla romperia el registro de ubicacion.
          // microphone=(self): el asistente lo usa para dictar la pregunta;
          // con microphone=() el navegador niega el microfono sin preguntar.
          // camera=(self): la grabadora de video de evidencia abre la camara
          // dentro de la app (asi el video sale ya comprimido); con camera=()
          // el navegador la niega sin preguntar. Las fotos no la necesitaban
          // porque usan la camara del telefono.
          {
            key: 'Permissions-Policy',
            value: [
              'geolocation=(self)',
              'camera=(self)',
              'microphone=(self)',
              'payment=()',
              'usb=()',
              'magnetometer=()',
              'gyroscope=()',
              'accelerometer=()',
            ].join(', '),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
