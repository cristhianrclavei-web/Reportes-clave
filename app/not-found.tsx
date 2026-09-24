import Link from 'next/link';
import Logo from '@/components/Logo';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-5 relative overflow-hidden">
      <div className="pointer-events-none absolute -bottom-32 -right-20 w-80 h-80 rounded-full bg-amber/15 blur-[100px]" />
      <div className="pointer-events-none absolute -top-24 -left-16 w-64 h-64 rounded-full bg-teal/10 blur-[90px]" />

      <div className="ambient-glow edge-highlight relative z-10 w-full max-w-sm glass-strong rounded-3xl p-8 shadow-diffuse border-white/10 flex flex-col items-center text-center">
        <Logo variante="completo" size={44} />

        <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center my-6">
          <Compass size={24} strokeWidth={1.8} className="text-faint" />
        </div>

        <p className="font-display font-bold text-[15px] tracking-wider text-faint mb-1.5">404</p>
        <h1 className="font-display font-bold text-[20px] tracking-wide mb-2">No encontramos esta página</h1>
        <p className="text-[13.5px] text-muted leading-relaxed mb-7">
          El enlace puede estar mal escrito o la página ya no existe. Revisa la dirección o vuelve al inicio.
        </p>

        <Link
          href="/"
          className="w-full py-3 rounded-2xl font-display font-semibold text-[14.5px] tracking-wide bg-teal text-inkOnAccent shadow-glow-teal transition-all duration-150 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:scale-[0.97]"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
