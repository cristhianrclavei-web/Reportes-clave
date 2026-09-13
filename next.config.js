/** @type {import('next').NextConfig} */

// Origen de Supabase — usado en CSP para permitir API, Storage y Realtime.
const SUPABASE_ORIGIN = 'https://sxtedvxqnqrzuxpvgpih.supabase.co';
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
  `img-src 'self' data: blob: ${SUPABASE_ORIGIN}`,
  "font-src 'self' data:",
  `connect-src 'self' ${SUPABASE_ORIGIN} wss://sxtedvxqnqrzuxpvgpih.supabase.co`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,

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
          {
            key: 'Permissions-Policy',
            value: [
              'geolocation=(self)',
              'camera=()',
              'microphone=()',
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
