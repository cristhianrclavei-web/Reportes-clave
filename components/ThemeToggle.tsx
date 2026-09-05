'use client';

import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const current = document.documentElement.classList.contains('light') ? 'light' : 'dark';
    setTheme(current);
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(next);
    try {
      localStorage.setItem('theme', next);
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Cambiar tema claro/oscuro"
      className="w-9 h-9 rounded-full border border-line-strong flex items-center justify-center shrink-0 active:scale-90 transition-transform bg-surface-2"
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
