import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, Inter, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import ToastContainer from '@/components/Toast';
import OfflineSyncManager from '@/components/OfflineSyncManager';
import SeleccionarNumeros from '@/components/SeleccionarNumeros';
import AvisoSuscripcion from '@/components/AvisoSuscripcion';
import { MARCA, MARCA_MAYUS, DEMO } from '@/lib/marca';

const display = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
});
const sans = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: `${MARCA.appNombre} · ${MARCA.nombre}`,
  description: `App de reportes de servicio ${MARCA.claveFormato} para técnicos y supervisores`,
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: MARCA.nombreCorto,
  },
};

export const viewport: Viewport = {
  themeColor: '#0A121C',
  width: 'device-width',
  initialScale: 1,
  // Sin esto, env(safe-area-inset-*) vale 0 siempre: el contenido y las
  // barras fijas quedan bajo el notch y la barra de inicio del iPhone
  // cuando la app corre instalada (sin la UI de Safari alrededor).
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning className={`dark ${display.variable} ${sans.variable} ${mono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var saved = localStorage.getItem('theme');
                  var theme = saved === 'light' ? 'light' : 'dark';
                  var root = document.documentElement;
                  root.classList.remove('light', 'dark');
                  root.classList.add(theme);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="font-sans bg-bg text-ink m-0 min-h-screen transition-colors duration-300">
        {DEMO.activo && (
          <div className="bg-amber text-black text-center text-[12px] font-semibold px-3 py-1.5">
            Versión de demostración · datos ficticios que se reinician cada noche
          </div>
        )}
        <AvisoSuscripcion />
        {children}
        <ToastContainer />
        <OfflineSyncManager />
        <SeleccionarNumeros />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
