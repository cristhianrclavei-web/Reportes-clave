import type { MetadataRoute } from 'next';
import { MARCA, COLORES, iconoApp } from '@/lib/marca';

// Datos de la app al instalarla en el celular. Salen de lib/marca.ts para que
// cada cliente (y el demo) muestre su propio nombre.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${MARCA.appNombre} - ${MARCA.nombre}`,
    short_name: MARCA.nombreCorto,
    description: `${MARCA.appNombre} ${MARCA.claveFormato}`,
    start_url: '/',
    display: 'standalone',
    background_color: COLORES.fondo,
    theme_color: COLORES.fondo,
    orientation: 'portrait',
    icons: [
      { src: iconoApp(192), sizes: '192x192', type: 'image/png' },
      { src: iconoApp(512), sizes: '512x512', type: 'image/png' },
    ],
  };
}
