'use client';

import Link from 'next/link';
import {
  ArrowRight, BellRing, CalendarDays, Check, ClipboardCheck, FileSignature, LayoutDashboard, Loader2,
  MessageCircle, PackageCheck, Receipt, WifiOff, Wrench,
} from 'lucide-react';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/lib/useTheme';
import { DEMO, MARCA } from '@/lib/marca';
import { PLANES, VENTAS_CORREO, VENTAS_WHATSAPP, dinero } from '@/lib/planesDatos';

// Portada del demo público: es lo primero que ve un prospecto. Se entra sin
// credenciales eligiendo el papel (las cuentas de ejemplo son compartidas),
// y de paso se cuenta qué hace la app y cómo se contrata.

export type ClaveAcceso = 'supervisor' | 'tecnico';

const ACCESOS: { clave: ClaveAcceso; Icono: typeof Wrench; titulo: string; lema: string; puntos: string[] }[] = [
  {
    clave: 'supervisor',
    Icono: LayoutDashboard,
    titulo: 'Supervisor',
    lema: 'Coordina y da seguimiento a la operación',
    puntos: ['Tablero del día en vivo', 'Agenda, reportes y cotizaciones', 'Clientes, almacén y facturación'],
  },
  {
    clave: 'tecnico',
    Icono: Wrench,
    titulo: 'Técnico',
    lema: 'El trabajo del día, desde el celular',
    puntos: ['Sus servicios de hoy, paso a paso', 'Reporte con fotos y firma del cliente', 'Funciona aun sin señal'],
  },
];

const FUNCIONES = [
  { Icono: LayoutDashboard, titulo: 'Tablero del día', texto: 'Quién está en sitio, quién ya concluyó y qué servicio necesita atención, sin llamadas.' },
  { Icono: FileSignature, titulo: 'Reportes firmados', texto: 'Fotos, materiales y firma del cliente desde el celular; el PDF queda listo al guardar.' },
  { Icono: CalendarDays, titulo: 'Agenda y mantenimientos', texto: 'Programa por persona o cuadrilla y deja que los mantenimientos periódicos se agenden solos.' },
  { Icono: Receipt, titulo: 'Cotizaciones', texto: 'Arma la cotización, compártela en PDF y conviértela en servicio cuando el cliente la aprueba.' },
  { Icono: PackageCheck, titulo: 'Almacén y vales', texto: 'Existencias, vales por servicio y equipo instalado con etiqueta QR por cliente.' },
  { Icono: BellRing, titulo: 'Control de reportes', texto: 'Avisa a quien no entregó su reporte y te muestra los días pendientes por persona.' },
];

const PASOS = [
  { titulo: 'Recorre el demo', texto: 'Entra como supervisor o como técnico y prueba todo con datos de ejemplo.' },
  { titulo: 'Pide tu prueba', texto: '14 días con tu empresa, tu gente y tus clientes, con todos los módulos.' },
  { titulo: 'Elige tu paquete', texto: 'Contratas el que te conviene y conservas todo lo que capturaste.' },
];

function enlaceVentas(mensaje: string): string | null {
  if (VENTAS_WHATSAPP) return `https://wa.me/${VENTAS_WHATSAPP.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`;
  if (VENTAS_CORREO) return `mailto:${VENTAS_CORREO}?subject=${encodeURIComponent(`Información de ${MARCA.appNombre}`)}&body=${encodeURIComponent(mensaje)}`;
  return null;
}

