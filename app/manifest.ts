import type { MetadataRoute } from 'next';
import { MARCA } from '@/lib/marca';

// Datos de la app al instalarla en el celular. Salen de lib/marca.ts para que
// cada cliente (y el demo) muestre su propio nombre.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${MARCA.appNombre} - ${MARCA.nombre}`,
    short_name: MARCA.nombreCorto,
    description: `${MARCA.appNombre} ${MARCA.claveFormato}`,
    start_url: '/',
    display: 'standalone',
    background_color: '#0A121C',
    theme_color: '#0A121C',
    orientation: 'portrait',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
