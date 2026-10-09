import Link from 'next/link';
import Logo from '@/components/Logo';
import Escena404 from '@/components/Escena404';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-5 relative overflow-hidden">
      <div className="pointer-events-none absolute -bottom-32 -right-20 w-80 h-80 rounded-full bg-amber/15 blur-[100px]" />
      <div className="pointer-events-none absolute -top-24 -left-16 w-64 h-64 rounded-full bg-teal/10 blur-[90px]" />

      <div className="relative z-10 w-full max-w-md flex flex-col items-center text-center">
        <Logo variante="completo" size={40} />

        <div className="w-full flex justify-center mt-6 mb-2">
          <Escena404 />
        </div>

        <h1 className="font-display font-bold text-[24px] tracking-wide mb-2">Esta página sigue en obra</h1>
        <p className="text-[14px] text-muted leading-relaxed mb-7 max-w-[330px]">
          No encontramos lo que buscabas: el enlace puede estar mal escrito o la página ya no existe.
        </p>

        <Link
          href="/"
          className="w-full max-w-[300px] py-3 rounded-2xl font-display font-semibold text-[14.5px] tracking-wide bg-teal text-inkOnAccent shadow-glow-teal transition-all duration-150 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:scale-[0.97]"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
