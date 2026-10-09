// Escena 404 «cable»: una clavija y su contacto intentan unirse; cuando casi
// se tocan salta una chispa y el 404 se enciende un instante. SVG y CSS
// (clases e404c-* en globals.css). El acercamiento, la chispa y el destello
// del 404 comparten duración.

const ACENTO = 'rgb(var(--c-acento))';
const AMBAR = '#F5A524';

export default function EscenaCable() {
  return (
    <svg viewBox="0 0 400 280" className="w-full max-w-[420px] text-ink" role="img" aria-label="Dos conectores que no logran unirse y un 404 que parpadea">
      {/* El 404: apagado, y encima el mismo encendido que destella */}
      <g className="font-display" fontWeight={700} fontSize={124} textAnchor="middle" letterSpacing="6">
        <text x="200" y="138" fill="currentColor" opacity="0.1">404</text>
        <text className="e404c-destello" x="200" y="138" fill={ACENTO}>404</text>
      </g>

      {/* Clavija (izquierda) con su cable */}
      <g className="e404c-clavija">
        <path d="M-30 236C40 236 60 204 118 204" stroke="currentColor" strokeOpacity="0.55" strokeWidth="7" fill="none" strokeLinecap="round" />
        <rect x="116" y="184" width="46" height="40" rx="10" fill={ACENTO} />
        <rect x="124" y="192" width="8" height="24" rx="3" fill="#FFFFFF" opacity="0.35" />
        <path d="M162 194h20M162 214h20" stroke="currentColor" strokeOpacity="0.7" strokeWidth="6" strokeLinecap="round" />
      </g>

      {/* Contacto (derecha) con su cable */}
      <g className="e404c-contacto">
        <path d="M430 236C360 236 340 204 282 204" stroke="currentColor" strokeOpacity="0.55" strokeWidth="7" fill="none" strokeLinecap="round" />
        <rect x="232" y="180" width="52" height="48" rx="12" fill="rgb(var(--c-surface))" stroke="currentColor" strokeOpacity="0.55" strokeWidth="3" />
        <path d="M238 194h14M238 214h14" stroke="currentColor" strokeOpacity="0.6" strokeWidth="6" strokeLinecap="round" />
      </g>

      {/* Chispa entre los dos */}
      <g className="e404c-chispa">
        <path d="M207 180l5 16 16 -6 -11 13 13 9 -17 1 3 17 -10 -13 -12 11 5 -16 -16 -5 16 -5 -8 -15 13 9z" fill={AMBAR} />
        <circle cx="207" cy="204" r="6" fill="#FFFFFF" />
      </g>

      {/* Piso */}
      <path d="M36 252H364" stroke="currentColor" strokeOpacity="0.14" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
