'use client';

// Logo de Clave Inteligente en SVG vectorial.
//
// Antes eran PNG (uno por tema) donde la tira de íconos salía pixelada y
// borrosa a tamaño chico, y el texto iba en blanco fijo, así que en tema claro
// se perdía. Al ser vectorial ahora: se ve nítido en cualquier pantalla y
// densidad, pesa una fracción, y se adapta solo al tema porque el texto y los
// íconos usan currentColor (heredan el color del contenedor) y el hexágono usa
// el verde de marca, que funciona sobre fondo claro y oscuro.

const VERDE = '#2F7D5C';

// Hexágono con nodos + "CI". Es la marca compacta para encabezados.
function Badge({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <path
        d="M50 8 L84 26 V64 L50 92 L16 64 V26 Z"
        stroke={VERDE}
        strokeWidth="6"
        strokeLinejoin="round"
      />
      {/* Nodos del circuito */}
      <circle cx="50" cy="8" r="7" fill={VERDE} />
      <circle cx="16" cy="45" r="7" fill={VERDE} />
      <circle cx="50" cy="92" r="7" fill={VERDE} />
      <path d="M16 45 L50 92" stroke={VERDE} strokeWidth="5" strokeLinecap="round" />
      {/* CI */}
      <text
        x="50"
        y="62"
        textAnchor="middle"
        fontSize="38"
        fontWeight="700"
        fill="currentColor"
        fontFamily="var(--font-display), system-ui, sans-serif"
        letterSpacing="1"
      >
        CI
      </text>
    </svg>
  );
}

// Los seis servicios de la empresa. Trazo uniforme y grueso, sin rellenos que
// dependan del color de fondo: así el mismo dibujo funciona sobre claro y
// oscuro. A 18px de alto un dibujo detallado se vuelve una mancha, por eso las
// formas son deliberadamente simples.
const ICONOS: { nombre: string; path: React.ReactNode }[] = [
  {
    nombre: 'Detección y combate de incendios',
    path: (
      <path d="M12.4 2.6c2.9 2.9 4.8 5.6 4.8 8.6a5.2 5.2 0 0 1-10.4 0c0-1.5.5-2.8 1.5-3.9.1 1.4.8 2.3 1.9 2.5-.7-2.7-.1-5 2.2-7.2Z" />
    ),
  },
  {
    nombre: 'CCTV y videovigilancia',
    path: (
      <>
        <path d="M3.6 8.9 16.8 5.4l1.3 4.8-13.2 3.5Z" />
        <path d="m18.1 10.2 2.6-.7-.9-3.2-2.6.7" />
        <path d="M7.5 13.4v2.4a2 2 0 0 0 2 2h.6" />
        <circle cx="10.4" cy="19.6" r="1.6" />
      </>
    ),
  },
  {
    nombre: 'Control de acceso',
    path: (
      <>
        <path d="M12 3 19 5.6v5.6c0 4-2.8 7.3-7 8.8-4.2-1.5-7-4.8-7-8.8V5.6Z" />
        <rect x="9.4" y="10.8" width="5.2" height="4.6" rx="1" />
        <path d="M10.6 10.8V9.6a1.4 1.4 0 0 1 2.8 0v1.2" />
      </>
    ),
  },
  {
    nombre: 'Energía solar fotovoltaica',
    path: (
      <>
        <path d="M3.6 4.4h16.8l-1.9 8.4H5.5Z" />
        <path d="M9.8 4.4 8.7 12.8M14.2 4.4l1.1 8.4M4.5 8.6h15" />
        <path d="M12 12.8v5.4M8.8 20.6h6.4" />
      </>
    ),
  },
  {
    nombre: 'Automatización industrial',
    path: (
      <>
        <path d="M4.5 20.6h8.4" />
        <path d="M7.6 20.6v-6.4l3.6-6.2" />
        <path d="m11.6 7.6 5.1 2.2" />
        <circle cx="11.2" cy="7.2" r="1.9" />
        <path d="m16.6 8 2.6 1.1-1.1 2.6-2.6-1.1Z" />
      </>
    ),
  },
  {
    nombre: 'Detección de humo',
    path: (
      <>
        <path d="M4.4 12.4a7.6 7.6 0 0 1 15.2 0" />
        <rect x="3" y="12.4" width="18" height="2.8" rx="1.4" />
        <path d="M7.4 18h9.2" />
      </>
    ),
  },
];

function TiraIconos({ alto = 18 }: { alto?: number }) {
  return (
    <div className="flex items-center justify-center gap-[7px]">
      {ICONOS.map((ico) => (
        <svg
          key={ico.nombre}
          width={alto}
          height={alto}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          role="img"
          aria-label={ico.nombre}
        >
          <title>{ico.nombre}</title>
          {ico.path}
        </svg>
      ))}
    </div>
  );
}

// `badge`: solo el hexágono, para encabezados con poco espacio.
// `completo`: hexágono + nombre + tira de servicios, para login y pantallas
// donde la marca tiene protagonismo.
export default function Logo({
  variante = 'badge',
  size = 44,
  className = '',
  // En las pantallas de detalle el encabezado ya lleva el botón de volver,
  // el cambio de tema y el de salir. El nombre y la tira de servicios se
  // esconden bajo 360 px para que nada se encime; el hexágono se queda.
  //
  // El corte estaba en 420 px, que dejaba el nombre escondido en teléfonos de
  // 412 px — es decir, en la mayoría. Medido, el logo completo pide 150 px y a
  // 360 px quedan 176 libres, así que el corte real es ese.
  compactoEnMovil = false,
}: {
  variante?: 'badge' | 'completo';
  size?: number;
  className?: string;
  compactoEnMovil?: boolean;
}) {
  if (variante === 'badge') {
    return (
      <span className={`inline-flex shrink-0 ${className}`}>
        <Badge size={size} />
      </span>
    );
  }

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <Badge size={size} />
      <div className={`min-w-0 ${compactoEnMovil ? 'hidden min-[360px]:block' : ''}`}>
        <p
          className="font-display font-bold tracking-[0.07em] leading-tight"
          style={{ fontSize: size * 0.4 }}
        >
          CLAVE INTELIGENTE
        </p>
        <div className="h-px bg-red/70 my-[6px]" />
        <TiraIconos alto={Math.max(14, size * 0.3)} />
      </div>
    </div>
  );
}
