'use client';

import { useEffect, useState } from 'react';
import { navegarConTransicion } from '@/lib/nativeViewTransition';

// `variante="interruptor"`: pastilla con sol y luna y una perilla que se
// desliza; se usa donde el botón redondo quedaría suelto (portada del demo).
export default function ThemeToggle({
  className,
  variante = 'boton',
}: { className?: string; variante?: 'boton' | 'interruptor' } = {}) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const current = document.documentElement.classList.contains('light') ? 'light' : 'dark';
    setTheme(current);
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';

    function aplicar() {
      setTheme(next);
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(next);
      try {
        localStorage.setItem('theme', next);
      } catch {}
    }

    navegarConTransicion(aplicar);
  }

  if (variante === 'interruptor') {
    const claro = theme === 'light';
    return (
      <button
        type="button"
        role="switch"
        aria-checked={claro}
        onClick={toggle}
        aria-label="Cambiar tema claro/oscuro"
        className={`relative inline-flex items-center w-[64px] h-[32px] rounded-full border border-line bg-surface-2/80 backdrop-blur shrink-0 active:scale-95 transition-transform ${className || ''}`}
      >
        {/* Sol y luna fijos en el riel */}
        <svg className="absolute left-[9px] text-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
        </svg>
        <svg className="absolute right-[9px] text-muted" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20.7 15.3a8.5 8.5 0 1 1-10-10 6.8 6.8 0 0 0 10 10z" />
        </svg>
        {/* Perilla: tapa el ícono del tema activo */}
        <span
          className={`absolute top-[3px] left-[3px] w-[24px] h-[24px] rounded-full bg-teal text-inkOnAccent shadow-glow-teal flex items-center justify-center transition-transform duration-300 ease-out ${claro ? 'translate-x-0' : 'translate-x-[32px]'}`}
        >
          {claro ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4.2" />
              <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20.7 15.3a8.5 8.5 0 1 1-10-10 6.8 6.8 0 0 0 10 10z" />
            </svg>
          )}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Cambiar tema claro/oscuro"
      className={className || 'w-9 h-9 rounded-full border border-line-strong flex items-center justify-center shrink-0 active:scale-90 transition-transform bg-surface-2'}
    >
      {theme === 'dark' ? (
        // sun icon (tap to switch to light)
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
        </svg>
      ) : (
        // moon icon (tap to switch to dark)
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.7 15.3a8.5 8.5 0 1 1-10-10 6.8 6.8 0 0 0 10 10z" />
        </svg>
      )}
    </button>
  );
}
