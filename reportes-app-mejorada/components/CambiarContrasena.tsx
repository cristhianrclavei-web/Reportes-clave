'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabaseClient';
import { showToast } from '@/components/Toast';
import { KeyRound, Eye, EyeOff, AlertCircle, Check } from 'lucide-react';

const MINIMO = 8;

export default function CambiarContrasena({ email }: { email: string }) {
  const [abierto, setAbierto] = useState(false);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [verActual, setVerActual] = useState(false);
  const [verNueva, setVerNueva] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cortaDemas = nueva.length > 0 && nueva.length < MINIMO;
  const noCoinciden = repetida.length > 0 && nueva !== repetida;
  const esLaMisma = nueva.length > 0 && nueva === actual;

  const puedeGuardar =
    actual.length > 0 &&
    nueva.length >= MINIMO &&
    nueva === repetida &&
    !esLaMisma &&
    !guardando;

  function limpiar() {
    setActual(''); setNueva(''); setRepetida('');
    setError(''); setVerActual(false); setVerNueva(false);
  }

  async function handleGuardar() {
    if (!puedeGuardar) return;
    setGuardando(true);
    setError('');

    const supabase = createClient();

    // Supabase no exige la contraseña actual para cambiarla. Sin este paso,
    // un celular desbloqueado sobre la mesa basta para que cualquiera deje
    // al dueño fuera de su propia cuenta.
    const { error: eAuth } = await supabase.auth.signInWithPassword({
      email,
      password: actual,
    });

    if (eAuth) {
      setError('La contraseña actual no es correcta.');
      setGuardando(false);
      return;
    }

    const { error: ePass } = await supabase.auth.updateUser({ password: nueva });

    if (ePass) {
      setError(ePass.message || 'No se pudo cambiar la contraseña.');
      setGuardando(false);
      return;
    }

    limpiar();
    setAbierto(false);
    setGuardando(false);
    showToast('Contraseña actualizada', 'success');
  }

  const claseCampo = (malo: boolean) =>
    `w-full min-h-[52px] pl-4 pr-12 rounded-xl bg-surface-2 border text-[16px] text-ink placeholder:text-faint outline-none transition-colors ${
      malo ? 'border-red' : 'border-line focus:border-teal'
    }`;

  return (
    <div className="rounded-2xl bg-surface border border-line p-5 mb-6">
      <button
        onClick={() => { setAbierto((v) => !v); if (abierto) limpiar(); }}
        className="w-full min-h-[44px] flex items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2">
          <KeyRound size={17} strokeWidth={2.3} className="text-teal shrink-0" />
          <span className="font-display font-semibold text-[15.5px] tracking-wide">
            Cambiar contraseña
          </span>
        </span>
        <span className="text-[13px] text-teal font-medium shrink-0">
          {abierto ? 'Cancelar' : 'Cambiar'}
        </span>
      </button>

      {abierto && (
        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-faint mb-2">
              Contraseña actual
            </label>
            <div className="relative">
              <input
                type={verActual ? 'text' : 'password'}
                value={actual}
                onChange={(e) => { setActual(e.target.value); setError(''); }}
                autoComplete="current-password"
                disabled={guardando}
                className={claseCampo(false)}
              />
              <button
                type="button"
                onClick={() => setVerActual((v) => !v)}
                aria-label={verActual ? 'Ocultar' : 'Mostrar'}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-muted"
              >
                {verActual ? <EyeOff size={18} strokeWidth={2.2} /> : <Eye size={18} strokeWidth={2.2} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-faint mb-2">
              Contraseña nueva
            </label>
            <div className="relative">
              <input
                type={verNueva ? 'text' : 'password'}
                value={nueva}
                onChange={(e) => { setNueva(e.target.value); setError(''); }}
                autoComplete="new-password"
                disabled={guardando}
                className={claseCampo(cortaDemas || esLaMisma)}
              />
              <button
                type="button"
                onClick={() => setVerNueva((v) => !v)}
                aria-label={verNueva ? 'Ocultar' : 'Mostrar'}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-muted"
              >
                {verNueva ? <EyeOff size={18} strokeWidth={2.2} /> : <Eye size={18} strokeWidth={2.2} />}
              </button>
            </div>
            <p className={`text-[12.5px] mt-2 ${cortaDemas ? 'text-red' : 'text-muted'}`}>
              {esLaMisma
                ? 'La nueva tiene que ser distinta de la actual.'
                : `Mínimo ${MINIMO} caracteres.`}
            </p>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-faint mb-2">
              Repetir la nueva
            </label>
            <input
              type={verNueva ? 'text' : 'password'}
              value={repetida}
              onChange={(e) => { setRepetida(e.target.value); setError(''); }}
              autoComplete="new-password"
              disabled={guardando}
              className={claseCampo(noCoinciden)}
            />
            {noCoinciden && (
              <p className="text-[12.5px] text-red mt-2 flex items-center gap-1.5">
                <AlertCircle size={14} strokeWidth={2.4} />
                Las dos no son iguales.
              </p>
            )}
          </div>

          {error && (
            <p className="text-[13px] text-red flex items-start gap-1.5">
              <AlertCircle size={15} strokeWidth={2.4} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </p>
          )}

          <button
            onClick={handleGuardar}
            disabled={!puedeGuardar}
            className={`w-full min-h-[56px] rounded-2xl font-display font-semibold text-[16px] tracking-wide flex items-center justify-center gap-2 transition-transform ${
              puedeGuardar
                ? 'bg-teal text-inkOnAccent shadow-glow-teal active:scale-[0.98]'
                : 'bg-surface-2 text-faint'
            }`}
          >
            {guardando ? 'Guardando...' : (<><Check size={19} strokeWidth={2.6} />Cambiar contraseña</>)}
          </button>
        </div>
      )}
    </div>
  );
}
