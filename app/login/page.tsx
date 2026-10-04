'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabaseClient';
import { validateLoginUser } from '@/lib/validateLoginUser'; // NUEVO - OWASP A07
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/lib/useTheme';
import Logo from '@/components/Logo';
import { DEMO, MARCA } from '@/lib/marca';
import PortadaDemo, { ClaveAcceso, cuentaDemo } from '@/components/PortadaDemo';
import { CalendarDays, FileSignature, PackageCheck, ShieldCheck } from 'lucide-react';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [modoOlvido, setModoOlvido] = useState(false);
  const [enviado, setEnviado] = useState(false);
  // Demo: cuál de los dos accesos se está abriendo (para su indicador).
  const [entrando, setEntrando] = useState<ClaveAcceso | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const theme = useTheme();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    await entrar(email, password);
  }

  async function entrar(correo: string, contrasena: string) {
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

  return (
    <div className="min-h-screen relative overflow-hidden lg:grid lg:grid-cols-[1.08fr_1fr]">
      {/* Dos acentos de luz descentrados, no uno solo al centro — es lo que
          hace que el fondo se sienta compuesto y no un degradado genérico. */}
      <div className="pointer-events-none absolute -bottom-32 -right-20 w-80 h-80 rounded-full bg-amber/15 blur-[100px]" />
      <div className="pointer-events-none absolute -top-24 -left-16 w-64 h-64 rounded-full bg-teal/10 blur-[90px]" />

      <div className="absolute top-5 right-5 z-20">
        <ThemeToggle />
      </div>

      {/* Computadora: a la izquierda la marca y para qué sirve la app; el
          acceso queda a la derecha. En celular solo se ve la tarjeta. */}
      <aside className="hidden lg:flex relative z-10 flex-col justify-between p-12 xl:p-16 border-r border-line bg-gradient-to-br from-teal/[0.14] via-teal/[0.05] to-transparent">
        <Logo variante="completo" size={64} />
        <div className="max-w-xl">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-teal mb-3">{MARCA.nombre}</p>
          <h1 className="font-display font-bold text-[44px] xl:text-[54px] leading-[1.04] tracking-wide">{MARCA.appNombre}</h1>
          <p className="mt-4 text-[16.5px] text-muted leading-relaxed">
            La operación de campo en un solo lugar: lo que se agenda, lo que se hace y lo que se entrega al cliente.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              { Icono: CalendarDays, titulo: 'Servicios y agenda', texto: 'El tablero del día y la semana de todo el equipo.' },
              { Icono: FileSignature, titulo: 'Reportes firmados', texto: 'Fotos, materiales y firma del cliente, con su PDF.' },
              { Icono: PackageCheck, titulo: 'Cotizaciones y almacén', texto: 'Del presupuesto al material que sale a cada servicio.' },
            ].map((f) => (
              <li key={f.titulo} className="flex items-start gap-3.5">
                <span className="w-10 h-10 rounded-xl bg-teal/15 border border-teal/25 text-teal flex items-center justify-center shrink-0">
                  <f.Icono size={19} strokeWidth={2.1} />
                </span>
                <div>
                  <p className="font-semibold text-[15px]">{f.titulo}</p>
                  <p className="text-[13.5px] text-muted">{f.texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[12.5px] text-muted flex items-center gap-2">
          <ShieldCheck size={15} className="text-teal shrink-0" />
          Acceso solo para personal autorizado de {MARCA.nombre}.
        </p>
      </aside>

      <div className="min-h-screen flex items-center justify-center p-5 relative z-10">

      <form
        onSubmit={modoOlvido ? handleRecuperar : handleLogin}
        className="ambient-glow edge-highlight relative z-10 w-full max-w-sm lg:max-w-[420px] glass-strong rounded-3xl p-8 lg:p-9 shadow-diffuse border-white/10"
      >
        {/* En computadora la marca ya está a la izquierda: aquí va el título. */}
        <div className="hidden lg:block mb-7">
          <h2 className="font-display font-bold text-[26px] tracking-wide leading-tight">
            {modoOlvido ? 'Recuperar contraseña' : 'Inicia sesión'}
          </h2>
          <p className="text-[13.5px] text-muted mt-1">
            {modoOlvido ? 'Escribe el correo de tu cuenta.' : 'Entra con el correo y la contraseña de tu cuenta.'}
          </p>
        </div>
        <div className="flex flex-col items-center mb-8 lg:hidden">
          <div className="relative mb-5">
            {theme === 'dark' && (
              <>
                <div className="absolute inset-0 bg-teal rounded-full blur-3xl opacity-50 scale-125 animate-pulse" />
                <div className="absolute inset-0 bg-teal-glow rounded-full blur-2xl scale-110" />
              </>
            )}
            {theme === 'light' && (
              <>
                <div className="absolute inset-0 rounded-full blur-3xl opacity-60 scale-125 animate-pulse" style={{ backgroundColor: '#3B82F6' }} />
                <div className="absolute inset-0 rounded-full blur-2xl scale-110" style={{ backgroundColor: 'rgba(59,130,246,0.35)' }} />
              </>
            )}
            <Logo variante="completo" size={56} />
          </div>
          <p className="text-xs text-muted">
            {modoOlvido ? 'Recuperar contraseña' : MARCA.appNombre}
          </p>
        </div>

        <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Correo</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="usuario@empresa.com"
          className="w-full px-3.5 py-3 mb-4 rounded-2xl bg-surface-2 border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[15px] transition-colors"
          autoComplete="email"
        />

        {!modoOlvido && (
          <>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-3 mb-5 rounded-2xl bg-surface-2 border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[15px] transition-colors"
              autoComplete="current-password"
            />
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
          <p className="text-red text-[13px] -mt-2 mb-4">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-3.5 rounded-2xl font-display font-semibold text-base tracking-wide transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] disabled:opacity-60 disabled:hover:translate-y-0 ${
            theme === 'dark' ? 'bg-teal text-inkOnAccent shadow-glow-teal hover:brightness-110' : ''
          }`}
          style={
            theme === 'light'
              ? { backgroundColor: 'rgb(var(--c-acento-solido))', color: '#FFFFFF', boxShadow: '0 6px 18px rgb(var(--c-acento-solido) / 0.35)' }
              : undefined
          }
        >
          {loading
            ? (modoOlvido ? 'Enviando...' : 'Entrando...')
            : (modoOlvido ? (enviado ? 'Enviar de nuevo' : 'Enviar enlace') : 'Entrar')}
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
      </form>
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
