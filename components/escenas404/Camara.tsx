// Escena de la página 404: una cámara de vigilancia barre el cuarto con su
// haz de luz buscando la página; cada cifra del «404» solo se enciende
// cuando el haz le pasa encima. SVG y CSS (clases e404-* en globals.css), sin
// JavaScript; respeta «reducir movimiento». Los colores salen del tema, así
// sirve en claro y oscuro y con la marca de cada instalación.
//
// El barrido y el encendido de cada cifra comparten duración (ver
// globals.css): si se cambia una, hay que cambiar las otras.

const ACENTO = 'rgb(var(--c-acento))';
const CIFRAS: [number, string, string][] = [[92, '4', 'e404-cifra-izq'], [200, '0', 'e404-cifra-centro'], [308, '4', 'e404-cifra-der']];

export default function EscenaCamara() {
  return (
    <svg viewBox="0 0 400 280" className="w-full max-w-[420px] text-ink" role="img" aria-label="Una cámara de vigilancia busca la página con su luz y solo encuentra un 404">
      <defs>
        <linearGradient id="e404-haz" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={ACENTO} stopOpacity="0.55" />
          <stop offset="1" stopColor={ACENTO} stopOpacity="0" />
        </linearGradient>
        {/* El haz no se sale del cuadro del monitor (el recorte va en el
            grupo fijo, no en el que gira). */}
        <clipPath id="e404-cuadro"><rect x="7" y="7" width="386" height="266" rx="17" /></clipPath>
      </defs>

      {/* El cuadro del monitor: marco, esquinas y rótulo de la cámara */}
      <rect x="6" y="6" width="388" height="268" rx="18" fill="rgb(var(--c-surface-2))" fillOpacity="0.55" stroke="currentColor" strokeOpacity="0.12" />
      <g stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" fill="none" strokeLinecap="round">
        <path d="M22 40V22h18M360 22h18v18M378 240v18h-18M40 258H22v-18" />
      </g>
      <g className="font-mono" fontSize="10" fill="currentColor" fillOpacity="0.55">
        <circle className="e404-rec" cx="30" cy="56" r="3.5" fill="#F0503C" fillOpacity="1" />
        <text x="39" y="59.500">REC · CAM 04</text>
        <text x="370" y="59.500" textAnchor="end">SIN SEÑAL</text>
      </g>

      {/* Piso */}
      <path d="M36 236H364" stroke="currentColor" strokeOpacity="0.16" strokeWidth="2" strokeLinecap="round" />

      {/* Las cifras, apagadas; cada una se enciende al paso del haz */}
      <g className="font-display" fontWeight={700} fontSize={118} textAnchor="middle">
        {CIFRAS.map(([x, c]) => (
          <text key={`a${x}`} x={x} y={232} fill="currentColor" opacity={0.1}>{c}</text>
        ))}
        {CIFRAS.map(([x, c, clase]) => (
          <text key={`b${x}`} className={clase} x={x} y={232} fill={ACENTO}>{c}</text>
        ))}
      </g>

      {/* Soporte fijo en el techo */}
      <path d="M176 22h48" stroke="currentColor" strokeOpacity="0.5" strokeWidth="5" strokeLinecap="round" />
      <path d="M200 24v16" stroke="currentColor" strokeOpacity="0.5" strokeWidth="4" />

      {/* Cámara y haz: giran juntos alrededor del soporte */}
      <g clipPath="url(#e404-cuadro)">
      <g className="e404-barrido">
        <path d="M200 66L154 262H246Z" fill="url(#e404-haz)" />
        <rect x="186" y="36" width="28" height="36" rx="7" fill="rgb(var(--c-surface))" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2" />
        <rect x="191" y="62" width="18" height="12" rx="4" fill="currentColor" fillOpacity="0.75" />
        <circle cx="200" cy="69" r="3.2" fill={ACENTO} />
        <circle className="e404-rec" cx="207" cy="44" r="2.2" fill="#F0503C" />
      </g>
      </g>
      <circle cx="200" cy="40" r="4.5" fill="currentColor" fillOpacity="0.6" />
    </svg>
  );
}
