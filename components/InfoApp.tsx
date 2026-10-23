'use client';

import { useState } from 'react';
import { AppWindow, Bell, Globe, Info, MapPin, Smartphone, UserRound, X, Code2, Cpu } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import Logo from '@/components/Logo';
import { MARCA } from '@/lib/marca';
import { esAppAndroid, infoApk, InfoApk } from '@/lib/rastreoUbicacion';

// «Acerca de esta app» en Mi perfil: dice si se está usando la app de
// Android, la app instalada desde el navegador o el navegador, con qué
// cuenta y qué versión. Sirve para no confundir el APK con el acceso directo
// de Chrome cuando en un mismo teléfono hay dos cuentas abiertas.

type Donde = 'apk' | 'instalada' | 'navegador';

type Datos = {
  donde: Donde;
  navegador: string;
  apk: InfoApk | null;
  notificaciones: string;
  publicada: string;
};

const DONDE: Record<Donde, { titulo: string; detalle: string; Icono: typeof Smartphone }> = {
  apk: {
    titulo: 'App de Android',
    detalle: 'La app instalada con el APK de la empresa. Recibe los avisos por la app.',
    Icono: Smartphone,
  },
  instalada: {
    titulo: 'App instalada desde el navegador',
    detalle: 'El acceso directo que se agregó desde el navegador a la pantalla de inicio.',
    Icono: AppWindow,
  },
  navegador: {
    titulo: 'En el navegador',
    detalle: 'La app abierta en una pestaña del navegador.',
    Icono: Globe,
  },
};

function nombreNavegador(ua: string): string {
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('SamsungBrowser')) return 'Samsung Internet';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  return 'Navegador';
}

function textoNotificaciones(donde: Donde): string {
  if (donde === 'apk') return 'Por la app de Android';
  if (!('Notification' in window)) return 'No disponibles aquí';
  if (Notification.permission === 'granted') return 'Permitidas';
  if (Notification.permission === 'denied') return 'Bloqueadas en el navegador';
  return 'Sin activar';
}

async function leerDatos(): Promise<Datos> {
  let donde: Donde = 'navegador';
  if (esAppAndroid()) {
    donde = 'apk';
  } else if (window.matchMedia('(display-mode: standalone)').matches) {
    donde = 'instalada';
  }
  const fecha = new Date(process.env.NEXT_PUBLIC_FECHA_PUBLICACION || '');
  const publicada = Number.isNaN(fecha.getTime())
    ? ''
    : fecha.toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return {
    donde,
    navegador: nombreNavegador(navigator.userAgent),
    apk: await infoApk(),
    notificaciones: textoNotificaciones(donde),
    publicada,
  };
}

export default function InfoApp({ nombre, esSupervisor }: { nombre: string; esSupervisor: boolean }) {
  const [datos, setDatos] = useState<Datos | null>(null);

  async function abrir() {
    setDatos(await leerDatos());
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-label="Acerca de esta app"
        title="Acerca de esta app"
        className="shrink-0 w-10 h-10 rounded-full border border-line bg-surface flex items-center justify-center text-muted hover:text-teal hover:border-teal/50 active:scale-90 transition"
      >
        <Info size={19} strokeWidth={2.3} />
      </button>

      {datos && <Ventana datos={datos} nombre={nombre} esSupervisor={esSupervisor} onClose={() => setDatos(null)} />}
    </>
  );
}

function Ventana({ datos, nombre, esSupervisor, onClose }: { datos: Datos; nombre: string; esSupervisor: boolean; onClose: () => void }) {
  const donde = DONDE[datos.donde];
  const enApk = datos.donde === 'apk';

  let ubicacion = 'Solo cuando registras algo (llegada, inicio, reporte)';
  if (enApk && esSupervisor) ubicacion = 'No se comparte (cuenta de supervisión)';
  if (enApk && !esSupervisor) ubicacion = 'Se comparte en horario de trabajo';

  let versionApp = datos.navegador;
  if (enApk) versionApp = datos.apk ? `${datos.apk.version} (${datos.apk.compilacion})` : '1.4 o anterior';

  return (
    <ModalOverlay onClose={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-surface border border-line shadow-diffuse overflow-hidden">
        {/* Portada con el logo y dónde se está usando */}
        <div className="relative px-5 pt-6 pb-5 bg-gradient-to-br from-teal/25 via-teal/5 to-transparent">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2 active:scale-90 transition"
          >
            <X size={19} strokeWidth={2.4} />
          </button>
          <div className="flex items-center gap-3">
            <Logo size={52} />
            <div className="min-w-0">
              <p className="font-display font-bold text-[21px] tracking-wide leading-tight">{MARCA.appNombre}</p>
              <p className="text-[12.5px] text-muted">Acerca de esta app</p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-surface/85 backdrop-blur-md border border-teal/40 p-3.5 flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-teal text-inkOnAccent flex items-center justify-center shrink-0">
              <donde.Icono size={20} strokeWidth={2.3} />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-tight">{donde.titulo}</p>
              <p className="text-[12.5px] text-muted leading-snug mt-0.5">{donde.detalle}</p>
            </div>
          </div>
        </div>

        <dl className="px-5 py-2">
          <Renglon Icono={UserRound} etiqueta="Sesión" valor={`${nombre || 'Sin nombre'} · ${esSupervisor ? 'Supervisión' : 'Técnico'}`} />
          <Renglon Icono={enApk ? Smartphone : Globe} etiqueta={enApk ? 'Versión de la app' : 'Navegador'} valor={versionApp} />
          {enApk && datos.apk && <Renglon Icono={Cpu} etiqueta="Teléfono" valor={`${datos.apk.modelo} · Android ${datos.apk.android}`} />}
          <Renglon Icono={MapPin} etiqueta="Ubicación" valor={ubicacion} />
          <Renglon Icono={Bell} etiqueta="Notificaciones" valor={datos.notificaciones} />
          <Renglon
            Icono={Code2}
            etiqueta="Versión web"
            valor={datos.publicada ? `${process.env.NEXT_PUBLIC_VERSION_WEB} · ${datos.publicada}` : String(process.env.NEXT_PUBLIC_VERSION_WEB)}
          />
        </dl>
      </div>
    </ModalOverlay>
  );
}

function Renglon({ Icono, etiqueta, valor }: { Icono: typeof Smartphone; etiqueta: string; valor: string }) {
  return (
    <div className="flex items-start gap-3 py-3 border-t border-line first:border-t-0">
      <Icono size={17} strokeWidth={2.2} className="text-teal shrink-0 mt-0.5" />
      <dt className="text-[13px] text-muted w-[112px] shrink-0">{etiqueta}</dt>
      <dd className="text-[13.5px] font-medium min-w-0 break-words">{valor}</dd>
    </div>
  );
}
