// Escena 404 «detector»: el «0» es un detector de humo que suena y parpadea;
// un técnico lo prueba desde abajo con su pértiga y el humo de prueba sube.
// SVG y CSS (clases e404d-* en globals.css).

const ACENTO = 'rgb(var(--c-acento))';
const AMBAR = '#F5A524';

export default function EscenaDetector() {
  return (
    <svg viewBox="0 0 400 280" className="w-full max-w-[420px] text-ink" role="img" aria-label="Un técnico prueba un detector de humo que ocupa el lugar del cero en un 404">
      {/* Sombra y piso */}
      <ellipse cx="200" cy="258" rx="170" ry="12" fill="currentColor" opacity="0.07" />
      <path d="M36 240H364" stroke="currentColor" strokeOpacity="0.16" strokeWidth="2" strokeLinecap="round" />

      {/* Los dos «4» */}
      <g className="font-display" fontWeight={700} fontSize={118} textAnchor="middle">
        <text x={86} y={236} fill={ACENTO} opacity={0.38}>4</text>
        <text x={80} y={230} fill={ACENTO}>4</text>
        <text x={326} y={236} fill={ACENTO} opacity={0.38}>4</text>
        <text x={320} y={230} fill={ACENTO}>4</text>
      </g>

      {/* Ondas de la alarma */}
      <g fill="none" stroke="#F0503C" strokeWidth="2.5" strokeLinecap="round">
        <circle className="e404d-onda" cx="200" cy="112" r="52" />
        <circle className="e404d-onda e404d-onda-2" cx="200" cy="112" r="52" />
      </g>

      {/* El detector: el «0» del 404 */}
      <circle cx="204" cy="117" r="46" fill={ACENTO} opacity="0.38" />
      <circle cx="200" cy="112" r="46" fill="rgb(var(--c-surface))" stroke={ACENTO} strokeWidth="13" />
      <g stroke="currentColor" strokeOpacity="0.4" strokeWidth="2.5" strokeLinecap="round">
        <path d="M184 100h32M180 112h40M184 124h32" />
      </g>
      <circle className="e404d-led" cx="200" cy="138" r="4.5" fill="#F0503C" />

      {/* Humo de prueba que sube de la pértiga */}
      <g fill="currentColor">
        <circle className="e404d-humo" cx="236" cy="176" r="5" />
        <circle className="e404d-humo e404d-humo-2" cx="231" cy="180" r="4" />
        <circle className="e404d-humo e404d-humo-3" cx="240" cy="182" r="3.5" />
      </g>

      {/* Técnico con la pértiga de prueba */}
      <g>
        <rect x="251" y="212" width="6" height="28" rx="2" fill="#27407A" />
        <rect x="260" y="212" width="6" height="28" rx="2" fill="#27407A" />
        <rect x="248" y="184" width="21" height="31" rx="5" fill="#3559B8" />
        <path d="M268 190l6 17" stroke="#3559B8" strokeWidth="5" strokeLinecap="round" />
        <g className="e404d-pertiga">
          <path d="M249 192L238 180" stroke="#3559B8" strokeWidth="5" strokeLinecap="round" />
          <path d="M243 200L232 170" stroke="currentColor" strokeOpacity="0.6" strokeWidth="3" strokeLinecap="round" />
          <path d="M224 168h16l-3 -10h-10z" fill={AMBAR} />
        </g>
        <circle cx="258.500" cy="175" r="7.5" fill="#F2C7A5" />
        <path d="M249.500 174a9 9 0 0 1 18 0z" fill={AMBAR} />
        <rect x="247.500" y="173" width="22" height="3" rx="1.5" fill={AMBAR} />
      </g>
    </svg>
  );
}
