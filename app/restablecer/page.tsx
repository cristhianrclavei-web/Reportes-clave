'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabaseClient';
import ThemeToggle from '@/components/ThemeToggle';
import Logo from '@/components/Logo';
import { showToast } from '@/components/Toast';
import { Eye, EyeOff, AlertCircle, KeyRound } from 'lucide-react';

const MINIMO = 8;

function Formulario() {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  const [enlaceValido, setEnlaceValido] = useState(false);
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [ver, setVer] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // Al abrir el enlace del correo, Supabase deja una sesión de recuperación.
  // Si alguien llega aquí escribiendo la dirección a mano, no hay sesión y no
  // se le puede dejar cambiar nada.
  useEffect(() => {
    const supabase = createClient();
    let cancelado = false;

    async function revisar() {
      const { data } = await supabase.auth.getSession();
      if (cancelado) return;
      setEnlaceValido(!!data.session);
      setListo(true);
    }

    // La sesión puede tardar un instante en asentarse tras leer el enlace.
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY' || evento === 'SIGNED_IN') {
        setEnlaceValido(true);
        setListo(true);
      }
    });

    revisar();
    return () => { cancelado = true; sub.subscription.unsubscribe(); };
  }, []);

  const corta = nueva.length > 0 && nueva.length < MINIMO;
  const noCoinciden = repetida.length > 0 && nueva !== repetida;
  const puedeGuardar = nueva.length >= MINIMO && nueva === repetida && !guardando;

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault();
    if (!puedeGuardar) return;
    setGuardando(true);
    setError('');

    const supabase = createClient();
    const { error: ePass } = await supabase.auth.updateUser({ password: nueva });

    if (ePass) {
      setError(ePass.message || 'No se pudo cambiar la contraseña.');
      setGuardando(false);
      return;
    }

    showToast('Contraseña actualizada. Ya puedes entrar.', 'success');
    router.push('/');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      <div className="absolute top-5 right-5 z-20"><ThemeToggle /></div>

      <div className="relative z-10 w-full max-w-sm glass-strong rounded-3xl p-8 shadow-glow">
        <div className="flex flex-col items-center mb-7">
          <Logo variante="completo" size={48} />
          <p className="text-xs text-muted mt-4">Nueva contraseña</p>
        </div>

        {!listo ? (
          <p className="text-[14px] text-muted text-center py-6">Verificando el enlace...</p>
        ) : !enlaceValido ? (
          <div className="text-center">
            <KeyRound size={30} strokeWidth={1.8} className="text-muted mx-auto mb-4" />
            <p className="text-[14.5px] text-ink/85 mb-2">Este enlace ya no sirve.</p>
            <p className="text-[13px] text-muted mb-6">
              Los enlaces de recuperación caducan al poco tiempo y solo se pueden usar una vez.
              Pide uno nuevo desde la pantalla de entrada.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-2xl bg-surface-2 border border-line text-[15px] font-medium"
            >
              Volver a entrar
            </Link>
          </div>
        ) : (
          <form onSubmit={handleGuardar}>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">
              Contraseña nueva
            </label>
            <div className="relative mb-1">
              <input
                type={ver ? 'text' : 'password'}
                required
                value={nueva}
                onChange={(e) => { setNueva(e.target.value); setError(''); }}
                autoComplete="new-password"
                className={`w-full pl-3.5 pr-12 py-3 rounded-2xl bg-surface-2 border text-[16px] outline-none transition-colors ${
                  corta ? 'border-red' : 'border-line focus:border-teal'
                }`}
              />
              <button
                type="button"
                onClick={() => setVer((v) => !v)}
                aria-label={ver ? 'Ocultar' : 'Mostrar'}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-muted"
              >
                {ver ? <EyeOff size={18} strokeWidth={2.2} /> : <Eye size={18} strokeWidth={2.2} />}
              </button>
            </div>
            <p className={`text-[12.5px] mb-4 ${corta ? 'text-red' : 'text-muted'}`}>
              Mínimo {MINIMO} caracteres.
            </p>

            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">
              Repetir la nueva
            </label>
            <input
              type={ver ? 'text' : 'password'}
              required
              value={repetida}
              onChange={(e) => { setRepetida(e.target.value); setError(''); }}
              autoComplete="new-password"
              className={`w-full px-3.5 py-3 mb-1 rounded-2xl bg-surface-2 border text-[16px] outline-none transition-colors ${
                noCoinciden ? 'border-red' : 'border-line focus:border-teal'
              }`}
            />
            {noCoinciden && (
              <p className="text-[12.5px] text-red mb-3 flex items-center gap-1.5">
                <AlertCircle size={14} strokeWidth={2.4} />Las dos no son iguales.
              </p>
            )}

            {error && (
              <p className="text-[13px] text-red mt-3 mb-1 flex items-start gap-1.5">
                <AlertCircle size={15} strokeWidth={2.4} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </p>
            )}

            <button
              type="submit"
              disabled={!puedeGuardar}
              className={`w-full mt-4 py-3.5 rounded-2xl font-display font-semibold text-base tracking-wide active:scale-95 transition-transform ${
                puedeGuardar ? 'bg-teal text-inkOnAccent shadow-glow-teal' : 'bg-surface-2 text-faint'
              }`}
            >
              {guardando ? 'Guardando...' : 'Guardar y entrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function RestablecerPage() {
  return (
    <Suspense fallback={null}>
      <Formulario />
    </Suspense>
  );
}
