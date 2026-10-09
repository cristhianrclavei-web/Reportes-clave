import Link from 'next/link';
import { BookOpen } from 'lucide-react';

// Acceso al manual de uso (/ayuda): un libro abierto, con el mismo botón
// redondo que el cambio de tema para que se lea como parte del encabezado.
// El manual muestra lo que corresponde al rol de quien entra.
// `sinTitulo`: donde ya hay una etiqueta propia al pasar el cursor (la barra
// de escritorio), para que no salga también la del navegador encima.
export default function BotonAyuda({ className, sinTitulo = false }: { className?: string; sinTitulo?: boolean }) {
  return (
    <Link
      href="/ayuda"
      aria-label="Manual de uso"
      title={sinTitulo ? undefined : 'Manual de uso'}
      className={className || 'w-9 h-9 rounded-full border border-line-strong bg-surface-2 flex items-center justify-center shrink-0 text-ink/85 hover:text-teal hover:border-teal/50 active:scale-90 transition'}
    >
      <BookOpen size={17} strokeWidth={2.2} />
    </Link>
  );
}
