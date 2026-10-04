'use client';
import { useId } from 'react';
import { MARCA, MARCA_MAYUS, COLORES } from '@/lib/marca';
import {
  ESCUDO_CONTORNO, ESCUDO_RAMAL, ESCUDO_TRAZO, ESCUDO_NODOS, ESCUDO_LETRA,
  ICONOS_SERVICIO, ROJO_FLAMA, tramosNombre,
} from '@/lib/logoMarca';

// Logo de Clave Inteligente en SVG vectorial.
//
// Antes eran PNG (uno por tema) donde la tira de íconos salía pixelada y
// borrosa a tamaño chico, y el texto iba en blanco fijo, así que en tema claro
// se perdía. Al ser vectorial ahora: se ve nítido en cualquier pantalla y
// densidad, pesa una fracción, y se adapta solo al tema porque el texto y los
// íconos usan currentColor (heredan el color del contenedor) y el hexágono usa
// el verde de marca, que funciona sobre fondo claro y oscuro.

// Verde del escudo: el del logotipo sobre fondo oscuro y uno más profundo
// sobre fondo claro (variable --logo-escudo en app/globals.css).
const VERDE_ESCUDO = `var(--logo-escudo, ${COLORES.logo})`;

// Marca «bloque»: cuadro redondeado con degradado, iniciales y dos nodos
// conectados. Es la identidad de las instalaciones que no usan el escudo.
function Bloque({ size = 44 }: { size?: number }) {
  // Id propio por logo: con ids repetidos, si la primera copia de la página
  // está oculta (encabezado de escritorio en el celular) el degradado de las
  // demás deja de pintarse y el bloque sale sin fondo.
  const idGrad = `marca-bloque-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={idGrad} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={COLORES.logo2} />
          <stop offset="1" stopColor={COLORES.logo} />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="88" height="88" rx="24" fill={`url(#${idGrad})`} />
      {/* Nodos conectados */}
      <path d="M66 20 L80 34" stroke="#FFFFFF" strokeOpacity="0.75" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="66" cy="20" r="5" fill="#FFFFFF" />
      <circle cx="80" cy="34" r="5" fill="#FFFFFF" />
      <text
        x="48"
        y="69"
        textAnchor="middle"
        fontSize="38"
        fontWeight="700"
        fill="#FFFFFF"
        fontFamily="var(--font-display), system-ui, sans-serif"
        letterSpacing="1"
      >
        {MARCA.iniciales}
      </text>
    </svg>
  );
}

// Escudo con nodos + iniciales. Es la marca compacta para encabezados. La
// geometría vive en lib/logoMarca.ts (la misma que usan los PDF y el ícono).
function Badge({ size = 44 }: { size?: number }) {
  if (MARCA.logo === 'bloque') return <Bloque size={size} />;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <g stroke={VERDE_ESCUDO} strokeWidth={ESCUDO_TRAZO} strokeLinecap="round" strokeLinejoin="round">
        <path d={ESCUDO_CONTORNO} />
        <path d={ESCUDO_RAMAL} />
      </g>
      {ESCUDO_NODOS.map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={VERDE_ESCUDO} />
      ))}
      <text
        x={ESCUDO_LETRA.x}
        y={ESCUDO_LETRA.y}
        textAnchor="middle"
        fontSize={MARCA.iniciales.length > 2 ? ESCUDO_LETRA.tam * 0.76 : ESCUDO_LETRA.tam}
        fontWeight="700"
        fill="currentColor"
        fontFamily="var(--font-display), system-ui, sans-serif"
        letterSpacing="0.5"
      >
        {MARCA.iniciales}
      </text>
    </svg>
  );
}

// Los seis servicios de la empresa, rellenos como en el logotipo: la flama
// siempre roja y los demás en el color del texto (gris medio; el detector en
// tono pleno), así se leen igual sobre fondo claro y oscuro.
function TiraIconos({ alto = 18 }: { alto?: number }) {
  return (
    <div className="flex items-center justify-center" style={{ gap: Math.round(alto * 0.5) }}>
      {ICONOS_SERVICIO.map((ico) => {
        const color = ico.tono === 'rojo' ? ROJO_FLAMA : 'currentColor';
        return (
          <svg
            key={ico.nombre}
            width={alto}
            height={alto}
            viewBox="0 0 24 24"
            fill="none"
            role="img"
            aria-label={ico.nombre}
            opacity={ico.tono === 'gris' ? 0.62 : 1}
          >
            <title>{ico.nombre}</title>
            {ico.piezas.map((pz, i) => (pz.trazo
              ? <path key={i} d={pz.d} stroke={color} strokeWidth={pz.trazo} strokeLinecap="round" strokeLinejoin="round" />
              : <path key={i} d={pz.d} fill={color} />
            ))}
          </svg>
        );
      })}
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
          className="font-display font-bold tracking-[0.07em] leading-tight whitespace-pre"
          style={{ fontSize: size * (MARCA.logo === 'bloque' ? 0.4 : 0.46) }}
        >
          {/* Clave Inteligente: versalitas, como en el logotipo. */}
          {MARCA.logo === 'bloque'
            ? MARCA_MAYUS
            : tramosNombre(MARCA.nombre).map((t, i) => (
              <span key={i} style={t.escala === 1 ? undefined : { fontSize: `${t.escala}em` }}>{t.texto}</span>
            ))}
        </p>
        <div className={`h-px my-[6px] ${MARCA.logo === 'bloque' ? 'bg-teal/70' : 'bg-red/70'}`} />
        {MARCA.iconos && <TiraIconos alto={Math.max(13, size * 0.3)} />}
      </div>
    </div>
  );
}
