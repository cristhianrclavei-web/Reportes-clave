'use client';

import { useEffect, useState } from 'react';

type ToastMsg = { id: number; text: string; kind: 'success' | 'error' };

export function showToast(text: string, kind: 'success' | 'error' = 'success') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { text, kind } }));
  // Confirmación táctil sutil en celular — la mayoría de los toasts salen
  // justo después de guardar algo (cerrar un día, firmar, crear un
  // cliente), así que es el punto central donde ponerlo cubre casi toda la
  // app sin tocar cada pantalla. Sin soporte en iOS Safari; se degrada
  // solo (el try/catch cubre navegadores que además lo bloquean sin gesto
  // reciente del usuario).
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(kind === 'success' ? 12 : [15, 40, 15]);
    }
  } catch {}
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent).detail as { text: string; kind?: 'success' | 'error' };
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, text: detail.text, kind: detail.kind || 'success' }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    }
    window.addEventListener('app:toast', handler);
    return () => window.removeEventListener('app:toast', handler);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center px-4 w-full pointer-events-none"
      style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto max-w-[92vw] text-center px-4 py-2.5 rounded-full text-[13px] font-semibold shadow-glow ${
            t.kind === 'success' ? 'bg-teal text-inkOnAccent' : 'bg-red text-white'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
