'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabaseClient';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import { KeyRound, ShieldAlert, Eye, EyeOff } from 'lucide-react';

const MINIMO = 8;

// Aviso obligatorio de cambio de contraseña — independiente del de "cuenta
// de prueba" (AvisoCuentaPrueba), que deja el correo/contraseña como
// opcional. Varias cuentas siguen con la contraseña genérica con la que se
// dieron de alta; este aviso no se puede posponer: se queda hasta que la
// cuenta tenga una contraseña propia (profiles.credenciales_actualizadas).
export default function AvisoActualizarCredenciales() {
  const [pendiente, setPendiente] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [correoActual, setCorreoActual] = useState('');

  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [verActual, setVerActual] = useState(false);
  const [verNueva, setVerNueva] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setCorreoActual(user.email || '');

        const { data } = await supabase
          .from('profiles')
          .select('credenciales_actualizadas')
          .eq('id', user.id)
          .single();

        if (data && data.credenciales_actualizadas === false) setPendiente(true);
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  if (cargando || !pendiente) return null;

  const cortaDemas = nueva.length > 0 && nueva.length < MINIMO;
  const noCoinciden = repetida.length > 0 && nueva !== repetida;
  const esLaMisma = nueva.length > 0 && nueva === actual;
  const puedeGuardar = actual.length > 0 && nueva.length >= MINIMO && nueva === repetida && !esLaMisma && !guardando;

  async function handleGuardar() {
    if (!puedeGuardar) return;
    setGuardando(true);
    setError('');
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No hay sesión activa');

      // Mismo motivo que en CambiarContrasena: Supabase no pide la
      // contraseña actual para cambiarla, y sin este paso un celular
      // desbloqueado sobre la mesa bastaría para dejar a alguien fuera de
      // su propia cuenta.
      const { error: eAuth } = await supabase.auth.signInWithPassword({ email: correoActual, password: actual });
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

      const { error: ePerfil } = await supabase
        .from('profiles')
        .update({ credenciales_actualizadas: true })
        .eq('id', user.id);
      if (ePerfil) throw ePerfil;

      setPendiente(false);
      setAbierto(false);
      showToast('Contraseña actualizada', 'success');
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  const inputCls =
    'w-full px-3.5 min-h-[48px] pr-11 rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[15px]';
  const labelCls = 'text-[13px] text-ink/75 block mb-1.5';

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="w-full mb-4 p-4 rounded-2xl bg-red/10 border-2 border-red/40 text-left flex items-start gap-3 active:scale-[0.99] transition-transform"
      >
        <ShieldAlert size={18} strokeWidth={2.4} className="text-red shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-red mb-0.5">Hace falta actualizar tus credenciales</p>
          <p className="text-[12.5px] text-ink/80 leading-relaxed">
            Tu cuenta sigue con una contraseña genérica. Toca aquí para poner una propia — este aviso no desaparece hasta que la cambies.
          </p>
        </div>
      </button>

      {abierto && (
        <ModalOverlay onClose={() => setAbierto(false)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto">
            <p className="font-display font-semibold text-[17px] mb-1 flex items-center gap-2">
              <KeyRound size={19} strokeWidth={2.3} className="text-red" />
              Actualiza tu contraseña
            </p>
            <p className="text-[13px] text-muted mb-4 leading-relaxed">
              Por seguridad, cada cuenta necesita su propia contraseña. Este paso es obligatorio.
            </p>

            <label className={labelCls}>Contraseña actual</label>
            <div className="relative mb-4">
              <input
                type={verActual ? 'text' : 'password'}
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => setVerActual((v) => !v)}
                aria-label={verActual ? 'Ocultar' : 'Mostrar'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
              >
                {verActual ? <EyeOff size={17} strokeWidth={2.2} /> : <Eye size={17} strokeWidth={2.2} />}
              </button>
            </div>

            <label className={labelCls}>Nueva contraseña</label>
            <div className="relative mb-1">
              <input
                type={verNueva ? 'text' : 'password'}
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => setVerNueva((v) => !v)}
                aria-label={verNueva ? 'Ocultar' : 'Mostrar'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
              >
                {verNueva ? <EyeOff size={17} strokeWidth={2.2} /> : <Eye size={17} strokeWidth={2.2} />}
              </button>
            </div>
            <p className="text-[12px] text-muted mb-3">Mínimo {MINIMO} caracteres.</p>
            {cortaDemas && <p className="text-red text-[12px] mb-3">Necesita al menos {MINIMO} caracteres.</p>}
            {esLaMisma && <p className="text-red text-[12px] mb-3">Debe ser distinta de la actual.</p>}

            <label className={labelCls}>Repetir nueva contraseña</label>
            <input
              type={verNueva ? 'text' : 'password'}
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
              className={`${inputCls} pr-3.5 mb-1`}
            />
            {noCoinciden && <p className="text-red text-[12px] mb-3">No coincide con la nueva contraseña.</p>}

            {error && <p className="text-red text-[12.5px] mt-2 mb-1">{error}</p>}

            <button
              onClick={handleGuardar}
              disabled={!puedeGuardar}
              className="w-full min-h-[50px] mt-4 rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold disabled:opacity-50"
            >
              {guardando ? 'Guardando...' : 'Guardar nueva contraseña'}
            </button>
          </div>
        </ModalOverlay>
      )}
    </>
  );
}
