'use client';

import { useEffect } from 'react';
import Logo from '@/components/Logo';
import { AlertTriangle } from 'lucide-react';

// Límite de error de la ruta raíz: atrapa lo que se rompa al renderizar
// cualquier pantalla y evita que el usuario se quede viendo la página en
// blanco genérica de Next.js. `reset()` reintenta el render sin recargar
// toda la app — sirve para errores pasajeros (ej. una petición que falló).
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-5 relative overflow-hidden">
      <div className="pointer-events-none absolute -bottom-32 -right-20 w-80 h-80 rounded-full bg-red/10 blur-[100px]" />
      <div className="pointer-events-none absolute -top-24 -left-16 w-64 h-64 rounded-full bg-teal/10 blur-[90px]" />

      <div className="ambient-glow edge-highlight relative z-10 w-full max-w-sm glass-strong rounded-3xl p-8 shadow-diffuse border-white/10 flex flex-col items-center text-center">
        <Logo variante="completo" size={44} />

        <div className="w-14 h-14 rounded-2xl bg-red/10 border border-red/25 flex items-center justify-center my-6">
          <AlertTriangle size={24} strokeWidth={1.8} className="text-red" />
        </div>

        <h1 className="font-display font-bold text-[20px] tracking-wide mb-2">Algo salió mal</h1>
        <p className="text-[13.5px] text-muted leading-relaxed mb-7">
          No se pudo cargar esta pantalla. Puede ser algo pasajero — intenta de nuevo, y si sigue,
          avisa a soporte.
        </p>

        <button
          onClick={reset}
          className="w-full py-3 rounded-2xl font-display font-semibold text-[14.5px] tracking-wide bg-teal text-inkOnAccent shadow-glow-teal transition-all duration-150 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:scale-[0.97]"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
