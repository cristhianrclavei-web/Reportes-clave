import type { CapacitorConfig } from '@capacitor/cli';

// App de Android de Clave para los teléfonos de la empresa: abre la misma
// app web de siempre y le agrega el rastreo de ubicación en segundo plano
// (lib/rastreoUbicacion.ts). Los cambios de la app web llegan solos; el APK
// solo se vuelve a instalar si cambia la parte nativa (android/).
const config: CapacitorConfig = {
  appId: 'mx.clavei.app',
  appName: 'Clave',
  webDir: 'capacitor/www',
  server: {
    url: 'https://reportes-clave.vercel.app',
    cleartext: false,
  },
};

export default config;
