import Link from 'next/link';
import { CircleHelp } from 'lucide-react';

// Acceso discreto al manual de uso (/ayuda). Va junto al cambio de tema en
// los encabezados; el manual muestra lo que corresponde al rol de quien entra.
export default function BotonAyuda({ className }: { className?: string }) {
  return (
    <Link
      href="/ayuda"
      aria-label="Manual de uso"
      title="Manual de uso"
      className={className || 'w-10 h-10 rounded-full flex items-center justify-center text-ink/60 hover:text-ink hover:bg-surface-2 active:scale-90 transition shrink-0'}
    >
      <CircleHelp size={19} strokeWidth={2.1} />
    </Link>
  );
}
