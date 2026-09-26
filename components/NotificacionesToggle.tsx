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

  // Ya activas: una sola línea discreta. Mientras están apagadas, la
  // invitación sí va completa porque es una acción que conviene hacer.
  if (activas) {
    return (
      <div className="mb-4 rounded-2xl bg-surface-2 border border-line">
        <div className="flex items-center gap-2.5 px-4 min-h-[48px]">
          <BellRing size={16} strokeWidth={2.4} className="text-teal shrink-0" />
          <span className="text-[13.5px] font-medium flex-1">Notificaciones activas</span>
          <button onClick={() => setAbierto((v) => !v)} className="text-[13px] font-semibold text-teal flex items-center gap-1">
            {abierto ? 'Cerrar' : 'Ajustar'}
            {abierto ? <ChevronUp size={15} strokeWidth={2.4} /> : <ChevronDown size={15} strokeWidth={2.4} />}
          </button>
        </div>
        {abierto && (
          <div className="px-4 pb-4 flex flex-col">
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
            <button
              onClick={alternar}
              disabled={cargando}
              className="mt-3 min-h-[42px] rounded-xl border border-line-strong text-[13px] font-medium text-ink/80 disabled:opacity-60"
            >
              Desactivar en este dispositivo
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={alternar}
      disabled={cargando}
      className="w-full mb-4 p-4 rounded-2xl border bg-teal/10 border-teal/30 text-left flex items-center gap-3 active:scale-[0.99] transition-transform disabled:opacity-60"
    >
      <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-teal">
        <Bell size={19} strokeWidth={2.4} className="text-inkOnAccent" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold mb-0.5">Activar notificaciones</p>
        <p className="text-[12.5px] text-muted leading-relaxed">Recibe avisos en el celular aunque la app esté cerrada.</p>
      </div>
    </button>
  );
}
