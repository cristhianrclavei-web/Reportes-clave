// Pequeñas ilustraciones de línea para estados vacíos — en vez de un ícono
// genérico de Lucide en una caja, algo con un poco más de personalidad
// propia (el mismo lenguaje de trazo fino + acento teal que ya usa el Logo).
// A propósito minimalistas: nada de gradientes ni sombras, para que encajen
// en el mismo cuadro discreto que ya envolvía al ícono anterior.

type Variante = 'clientes' | 'cotizacion' | 'proyecto' | 'plantilla' | 'lista';

export default function EmptyIllustration({ variante, size = 26 }: { variante: Variante; size?: number }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 32 32',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (variante) {
    case 'clientes':
      // Fachada de edificio con una ventana marcada — "el cliente/sitio".
      return (
        <svg {...props} className="text-faint">
          <rect x="7" y="6" width="18" height="22" rx="1.5" />
          <path d="M12 12h3M17 12h3M12 17h3M17 17h3" />
          <rect x="13.5" y="21" width="5" height="7" className="text-teal" stroke="currentColor" />
        </svg>
      );
    case 'cotizacion':
      // Hoja con líneas de renglón y un total marcado abajo.
      return (
        <svg {...props} className="text-faint">
          <path d="M9 4.5h10l4 4V27a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z" />
          <path d="M19 4.5V9h4" />
          <path d="M11.5 15h9M11.5 18.5h9" />
          <path d="M11.5 23h9" className="text-teal" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case 'proyecto':
      // Carpeta con una pestaña — "el proyecto/servicio agendado".
      return (
        <svg {...props} className="text-faint">
          <path d="M4.5 9.5a1.5 1.5 0 0 1 1.5-1.5h6l2.5 3H26a1.5 1.5 0 0 1 1.5 1.5V23a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 23Z" />
          <circle cx="16" cy="17.5" r="2.3" className="text-teal" stroke="currentColor" />
        </svg>
      );
    case 'plantilla':
      // Marcador/bookmark — "la lista guardada para reusar".
      return (
        <svg {...props} className="text-faint">
          <path d="M9 5.5h14a1 1 0 0 1 1 1V27l-8-5-8 5V6.5a1 1 0 0 1 1-1Z" />
          <path d="M13 12h6" className="text-teal" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case 'lista':
      // Checklist — tres renglones con su marca.
      return (
        <svg {...props} className="text-faint">
          <path d="M6.5 5.5h19a1 1 0 0 1 1 1V25.5a1 1 0 0 1-1 1h-19a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z" />
          <path d="M10 11.5l1.5 1.5 3-3M15.5 12h6" />
          <path d="M10 18.5l1.5 1.5 3-3M15.5 19h6" className="text-teal" stroke="currentColor" />
        </svg>
      );
  }
}