export default function PortadaDemo({
  onEntrar, entrando, ocupado, error,
}: {
  onEntrar: (clave: ClaveAcceso) => void;
  // Cuál de los dos accesos se está abriendo (para su indicador).
  entrando: ClaveAcceso | null;
  ocupado: boolean;
  error: string | null;
}) {
  const tema = useTheme();
  const sufijo = tema === 'light' ? 'claro' : 'oscuro';
  const hablar = enlaceVentas(`Hola, vi el demo de ${MARCA.appNombre} y quiero más información.`);
  const prueba = enlaceVentas(`Hola, vi el demo de ${MARCA.appNombre} y quiero una prueba de 14 días con los datos de mi empresa.`);

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 -left-32 w-[30rem] h-[30rem] rounded-full bg-teal/12 blur-[130px]" />
      <div className="pointer-events-none absolute top-[28rem] -right-40 w-[34rem] h-[34rem] rounded-full bg-teal/12 blur-[140px]" />
      <div className="pointer-events-none absolute top-24 right-1/3 w-64 h-64 rounded-full bg-amber/10 blur-[110px]" />

      <div className="relative z-10 max-w-6xl 2xl:max-w-[1380px] mx-auto px-5 lg:px-8">
        {/* ---------- Encabezado ---------- */}
        <header className="flex items-center justify-between gap-3 py-5">
          <Logo variante="completo" size={40} className="min-w-0" />
          <div className="flex items-center gap-2.5 shrink-0">
            {hablar && (
              <a
                href={hablar}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex h-10 px-4 rounded-full border border-line-strong bg-surface/60 text-[13.5px] font-semibold items-center gap-2 hover:border-teal/60 hover:text-teal transition-colors"
              >
                <MessageCircle size={15} strokeWidth={2.3} /> Hablar con ventas
              </a>
            )}
            <ThemeToggle variante="interruptor" />
          </div>
        </header>

        {/* ---------- Presentación y accesos ---------- */}
        <section className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] 2xl:grid-cols-[0.82fr_1.18fr] gap-10 lg:gap-12 2xl:gap-16 items-center pt-6 lg:pt-10 pb-14 lg:pb-20">
          <div>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal/12 border border-teal/30 text-teal text-[12px] font-semibold tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
              Demo en vivo · sin registro
            </span>
            <h1 className="mt-4 font-display font-bold text-[36px] sm:text-[48px] lg:text-[54px] leading-[1.03] tracking-wide">
              Tu operación de campo,<br className="hidden sm:block" /> en una sola app
            </h1>
            <p className="mt-4 text-[15.5px] sm:text-[17px] text-muted max-w-xl leading-relaxed">
              Agenda, reportes firmados, cotizaciones y almacén para empresas de servicio e instalación.
              Elige cómo quieres entrar y recórrela con datos de ejemplo.
            </p>

            <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {ACCESOS.map((a) => {
                const cargando = entrando === a.clave;
                const principal = a.clave === 'supervisor';
                return (
                  <button
                    key={a.clave}
                    type="button"
                    disabled={ocupado}
                    onClick={() => onEntrar(a.clave)}
                    className="group text-left rounded-3xl bg-surface border border-line p-5 hover:border-teal/60 hover:-translate-y-1 active:translate-y-0 active:scale-[0.98] disabled:opacity-70 disabled:hover:translate-y-0 transition-all duration-200 shadow-diffuse"
                  >
                    <div className="flex items-center gap-3 mb-3.5">
                      <span className="w-11 h-11 rounded-2xl bg-teal/15 border border-teal/30 text-teal flex items-center justify-center shrink-0 group-hover:bg-teal group-hover:text-inkOnAccent transition-colors duration-200">
                        <a.Icono size={22} strokeWidth={2.2} />
                      </span>
                      <div className="min-w-0">
                        <p className="font-display font-bold text-[22px] leading-tight tracking-wide">{a.titulo}</p>
                        <p className="text-[12.5px] text-muted leading-snug">{a.lema}</p>
                      </div>
                    </div>
                    <ul className="space-y-1.5 mb-4">
                      {a.puntos.map((t) => (
                        <li key={t} className="flex gap-2 text-[13.5px] text-ink/85">
                          <Check size={15} strokeWidth={2.6} className="text-teal shrink-0 mt-0.5" />
                          {t}
                        </li>
                      ))}
                    </ul>
                    <span
                      className={`flex items-center justify-center gap-2 min-h-[46px] rounded-2xl font-semibold text-[14.5px] ${
                        principal ? 'bg-teal text-inkOnAccent shadow-glow-teal' : 'border border-teal/50 text-teal group-hover:bg-teal group-hover:text-inkOnAccent transition-colors'
                      }`}
                    >
                      {cargando ? (
                        <>
                          <Loader2 size={17} className="animate-spin" />
                          Entrando…
                        </>
                      ) : (
                        <>
                          Entrar como {a.titulo.toLowerCase()}
                          <ArrowRight size={17} strokeWidth={2.4} className="group-hover:translate-x-1 transition-transform duration-200" />
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {error && <p className="text-red text-[13.5px] mt-4">{error}</p>}

            <p className="text-[12.5px] text-muted mt-4 flex items-start gap-2">
              <ClipboardCheck size={15} className="text-teal shrink-0 mt-px" />
              Los datos son ficticios y se reinician cada noche: puedes crear, editar y borrar con confianza.
            </p>
          </div>

          {/* Vista real de la app: el tablero en computadora y el celular del técnico. */}
          <div className="relative pb-10 sm:pb-12 lg:pb-14 pl-10 sm:pl-14 lg:pl-12 2xl:pl-16" aria-hidden="true">
            <div className="rounded-2xl border border-line-strong bg-surface shadow-diffuse overflow-hidden">
              <div className="h-8 px-3.5 flex items-center gap-1.5 border-b border-line bg-surface-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-teal/60" />
                <span className="ml-3 h-4 flex-1 max-w-[220px] rounded-full bg-bg border border-line" />
              </div>
              <img src={`/demo/tablero-${sufijo}.png`} alt="" width={1536} height={855} className="block w-full h-auto" />
            </div>
            <div className="absolute bottom-0 left-0 w-[27%] min-w-[104px] max-w-[190px] rounded-[22px] border-[5px] border-ink/85 bg-bg shadow-diffuse overflow-hidden">
              <img src={`/demo/celular-${sufijo}.png`} alt="" width={780} height={1560} className="block w-full h-auto" />
            </div>
          </div>
        </section>

        {/* ---------- Qué hace ---------- */}
        <section className="pb-14 lg:pb-20">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-teal mb-2">Qué incluye</p>
          <h2 className="font-display font-bold text-[26px] sm:text-[32px] leading-tight tracking-wide max-w-2xl">
            Del servicio agendado al reporte firmado, sin papel ni mensajes sueltos
          </h2>
          <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {FUNCIONES.map((f) => (
              <div key={f.titulo} className="rounded-2xl bg-surface border border-line p-5">
                <span className="w-10 h-10 rounded-xl bg-teal/12 text-teal flex items-center justify-center mb-3.5">
                  <f.Icono size={20} strokeWidth={2.1} />
                </span>
                <p className="font-display font-bold text-[18px] tracking-wide mb-1">{f.titulo}</p>
                <p className="text-[13.5px] text-muted leading-relaxed">{f.texto}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[13px] text-muted flex items-center gap-2">
            <WifiOff size={15} className="text-teal shrink-0" />
            En campo funciona sin señal: el reporte se guarda en el celular y se sube solo al recuperar internet.
          </p>
        </section>

        {/* ---------- Cómo empezar ---------- */}
        <section className="pb-14 lg:pb-16">
          <div className="rounded-3xl bg-surface border border-line p-6 sm:p-8 lg:p-10 shadow-diffuse">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 lg:gap-12 items-center">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-teal mb-2">Cómo empezar</p>
                <h2 className="font-display font-bold text-[24px] sm:text-[30px] leading-tight tracking-wide mb-6">
                  Pruébala 14 días con tu propia operación
                </h2>
                <ol className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  {PASOS.map((p, i) => (
                    <li key={p.titulo} className="flex sm:flex-col gap-3">
                      <span className="w-8 h-8 rounded-full bg-teal/12 border border-teal/30 text-teal font-display font-bold text-[15px] flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <div>
                        <p className="font-semibold text-[14.5px] mb-0.5">{p.titulo}</p>
                        <p className="text-[13px] text-muted leading-relaxed">{p.texto}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="lg:w-[270px] lg:border-l lg:border-line lg:pl-10">
                <p className="text-[12.5px] text-muted">Paquetes desde</p>
                <p className="mb-1">
                  <span className="font-display font-bold text-[38px] leading-none tabular-nums">{dinero(PLANES.campo.precioMensual)}</span>
                  <span className="text-[13px] text-muted"> MXN al mes</span>
                </p>
                <p className="text-[12.5px] text-muted mb-4">Más IVA · hasta {PLANES.campo.usuarios} usuarios</p>
                {prueba ? (
                  <a
                    href={prueba}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[48px] px-5 rounded-2xl bg-teal text-inkOnAccent font-semibold text-[14.5px] flex items-center justify-center gap-2 shadow-glow-teal hover:brightness-110 active:scale-95 transition"
                  >
                    <MessageCircle size={17} strokeWidth={2.3} /> Quiero mi prueba
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => onEntrar('supervisor')}
                    className="w-full min-h-[48px] px-5 rounded-2xl bg-teal text-inkOnAccent font-semibold text-[14.5px] flex items-center justify-center gap-2 shadow-glow-teal active:scale-95 transition disabled:opacity-70"
                  >
                    Ver el demo <ArrowRight size={17} strokeWidth={2.4} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Pie ---------- */}
        <footer className="border-t border-line py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[12.5px] text-muted">
          <p>{MARCA.appNombre} · demostración con la marca de ejemplo «{MARCA.nombre}»</p>
          <div className="flex items-center gap-5">
            {hablar && (
              <a href={hablar} target="_blank" rel="noopener noreferrer" className="hover:text-ink transition-colors">Contacto</a>
            )}
            <Link href="/aviso-privacidad" className="hover:text-ink transition-colors">Aviso de privacidad</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}

// Para que el formulario de acceso sepa qué cuenta abrir.
export function cuentaDemo(clave: ClaveAcceso) {
  return clave === 'supervisor' ? DEMO.supervisor : DEMO.tecnico;
}
