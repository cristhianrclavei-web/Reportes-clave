import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

// Ruta de navegación de Diagramas y planos: Cliente › Panel › Circuito.
// /lazos lleva a supervisión a su propia sección (y conserva el cliente).
export default function RutaDiagramas({ pasos }: { pasos: { texto: string; href?: string }[] }) {
  return (
    <nav aria-label="Ruta" className="flex items-center gap-1 text-[12px] text-muted min-w-0 overflow-hidden">
      <Link href="/lazos" className="shrink-0 font-semibold text-teal hover:underline">Diagramas</Link>
      {pasos.map((paso, i) => (
        <span key={i} className="flex items-center gap-1 min-w-0">
          <ChevronRight size={13} className="shrink-0" aria-hidden="true" />
          {paso.href
            ? <Link href={paso.href} className="truncate font-semibold text-teal hover:underline">{paso.texto}</Link>
            : <span className="truncate">{paso.texto}</span>}
        </span>
      ))}
    </nav>
  );
}
