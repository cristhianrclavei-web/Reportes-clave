'use client';

import { useEffect, useState } from 'react';
import { BellRing, BellOff, Bell } from 'lucide-react';
import {
  pushSoportado, permisoActual, activarNotificaciones,
  desactivarNotificaciones, tieneSuscripcionActiva,
  TIPOS_AVISO, TipoAviso, leerPreferencias, guardarPreferencia,
} from '@/lib/push';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { showToast } from '@/components/Toast';

// Interruptor de notificaciones. Se muestra donde el usuario ya está
// atendiendo su trabajo, no como un aviso al entrar: pedir el permiso de golpe
// al abrir la app es la forma más rápida de que lo nieguen para siempre.
export default function NotificacionesToggle({ esTecnico = false }: { esTecnico?: boolean }) {
  const [activas, setActivas] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [cargando, setCargando] = useState(true);
  const [bloqueado, setBloqueado] = useState(false);

  useEffect(() => {
    if (!pushSoportado()) {
      setCargando(false);
      return;
    }
    setBloqueado(permisoActual() === 'denied');
    tieneSuscripcionActiva()
      .then(setActivas)
      .finally(() => setCargando(false));
    leerPreferencias().then(setPrefs).catch(() => {});
  }, []);

  async function alternarTipo(tipo: TipoAviso) {
    const nuevo = !prefs[tipo];
    setPrefs((p) => ({ ...p, [tipo]: nuevo }));
    try {
      await guardarPreferencia(tipo, nuevo);
    } catch {
      setPrefs((p) => ({ ...p, [tipo]: !nuevo }));
      alert('No se pudo guardar la preferencia.');
    }
  }

  // Al técnico solo le sirven los avisos dirigidos a él.
  const tiposVisibles = TIPOS_AVISO.filter((t) => (esTecnico ? t.paraTecnico : !t.paraTecnico));

  if (!pushSoportado() || cargando) return null;

  async function alternar() {
    setCargando(true);
    try {
      if (activas) {
        await desactivarNotificaciones();
        setActivas(false);
        showToast('Notificaciones desactivadas', 'success');
      } else {
        const r = await activarNotificaciones();
        if (r.ok) {
          setActivas(true);
          showToast('Notificaciones activadas', 'success');
        } else {
          setBloqueado(permisoActual() === 'denied');
          alert(r.motivo || 'No se pudieron activar.');
        }
      }
    } finally {
      setCargando(false);
    }
  }

  if (bloqueado && !activas) {
    return (
      <div className="mb-4 p-4 rounded-2xl bg-surface-2 border border-line flex items-start gap-3">
        <span className="w-10 h-10 rounded-full bg-surface flex items-center justify-center shrink-0">
          <BellOff size={19} strokeWidth={2.3} className="text-muted" />
        </span>
        <p className="text-[13px] text-muted leading-relaxed">
          Las notificaciones están bloqueadas para este sitio. Para recibirlas, actívalas en los ajustes
          del navegador y vuelve a entrar.
        </p>
      </div>
    );
  }

  return (
    <div className={`mb-4 rounded-2xl border ${activas ? 'bg-surface-2 border-line' : 'bg-teal/10 border-teal/30'}`}>
      <button
        onClick={alternar}
        disabled={cargando}
        className="w-full p-4 text-left flex items-start gap-3 active:scale-[0.99] transition-transform disabled:opacity-60"
      >
        {/* Círculo de color para que el estado se lea de un vistazo, sin
            depender de distinguir campana de campana tachada. */}
        <span
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            activas ? 'bg-teal/15' : 'bg-teal'
          }`}
        >
          {activas ? (
            <BellRing size={19} strokeWidth={2.3} className="text-teal" />
          ) : (
            <Bell size={19} strokeWidth={2.4} className="text-inkOnAccent" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold mb-0.5 flex items-center gap-2">
            {activas ? 'Notificaciones activadas' : 'Activar notificaciones'}
            {activas && <span className="w-2 h-2 rounded-full bg-teal shrink-0" aria-hidden="true" />}
          </p>
          <p className="text-[12.5px] text-muted leading-relaxed">
            {activas
              ? 'Este dispositivo recibe avisos aunque la app esté cerrada. Toca para desactivarlas.'
              : 'Recibe avisos en el celular aunque la app esté cerrada.'}
          </p>
        </div>
      </button>

      {/* Qué recibir. Sin esto, notificar todo lleva a que la gente silencie
          la app y se pierdan los avisos que sí exigen acción. */}
      {activas && (
        <div className="px-4 pb-4">
          <button
            onClick={() => setAbierto((v) => !v)}
            className="w-full min-h-[42px] flex items-center justify-between text-[13.5px] font-medium text-ink/80 border-t border-line pt-3"
          >
            Elegir qué avisos recibir
            {abierto ? <ChevronUp size={16} strokeWidth={2.4} /> : <ChevronDown size={16} strokeWidth={2.4} />}
          </button>

          {abierto && (
            <div className="mt-2 flex flex-col">
              {tiposVisibles.map((t) => (
                <label key={t.valor} className="flex items-start gap-3 py-2.5 border-t border-line cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!prefs[t.valor]}
                    onChange={() => alternarTipo(t.valor)}
                    className="w-5 h-5 accent-teal mt-0.5 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium">{t.label}</span>
                    <span className="block text-[12.5px] text-muted leading-snug">{t.detalle}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
