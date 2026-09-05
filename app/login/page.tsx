'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabaseClient';
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/lib/useTheme';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const theme = useTheme();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError('Correo o contraseña incorrectos.');
      return;
    }
    router.push(searchParams.get('next') || '/');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5 relative overflow-hidden">
      {/* ambient glow accents */}
      <div className="pointer-events-none absolute -bottom-24 -right-16 w-72 h-72 rounded-full bg-amber/20 blur-3xl opacity-30" />

      <div className="absolute top-5 right-5 z-20">
        <ThemeToggle />
      </div>

      <form
        onSubmit={handleLogin}
        className="relative z-10 w-full max-w-sm glass-strong rounded-3xl p-8 shadow-glow"
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
            <img
              src={theme === 'light' ? '/brand/logo-rect-light.png' : '/brand/logo-rect.png'}
              alt="Clave Inteligente"
              className="relative h-32 w-auto"
              style={
                theme === 'dark'
                  ? { filter: 'drop-shadow(0 0 22px rgba(34,176,138,0.55)) brightness(1.06)' }
                  : { filter: 'drop-shadow(0 0 18px rgba(59,130,246,0.45))' }
              }
            />
          </div>
          <p className="text-xs text-muted">Reportes de servicio</p>
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

        {error && (
          <p className="text-red text-[13px] -mt-2 mb-4">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-3.5 rounded-2xl font-display font-semibold text-base tracking-wide active:scale-95 transition-transform disabled:opacity-60 ${
            theme === 'dark' ? 'bg-teal text-inkOnAccent shadow-glow-teal' : ''
          }`}
          style={
            theme === 'light'
              ? { backgroundColor: '#21563E', color: '#FFFFFF', boxShadow: '0 6px 18px rgba(33,86,62,0.35)' }
              : undefined
          }
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
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
