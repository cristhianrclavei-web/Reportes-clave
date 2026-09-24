'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabaseClient';
import { validateLoginUser } from '@/lib/validateLoginUser'; // NUEVO - OWASP A07
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/lib/useTheme';
import Logo from '@/components/Logo';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [modoOlvido, setModoOlvido] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const theme = useTheme();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();

    // ===== PASO 1: Autenticar en Supabase =====
    const { data, error: authError } = await supabase.auth.signInWithPassword({ 
      email, 
      password 
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
      // Desautenticar inmediatamente si falla la validación
      await supabase.auth.signOut();
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

  return (
    <div className="min-h-screen flex items-center justify-center p-5 relative overflow-hidden">
      {/* Dos acentos de luz descentrados, no uno solo al centro — es lo que
          hace que el fondo se sienta compuesto y no un degradado genérico. */}
      <div className="pointer-events-none absolute -bottom-32 -right-20 w-80 h-80 rounded-full bg-amber/15 blur-[100px]" />
      <div className="pointer-events-none absolute -top-24 -left-16 w-64 h-64 rounded-full bg-teal/10 blur-[90px]" />

      <div className="absolute top-5 right-5 z-20">
        <ThemeToggle />
      </div>

      <form
        onSubmit={modoOlvido ? handleRecuperar : handleLogin}
        className="ambient-glow edge-highlight relative z-10 w-full max-w-sm glass-strong rounded-3xl p-8 shadow-diffuse border-white/10"
      >
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
                <div className="absolute inset-0 rounded-full blur-3xl opacity-60 scale-125 animate-pulse" style={{ backgroundColor: '#3B82F6' }} />
                <div className="absolute inset-0 rounded-full blur-2xl scale-110" style={{ backgroundColor: 'rgba(59,130,246,0.35)' }} />
              </>
            )}
            <Logo variante="completo" size={56} />
          </div>
          <p className="text-xs text-muted">
            {modoOlvido ? 'Recuperar contraseña' : 'Reportes de servicio'}
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
              ? { backgroundColor: '#21563E', color: '#FFFFFF', boxShadow: '0 6px 18px rgba(33,86,62,0.35)' }
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
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
