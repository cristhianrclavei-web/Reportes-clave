import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, Inter, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import ToastContainer from '@/components/Toast';
import OfflineSyncManager from '@/components/OfflineSyncManager';
import SincronizarAcento from '@/components/SincronizarAcento';
import SeleccionarNumeros from '@/components/SeleccionarNumeros';
import AvisoSuscripcion from '@/components/AvisoSuscripcion';
import Asistente from '@/components/Asistente';
import { MARCA, MARCA_MAYUS, DEMO, COLORES, iconoApp } from '@/lib/marca';

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
  description: `App de reportes de servicio ${MARCA.claveFormato} para personal técnico y de supervisión`,
  icons: {
    icon: iconoApp(192),
    apple: iconoApp(192),
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: MARCA.nombreCorto,
  },
};

export const viewport: Viewport = {
  themeColor: COLORES.fondo,
  width: 'device-width',
  initialScale: 1,
  // Sin esto, env(safe-area-inset-*) vale 0 siempre: el contenido y las
  // barras fijas quedan bajo el notch y la barra de inicio del iPhone
  // cuando la app corre instalada (sin la UI de Safari alrededor).
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-tema={MARCA.tema} suppressHydrationWarning className={`dark ${display.variable} ${sans.variable} ${mono.variable}`}>
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
                  var acento = localStorage.getItem('acento');
                  if (acento && /^(bosque|oceano|ciruela|brasa)$/.test(acento)) root.setAttribute('data-acento', acento);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="font-sans bg-bg text-ink m-0 min-h-screen transition-colors duration-300">
        {DEMO.activo && (
          <div
            className="relative z-30 border-b border-line bg-surface-2/70 backdrop-blur text-muted text-[11.5px] px-3 pb-1.5 flex items-center justify-center gap-2 text-center"
            style={{ paddingTop: 'calc(0.375rem + env(safe-area-inset-top))' }}
          >
            <span className="px-1.5 py-px rounded-md bg-teal/15 border border-teal/30 text-teal text-[10px] font-semibold tracking-[0.12em] shrink-0">
              DEMO
            </span>
            <span>
              Entorno de demostración
              <span className="hidden sm:inline"> · la información se restablece cada noche</span>
            </span>
          </div>
        )}
        <AvisoSuscripcion />
        {children}
        <ToastContainer />
        <Asistente />
        <OfflineSyncManager />
        <SincronizarAcento />
        <SeleccionarNumeros />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
                // Al tocar una notificación con la app ya abierta, el service
                // worker pide por aquí la pantalla del aviso (public/sw.js).
                // Solo se aceptan pantallas de la propia app.
                navigator.serviceWorker.addEventListener('message', (e) => {
                  var d = e.data || {};
                  var u = d.url;
                  var interna = typeof u === 'string' && u.charAt(0) === '/' && u.charAt(1) !== '/' && u.charAt(1) !== '\\\\';
                  if (d.tipo === 'abrir-pantalla' && interna) window.location.assign(u);
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
