'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LayoutGroup, motion } from 'motion/react';
import { ChevronDown, ChevronsLeft, UserRound } from 'lucide-react';
import Link from '@/components/TransitionLink';
import Logo from './Logo';
import LogoutButton from './LogoutButton';
import { AvatarTecnico } from '@/components/AvatarTecnico';
import { DashboardTabKey, GRUPOS_NAV, SUBSECCIONES } from './DashboardTabs';
import { useMiId, usePerfil, urlFoto } from '@/lib/perfiles';

// Barra lateral del panel del supervisor en computadora (lg en adelante).
//   · Abierta: logo, secciones agrupadas con ícono y nombre, las
//     subsecciones de la sección elegida desplegadas debajo, y arriba,
//     bajo el logo, la tarjeta de la cuenta.
//   · Cerrada: una columna angosta solo con los íconos; al pasar el cursor
//     aparece una tarjeta con el nombre de la sección y sus subsecciones.
// Si queda abierta o cerrada se recuerda en este navegador.

type Seccion = {
  key: DashboardTabKey;
  label: string;
  href: string;
  Icono: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
};

const RESORTE = { type: 'spring', stiffness: 420, damping: 34 } as const;
const CLAVE_GUARDADA = 'barraLateralCerrada';
// Curva suave para el ancho y el desvanecido de los textos.
const SUAVE = 'duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]';

