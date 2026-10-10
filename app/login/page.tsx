'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabaseClient';
import { validateLoginUser } from '@/lib/validateLoginUser'; // NUEVO - OWASP A07
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/lib/useTheme';
import Logo from '@/components/Logo';
import { DEMO, MARCA } from '@/lib/marca';
import PortadaDemo, { ClaveAcceso, cuentaDemo } from '@/components/PortadaDemo';
import FondoFotovoltaico from '@/components/FondoFotovoltaico';
import { CamaraVigilancia, SirenaAlarma, ModoVigilancia } from '@/components/VigilanciaAcceso';
import { AlertTriangle, Eye, EyeOff, Loader2, Lock, Mail, ShieldAlert } from 'lucide-react';

// Límite de intentos en este dispositivo: tras 5 fallos seguidos hay que
// esperar, y la espera se duplica con cada fallo más (1, 2, 4… hasta 15 min).
// Frena a quien prueba contraseñas a mano desde la app; el límite de fondo
// contra ataques automatizados lo pone el servicio de acceso (Supabase), que
// también limita los intentos por dirección de red.
const CLAVE_INTENTOS = 'acceso-intentos';
const CLAVE_CORREO = 'acceso-correo';
const INTENTOS_LIBRES = 5;
function leerIntentos(): { fallos: number; hasta: number } {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_INTENTOS) || 'null');
    if (v && typeof v.fallos === 'number' && typeof v.hasta === 'number') return v;
  } catch { /* sin almacenamiento */ }
  return { fallos: 0, hasta: 0 };
}
function guardarIntentos(v: { fallos: number; hasta: number } | null) {
  try {
    if (v) localStorage.setItem(CLAVE_INTENTOS, JSON.stringify(v));
    else localStorage.removeItem(CLAVE_INTENTOS);
  } catch { /* no crítico */ }
}
function tiempo(seg: number): string {
  const m = Math.floor(seg / 60), s = seg % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')} min` : `${s} s`;
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [modoOlvido, setModoOlvido] = useState(false);
  const [enviado, setEnviado] = useState(false);
  // Demo: cuál de los dos accesos se está abriendo (para su indicador).
  const [entrando, setEntrando] = useState<ClaveAcceso | null>(null);
  const [verClave, setVerClave] = useState(false);
  const [recordar, setRecordar] = useState(false);
  const [mayusculas, setMayusculas] = useState(false);
  // Segundos que faltan para poder intentar de nuevo (0 = sin bloqueo).
  const [espera, setEspera] = useState(0);
  // Para las cámaras y la sirena: en qué campo se escribe y si la alarma
  // está sonando (unos segundos tras una contraseña equivocada).
  const [foco, setFoco] = useState<'correo' | 'clave' | null>(null);
  const [alarma, setAlarma] = useState(false);
  const relojAlarma = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sinMovimiento = !!useReducedMotion();

  function dispararAlarma() {
    if (relojAlarma.current) clearTimeout(relojAlarma.current);
    setAlarma(true);
    relojAlarma.current = setTimeout(() => setAlarma(false), 3200);
  }
  useEffect(() => () => { if (relojAlarma.current) clearTimeout(relojAlarma.current); }, []);

  // Correo recordado y bloqueo vigente: se leen ya montado (no en el render).
  useEffect(() => {
    try {
      const c = localStorage.getItem(CLAVE_CORREO);
      if (c) { setEmail(c); setRecordar(true); }
    } catch { /* sin almacenamiento */ }
    const tic = () => setEspera(Math.max(0, Math.ceil((leerIntentos().hasta - Date.now()) / 1000)));
    tic();
    const t = setInterval(tic, 1000);
    return () => clearInterval(t);
  }, []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const theme = useTheme();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (leerIntentos().hasta > Date.now()) return;
    await entrar(email.trim(), password, true);
  }

  async function entrar(correo: string, contrasena: string, contarIntentos = false) {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    // ===== PASO 1: Autenticar en Supabase =====
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: correo,
      password: contrasena,
    });

    setLoading(false);

    if (authError) {
      // El servicio de acceso también corta cuando hay demasiados intentos.
      if (authError.status === 429) {
        setError('Demasiados intentos. Espera unos minutos antes de volver a intentar.');
        return;
      }
      dispararAlarma();
      if (contarIntentos) {
        const fallos = leerIntentos().fallos + 1;
        const bloqueoMin = fallos >= INTENTOS_LIBRES ? Math.min(15, 2 ** (fallos - INTENTOS_LIBRES)) : 0;
        guardarIntentos({ fallos, hasta: bloqueoMin ? Date.now() + bloqueoMin * 60000 : 0 });
        if (bloqueoMin) {
          setEspera(bloqueoMin * 60);
          setPassword('');
          setError(null);
        } else {
          const quedan = INTENTOS_LIBRES - fallos;
          setError(`Correo o contraseña incorrectos. ${quedan === 1 ? 'Queda 1 intento' : `Quedan ${quedan} intentos`} antes de una pausa de seguridad.`);
        }
        return;
      }
      setError('Correo o contraseña incorrectos.');
      return;
    }

    if (!data.user) {
      setError('Usuario no encontrado.');
      return;
    }

    // ===== PASO 2: VALIDAR QUE LA CUENTA SEA VÁLIDA (OWASP A07) =====
    // Rechaza cuentas de prueba (es_cuenta_prueba=true) e inactivas (activo=false)
    const validation = await validateLoginUser(supabase, data.user.id);

    if (!validation.valid) {
      // Desautenticar inmediatamente si falla la validación (solo esta sesión)
      await supabase.auth.signOut({ scope: 'local' });
      setError(validation.reason || 'No tienes permiso para acceder');
      return;
    }

    // Entró: se borra la cuenta de fallos y se recuerda (o se olvida) el correo.
    if (contarIntentos) {
      guardarIntentos(null);
      try {
        if (recordar) localStorage.setItem(CLAVE_CORREO, correo);
        else localStorage.removeItem(CLAVE_CORREO);
      } catch { /* no crítico */ }
    }

    // ===== PASO 3: Si todo está bien, redirigir =====
    // Solo se acepta una ruta interna. "next" viene de la URL, así que
    // alguien podría meter una URL externa (ej. ?next=https://evil.com)
    // para que, justo después de un login real, el navegador termine en
    // un sitio de phishing. Se descarta cualquier valor que no sea una
    // ruta relativa (rechaza también "//evil.com", que el navegador trata
    // como externa aunque empiece con una sola barra... con dos).
    const next = searchParams.get('next');
    const destino = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
    router.push(destino);
    router.refresh();
  }

  async function handleRecuperar(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/restablecer`,
    });

    // Se avisa lo mismo exista o no la cuenta. Decir "ese correo no está
    // registrado" le regala a cualquiera una lista de quién trabaja aquí.
    setLoading(false);
    setEnviado(true);
  }

  // ---------- Demo: portada con dos accesos, sin credenciales ----------
  // Las cuentas de ejemplo son públicas y compartidas, así que pedir correo
  // y contraseña solo estorba: se entra eligiendo el papel.
  if (DEMO.activo) {
    async function abrir(clave: ClaveAcceso) {
      const cuenta = cuentaDemo(clave);
      setEntrando(clave);
      await entrar(cuenta.correo, cuenta.contrasena);
      setEntrando(null);
    }
    return <PortadaDemo onEntrar={abrir} entrando={entrando} ocupado={loading} error={error} />;
  }

  // Qué hacen las cámaras y la sirena en este momento.
  let modoVigilancia: ModoVigilancia = 'vigila';
  if (foco === 'correo') modoVigilancia = 'correo';
  if (foco === 'clave') modoVigilancia = 'clave';
  if (!modoOlvido && espera > 0) modoVigilancia = 'bloqueo';
  if (alarma) modoVigilancia = 'alarma';
  const avanceCorreo = Math.min(1, email.length / 26);

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Dos acentos de luz descentrados, no uno solo al centro — es lo que
          hace que el fondo se sienta compuesto y no un degradado genérico. */}
      <div className="pointer-events-none absolute -bottom-32 -right-20 w-80 h-80 rounded-full bg-amber/15 blur-[100px]" />
      <div className="pointer-events-none absolute -top-24 -left-16 w-64 h-64 rounded-full bg-teal/10 blur-[90px]" />

      <div className="absolute top-5 right-5 z-20">
        <ThemeToggle />
      </div>

      {/* Animación: un sistema fotovoltaico que se arma. En celular va
          completa arriba del formulario; en computadora el formulario va a la
          izquierda y la animación ocupa el lado derecho. */}
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-5 pt-14 pb-6 lg:flex-row lg:justify-start lg:gap-0 lg:p-5 lg:pl-[6%] xl:pl-[8%] relative z-10">
      <FondoFotovoltaico className="w-full max-w-md shrink-0 lg:absolute lg:max-w-none lg:w-[50%] xl:w-[56%] 2xl:w-[64%] lg:right-[2%] lg:bottom-[8%]" />

      {/* mt-9 en celular: espacio para las cámaras y la sirena, que sobresalen
          por arriba del formulario. */}
      <motion.form
        onSubmit={modoOlvido ? handleRecuperar : handleLogin}
        className="ambient-glow edge-highlight relative z-10 w-full max-w-sm lg:max-w-[400px] mt-9 lg:mt-0 glass-strong rounded-3xl p-8 shadow-diffuse border-white/10"
        // Contraseña equivocada: el formulario se sacude un instante.
        animate={alarma && !sinMovimiento ? { x: [0, -10, 9, -7, 5, -3, 0] } : { x: 0 }}
        transition={{ duration: 0.55 }}
      >
        <CamaraVigilancia lado="izq" modo={modoVigilancia} avance={avanceCorreo} />
        <CamaraVigilancia lado="der" modo={modoVigilancia} avance={avanceCorreo} />
        <SirenaAlarma modo={modoVigilancia} />

        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-5">
            {theme === 'dark' && (
              <>
                <div className="absolute inset-0 bg-teal rounded-full blur-3xl opacity-50 scale-125 animate-pulse" />
                <div className="absolute inset-0 bg-teal-glow rounded-full blur-2xl scale-110" />
              </>
            )}
            {theme === 'light' && (
              <>
                <div className="absolute inset-0 bg-teal rounded-full blur-3xl opacity-30 scale-125 animate-pulse" />
                <div className="absolute inset-0 bg-teal/20 rounded-full blur-2xl scale-110" />
              </>
            )}
            {/* relative: el logo va encima del resplandor, no teñido por él. */}
            <Logo variante="completo" size={56} className="relative" />
          </div>
          <p className="text-xs text-muted">
            {modoOlvido ? 'Recuperar contraseña' : MARCA.appNombre}
          </p>
        </div>

        <label htmlFor="acceso-correo" className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Correo</label>
        <div className="relative mb-4">
          <Mail size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            id="acceso-correo"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setFoco('correo')}
            onBlur={() => setFoco(null)}
            placeholder="usuario@empresa.com"
            className="w-full pl-10 pr-3.5 py-3 rounded-2xl bg-surface-2 border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[15px] transition-colors"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="email"
          />
        </div>

        {!modoOlvido && (
          <>
            <label htmlFor="acceso-clave" className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Contraseña</label>
            <div className="relative">
              <Lock size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                id="acceso-clave"
                type={verClave ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={(e) => setMayusculas(e.getModifierState?.('CapsLock') === true)}
                onFocus={() => setFoco('clave')}
                onBlur={() => { setMayusculas(false); setFoco(null); }}
                placeholder="••••••••"
                className="w-full pl-10 pr-12 py-3 rounded-2xl bg-surface-2 border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[15px] transition-colors"
                autoComplete="current-password"
                autoCapitalize="none"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setVerClave((v) => !v)}
                aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={verClave}
                title={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-muted hover:text-ink active:scale-90 transition"
              >
                {verClave ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {mayusculas && (
              <p className="text-[12.5px] text-amber font-medium mt-1.5 flex items-center gap-1.5">
                <AlertTriangle size={14} /> Bloq Mayús está activado
              </p>
            )}

            <label className="flex items-center gap-2.5 mt-3.5 mb-5 cursor-pointer select-none w-fit">
              <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} className="w-[18px] h-[18px] accent-teal" />
              <span className="text-[13.5px] text-ink/85">Recordar mi correo en este dispositivo</span>
            </label>
          </>
        )}

        {modoOlvido && !enviado && (
          <p className="text-[13px] text-muted mb-5 -mt-1">
            Te llega un enlace para poner una contraseña nueva. Revisa también la
            bandeja de no deseados.
          </p>
        )}

        {modoOlvido && enviado && (
          <div className="mb-5 p-3.5 rounded-2xl bg-surface-2 border border-line">
            <p className="text-[13.5px] text-ink/85">
              Si esa cuenta existe, el enlace va en camino.
            </p>
            <p className="text-[12.5px] text-muted mt-1.5">
              Caduca pronto y solo sirve una vez. Si no llega en unos minutos,
              avisa a tu supervisor: puede que el correo registrado no sea el tuyo.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-red text-[13px] -mt-2 mb-4">{error}</p>
        )}

        {!modoOlvido && espera > 0 && (
          <div role="alert" className="-mt-1 mb-4 p-3.5 rounded-2xl bg-red/10 border border-red/30 flex items-start gap-2.5">
            <ShieldAlert size={18} className="text-red shrink-0 mt-0.5" />
            <div className="text-[13px] leading-relaxed">
              <p className="font-semibold text-red">Demasiados intentos fallidos</p>
              <p className="text-ink/85">
                Por seguridad, espera <b className="tabular-nums">{tiempo(espera)}</b> para volver a intentar. Si no recuerdas
                tu contraseña, usa «¿Olvidaste tu contraseña?».
              </p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || (!modoOlvido && espera > 0)}
          className={`w-full py-3.5 rounded-2xl font-display font-semibold text-base tracking-wide transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] disabled:opacity-60 disabled:hover:translate-y-0 ${
            theme === 'dark' ? 'bg-teal text-inkOnAccent shadow-glow-teal hover:brightness-110' : ''
          }`}
          style={
            theme === 'light'
              ? { backgroundColor: 'rgb(var(--c-acento-solido))', color: '#FFFFFF', boxShadow: '0 6px 18px rgb(var(--c-acento-solido) / 0.35)' }
              : undefined
          }
        >
          {loading ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Loader2 size={18} className="animate-spin" />
              {modoOlvido ? 'Enviando…' : 'Entrando…'}
            </span>
          ) : modoOlvido ? (enviado ? 'Enviar de nuevo' : 'Enviar enlace')
            : espera > 0 ? `Espera ${tiempo(espera)}` : 'Entrar'}
        </button>

        <button
          type="button"
          onClick={() => {
            setModoOlvido((v) => !v);
            setEnviado(false);
            setError(null);
          }}
          className="w-full min-h-[44px] mt-3 text-[13.5px] text-muted hover:text-ink active:scale-95 transition-all duration-150"
        >
          {modoOlvido ? 'Volver a entrar' : '¿Olvidaste tu contraseña?'}
        </button>

        <Link
          href="/aviso-privacidad"
          className="block text-center text-[12px] text-faint hover:text-muted mt-4 active:scale-95 transition-all duration-150"
        >
          Aviso de privacidad
        </Link>
      </motion.form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
