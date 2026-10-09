// Escena de la página 404: una obra en la que la grúa todavía sostiene el
// «0» entre los dos «4», con un técnico guiando la maniobra. SVG y CSS
// (clases e404-* en globals.css), sin JavaScript; respeta «reducir
// movimiento». Los colores salen del tema, así sirve en claro y oscuro y con
// la marca de cada instalación.

const ACENTO = 'rgb(var(--c-acento))';
const AMBAR = '#F5A524';

// Un dígito con volumen: la misma letra detrás, corrida y más apagada.
function Digito({ x, children }: { x: number; children: string }) {
  return (
    <g className="font-display" fontWeight={700} fontSize={112} textAnchor="middle">
      <text x={x + 6} y={228} fill={ACENTO} opacity={0.38}>{children}</text>
      <text x={x} y={222} fill={ACENTO}>{children}</text>
    </g>
  );
}

export default function EscenaGrua() {
  // Celosía de la torre y de la pluma: un zigzag entre sus dos largueros.
  const torre = Array.from({ length: 12 }, (_, i) => `${i % 2 ? 338 : 318},${222 - i * 15}`).join(' ');
  const pluma = Array.from({ length: 14 }, (_, i) => `${346 - i * 15},${i % 2 ? 30 : 42}`).join(' ');

  return (
    <svg viewBox="0 0 400 280" className="w-full max-w-[420px] text-ink" role="img" aria-label="Una grúa coloca el cero de un 404 que sigue en construcción">
      {/* Sombra y plataforma */}
      <ellipse cx="200" cy="262" rx="172" ry="14" fill="currentColor" opacity="0.07" />
      <rect x="34" y="222" width="332" height="26" rx="13" fill="rgb(var(--c-surface-2))" stroke="currentColor" strokeOpacity="0.14" />
      <rect className="e404-borde" x="34" y="240" width="332" height="8" rx="4" fill={ACENTO} />

      {/* Grúa: torre, cabina, pluma y contrapeso */}
      <g stroke="currentColor" strokeOpacity="0.55" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M318 222V52M338 222V52" />
        <polyline points={torre} strokeWidth="1.6" />
        <path d="M308 222h40" strokeWidth="4" />
      </g>
      <g stroke={AMBAR} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M372 30H148M372 42H148M148 30v12" />
        <polyline points={pluma} strokeWidth="1.6" />
      </g>
      <rect x="352" y="42" width="22" height="16" rx="3" fill="currentColor" opacity="0.45" />
      <rect x="312" y="36" width="32" height="22" rx="5" fill={AMBAR} />
      <rect x="317" y="41" width="12" height="9" rx="2" fill="#BFE6FF" />
      <circle className="e404-baliza" cx="328" cy="24" r="4" fill="#F0503C" />

      {/* Los dos «4» ya colocados */}
      <Digito x={78}>4</Digito>
      <Digito x={262}>4</Digito>

      {/* El «0» sigue colgado: se mece del cable */}
      <g className="e404-carga">
        <rect x="163" y="40" width="14" height="8" rx="2" fill="currentColor" opacity="0.6" />
        <path d="M170 48V112" stroke="currentColor" strokeOpacity="0.65" strokeWidth="2" />
        {/* Eslingas del gancho a los costados del «0» */}
        <path d="M153 137L170 112L187 137" stroke="currentColor" strokeOpacity="0.65" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="170" cy="112" r="3.5" fill="currentColor" opacity="0.7" />
        <g className="font-display" fontWeight={700} fontSize={112} textAnchor="middle">
          <text x={176} y={212} fill={ACENTO} opacity={0.38}>0</text>
          <text x={170} y={206} fill={ACENTO}>0</text>
        </g>
      </g>

      {/* Técnico guiando la maniobra */}
      <g>
        <rect x="117" y="212" width="6" height="28" rx="2" fill="#27407A" />
        <rect x="126" y="212" width="6" height="28" rx="2" fill="#27407A" />
        <rect x="114" y="184" width="21" height="31" rx="5" fill="#3559B8" />
        <path d="M115 190l-7 16" stroke="#3559B8" strokeWidth="5" strokeLinecap="round" />
        <path className="e404-brazo" d="M134 190l13 -17" stroke="#3559B8" strokeWidth="5" strokeLinecap="round" />
        <circle cx="124.5" cy="175" r="7.5" fill="#F2C7A5" />
        <path d="M115.5 174a9 9 0 0 1 18 0z" fill={AMBAR} />
        <rect x="113.5" y="173" width="22" height="3" rx="1.5" fill={AMBAR} />
      </g>

      {/* Cono y cubeta */}
      <path d="M214 214l9 28h-18z" fill="#F0503C" />
      <path d="M210.500 228h7l1.600 5h-10.200z" fill="#FFFFFF" opacity="0.9" />
      <rect x="201" y="241" width="26" height="4" rx="2" fill="#F0503C" />
      <rect x="296" y="228" width="14" height="14" rx="2" fill={AMBAR} />
      <path d="M297 228a6 6 0 0 1 12 0" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" fill="none" />
    </svg>
  );
}