export default function BarraLateral({
  secciones, activa, userName,
}: {
  secciones: Seccion[];
  activa: DashboardTabKey | null;
  userName?: string;
}) {
  const [cerrada, setCerrada] = useState(false);
  // Subsecciones abiertas o cerradas a mano; si no se ha tocado, solo la
  // sección activa las muestra.
  const [abiertas, setAbiertas] = useState<Partial<Record<DashboardTabKey, boolean>>>({});
  const subActual = useSearchParams().get('sub');
  const miId = useMiId();
  const miPerfil = usePerfil(miId);
  const miFoto = urlFoto(miPerfil?.foto_path);

  // Se lee después de montar: en el servidor no hay localStorage y leerlo en
  // el render rompería la hidratación.
  useEffect(() => {
    try {
      if (localStorage.getItem(CLAVE_GUARDADA) === '1') setCerrada(true);
    } catch { /* sin almacenamiento: queda abierta */ }
  }, []);

  function alternarBarra() {
    const nueva = !cerrada;
    setCerrada(nueva);
    try { localStorage.setItem(CLAVE_GUARDADA, nueva ? '1' : '0'); } catch { /* modo privado */ }
  }

  function estaDesplegada(key: DashboardTabKey): boolean {
    const elegido = abiertas[key];
    if (elegido === undefined) return key === activa;
    return elegido;
  }

  function alternarSubsecciones(key: DashboardTabKey) {
    setAbiertas({ ...abiertas, [key]: !estaDesplegada(key) });
  }

  // Agrupadas como en GRUPOS_NAV; solo las que esta persona puede ver.
  const grupos = GRUPOS_NAV.map((g) => ({
    titulo: g.titulo,
    items: g.keys
      .map((k) => secciones.find((s) => s.key === k))
      .filter((s): s is Seccion => !!s),
  })).filter((g) => g.items.length > 0);

  // Los textos se desvanecen y se encogen a la vez que la barra.
  const textoVisible = cerrada ? 'opacity-0 w-0 pointer-events-none' : 'opacity-100';

  return (
    <aside
      aria-label="Menú principal"
      // z-40: las tarjetas flotantes de la barra cerrada van encima del contenido.
      className={`hidden lg:flex sticky top-0 z-40 h-screen shrink-0 flex-col border-r border-line bg-surface/60 backdrop-blur-sm transition-[width] ${SUAVE} ${
        cerrada ? 'w-[76px]' : 'w-[264px]'
      }`}
    >
      {/* Botón para abrir o cerrar, en el borde de la barra */}
      <button
        type="button"
        onClick={alternarBarra}
        aria-label={cerrada ? 'Abrir el menú' : 'Cerrar el menú'}
        aria-expanded={!cerrada}
        className="absolute -right-3.5 top-9 z-20 w-7 h-7 rounded-full bg-surface border border-line-strong shadow-diffuse flex items-center justify-center text-ink/70 hover:text-teal hover:border-teal/50 hover:scale-110 active:scale-95 transition"
      >
        <ChevronsLeft size={15} strokeWidth={2.4} className={`transition-transform ${SUAVE} ${cerrada ? 'rotate-180' : ''}`} />
      </button>

      {/* Logo */}
      <Link
        href="/dashboard"
        aria-label="Ir al resumen"
        className={`flex items-center h-[84px] shrink-0 overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 ${cerrada ? 'justify-center px-0' : 'px-5'}`}
      >
        {cerrada ? <Logo size={38} /> : <Logo variante="completo" size={40} />}
      </Link>

      {/* Tarjeta de la cuenta, debajo del logo. Abierta: portada de color,
          foto grande al centro, nombre y puesto, y debajo Mi perfil y salir.
          Cerrada: solo la foto; al pasar el cursor sale la tarjeta flotante. */}
      <div className={`shrink-0 pb-2 ${cerrada ? 'px-0 flex justify-center' : 'px-3'}`}>
        {cerrada ? (
          <div className="relative group/cuenta">
            <Link href="/perfil" aria-label="Mi perfil" className="block rounded-full ring-2 ring-teal/40 ring-offset-2 ring-offset-surface hover:ring-teal transition">
              <FotoPerfil foto={miFoto} id={miId} nombre={userName} tam={44} />
            </Link>
            <TarjetaCuenta nombre={userName || 'Supervisión'} puesto={miPerfil?.puesto || 'Supervisión'} />
          </div>
        ) : (
          <div className="rounded-2xl bg-surface border border-line overflow-hidden shadow-diffuse">
            <div className="h-12 bg-gradient-to-br from-teal/40 via-teal/15 to-transparent" />
            <div className="px-3 pb-3 -mt-9 flex flex-col items-center text-center">
              <Link
                href="/perfil"
                aria-label="Mi perfil"
                className="rounded-full ring-4 ring-surface shadow-glow-teal transition-transform duration-200 hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-teal/60"
              >
                <FotoPerfil foto={miFoto} id={miId} nombre={userName} tam={76} />
              </Link>
              <p className="mt-2 max-w-full truncate font-display font-bold text-[16.5px] leading-tight tracking-wide">
                {userName || 'Supervisión'}
              </p>
              <p className="max-w-full text-[12.5px] text-muted leading-snug line-clamp-2">{miPerfil?.puesto || 'Supervisión'}</p>
              <div className="mt-2.5 w-full flex items-center gap-2">
                <Link
                  href="/perfil"
                  className="flex-1 h-9 rounded-full bg-surface-2 border border-line text-[12.5px] font-semibold text-ink/85 flex items-center justify-center gap-1.5 hover:border-teal/50 hover:text-teal transition-colors"
                >
                  <UserRound size={14} strokeWidth={2.3} /> Mi perfil
                </Link>
                <LogoutButton
                  compacto
                  className="shrink-0 w-9 h-9 rounded-full border border-line bg-surface-2 flex items-center justify-center text-ink/65 hover:text-red hover:border-red/40 active:scale-90 transition disabled:opacity-60"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Secciones. Cerrada no lleva scroll: el scroll recortaría las
          tarjetas que salen a la derecha de cada ícono. */}
      <LayoutGroup id="barra-lateral">
        <nav
          aria-label="Secciones"
          className={`flex-1 min-h-0 px-3 pb-3 ${cerrada ? 'overflow-visible' : 'overflow-y-auto no-scrollbar'}`}
        >
          {grupos.map((g, i) => (
            <div key={g.titulo} className="mt-3 first:mt-1">
              {/* Cerrada, el título del grupo se vuelve una línea fina: así
                  caben todos los íconos sin scroll. */}
              {cerrada && i > 0 && <div className="mx-3 mb-3 h-px bg-line" />}
              {!cerrada && (
                <p className="px-3 mb-1.5 h-4 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-faint whitespace-nowrap overflow-hidden">
                  {g.titulo}
                </p>
              )}
              <ul className="flex flex-col gap-1">
                {g.items.map((s) => (
                  <ElementoSeccion
                    key={s.key}
                    seccion={s}
                    activa={s.key === activa}
                    cerrada={cerrada}
                    desplegada={estaDesplegada(s.key)}
                    subActual={s.key === activa ? subActual : null}
                    onAlternar={() => alternarSubsecciones(s.key)}
                    textoVisible={textoVisible}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </LayoutGroup>

    </aside>
  );
}

function ElementoSeccion({
  seccion, activa, cerrada, desplegada, subActual, onAlternar, textoVisible,
}: {
  seccion: Seccion;
  activa: boolean;
  cerrada: boolean;
  desplegada: boolean;
  subActual: string | null;
  onAlternar: () => void;
  textoVisible: string;
}) {
  const subs = SUBSECCIONES[seccion.key] || [];
  const tieneSubs = subs.length > 0;
  const Icono = seccion.Icono;

  let colores = 'text-ink/70 hover:text-ink hover:bg-surface-2';
  if (activa) colores = 'text-teal';

  return (
    <li className="relative group/seccion">
      <div className="relative flex items-center">
        <Link
          href={seccion.href}
          aria-current={activa ? 'page' : undefined}
          aria-label={cerrada ? seccion.label : undefined}
          className={`relative flex-1 min-w-0 flex items-center gap-3 h-11 rounded-xl transition-colors duration-200 ${colores} ${
            cerrada ? 'justify-center px-0' : 'px-3'
          }`}
        >
          {activa && (
            <>
              <motion.span layoutId="barra-activa-fondo" transition={RESORTE} className="absolute inset-0 rounded-xl bg-teal/12 ring-1 ring-teal/30" />
              <motion.span layoutId="barra-activa-acento" transition={RESORTE} className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-teal shadow-glow-teal" />
            </>
          )}
          <Icono
            size={20}
            strokeWidth={activa ? 2.4 : 2}
            className="relative shrink-0 transition-transform duration-200 group-hover/seccion:scale-110"
          />
          <span
            className={`relative text-[14px] whitespace-nowrap overflow-hidden transition-opacity ${SUAVE} ${activa ? 'font-semibold' : 'font-medium'} ${textoVisible}`}
          >
            {seccion.label}
          </span>
        </Link>
        {tieneSubs && !cerrada && (
          <button
            type="button"
            onClick={onAlternar}
            aria-label={desplegada ? `Ocultar las opciones de ${seccion.label}` : `Ver las opciones de ${seccion.label}`}
            aria-expanded={desplegada}
            className="absolute right-1 w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2 transition"
          >
            <ChevronDown size={15} strokeWidth={2.4} className={`transition-transform duration-300 ${desplegada ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {/* Subsecciones: se despliegan con una animación de alto (grid 0fr→1fr). */}
      {tieneSubs && !cerrada && (
        <div className={`grid transition-[grid-template-rows,opacity] ${SUAVE} ${desplegada ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <ul className="overflow-hidden ml-[22px] pl-3 border-l border-line">
            {subs.map((sub, i) => {
              // Sin «?sub=» en la dirección, la primera es la que está abierta.
              const marcada = activa && (subActual === sub.clave || (!subActual && i === 0));
              return (
                <li key={sub.clave}>
                  <Link
                    href={`${seccion.href}?sub=${sub.clave}`}
                    tabIndex={desplegada ? undefined : -1}
                    aria-current={marcada ? 'page' : undefined}
                    className={`relative flex items-center h-9 px-3 my-0.5 rounded-lg text-[13px] whitespace-nowrap transition-colors duration-200 ${
                      marcada ? 'text-teal font-semibold bg-teal/8' : 'text-ink/60 hover:text-ink hover:bg-surface-2 hover:translate-x-0.5'
                    }`}
                  >
                    {marcada && <span className="absolute -left-[13px] top-2 bottom-2 w-[2px] rounded-full bg-teal" />}
                    {sub.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Cerrada: tarjeta flotante a la derecha con el nombre y, si tiene,
          las subsecciones. El pl-3 hace de puente para no perder el hover
          al mover el cursor del ícono a la tarjeta. */}
      {cerrada && (
        <div className="absolute left-full top-0 z-50 pl-3 invisible opacity-0 -translate-x-1 group-hover/seccion:visible group-hover/seccion:opacity-100 group-hover/seccion:translate-x-0 group-focus-within/seccion:visible group-focus-within/seccion:opacity-100 group-focus-within/seccion:translate-x-0 transition-all duration-200 ease-out">
          <div className="min-w-[180px] rounded-xl bg-surface border border-line-strong shadow-diffuse p-1.5">
            <Link
              href={seccion.href}
              className={`flex items-center gap-2 px-2.5 h-9 rounded-lg text-[13.5px] font-semibold whitespace-nowrap ${activa ? 'text-teal' : 'text-ink'} hover:bg-surface-2`}
            >
              {seccion.label}
            </Link>
            {tieneSubs && (
              <>
                <div className="h-px bg-line my-1" />
                {subs.map((sub) => (
                  <Link
                    key={sub.clave}
                    href={`${seccion.href}?sub=${sub.clave}`}
                    className="flex items-center px-2.5 h-8 rounded-lg text-[13px] text-ink/70 hover:text-teal hover:bg-teal/8 whitespace-nowrap transition-colors"
                  >
                    {sub.label}
                  </Link>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

// La foto de la cuenta, o su avatar si no ha subido foto.
function FotoPerfil({ foto, id, nombre, tam }: { foto: string | null; id: string | null; nombre?: string; tam: number }) {
  if (foto) {
    return <img src={foto} alt="" style={{ width: tam, height: tam }} className="rounded-full object-cover block" />;
  }
  return <AvatarTecnico id={id || undefined} nombre={nombre || 'Supervisión'} size={tam} />;
}

// Barra cerrada: al pasar el cursor por la foto sale una tarjeta con el
// nombre, el acceso al perfil y el botón de salir. Se queda montada aunque
// no se vea: salir abre su confirmación en una ventana aparte.
function TarjetaCuenta({ nombre, puesto }: { nombre: string; puesto: string }) {
  return (
    <div className="absolute left-full top-0 z-50 pl-3 invisible opacity-0 -translate-x-1 group-hover/cuenta:visible group-hover/cuenta:opacity-100 group-hover/cuenta:translate-x-0 group-focus-within/cuenta:visible group-focus-within/cuenta:opacity-100 group-focus-within/cuenta:translate-x-0 transition-all duration-200 ease-out">
      <div className="w-[220px] rounded-xl bg-surface border border-line-strong shadow-diffuse p-1.5">
        <div className="px-2.5 py-2">
          <p className="text-[13.5px] font-semibold leading-tight truncate">{nombre}</p>
          <p className="text-[12px] text-muted truncate">{puesto}</p>
        </div>
        <div className="h-px bg-line my-1" />
        <Link href="/perfil" className="flex items-center gap-2 px-2.5 h-9 rounded-lg text-[13px] text-ink/80 hover:text-teal hover:bg-teal/8 transition-colors">
          <UserRound size={15} strokeWidth={2.3} /> Mi perfil
        </Link>
        <LogoutButton
          compacto
          conTexto
          className="w-full flex items-center gap-2 px-2.5 h-9 rounded-lg text-[13px] text-red hover:bg-red/10 transition-colors disabled:opacity-60"
        />
      </div>
    </div>
  );
}
