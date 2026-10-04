// Fondo del inicio de sesión: un sistema fotovoltaico que se arma poco a
// poco (terreno, estructura, paneles uno por uno, inversor y cableado) y al
// terminar queda generando: el sol gira y la energía corre por el cable.
//
// Todo es SVG con animaciones CSS (app/globals.css, clases fv-*): no usa
// JavaScript ni imágenes, y con «reducir movimiento» se muestra ya armado.
export default function FondoFotovoltaico({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 44 1200 568"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
      className={`fv pointer-events-none select-none ${className}`}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Sol */}
      <g className="fv-aparecer" style={{ animationDelay: '5.6s' }}>
        <circle cx={1035} cy={150} r={86} className="fill-amber/10" />
        <circle cx={1035} cy={150} r={44} className="fill-amber/25 stroke-amber" strokeWidth={2} />
        <g className="fv-sol stroke-amber" strokeWidth={2.5}>
          <path d="M1035 78v-22M1035 244v-22M963 150h-22M1129 150h-22M984 99l-16-16M1102 217l-16-16M984 201l-16 16M1102 83l-16 16" />
        </g>
      </g>

      {/* Terreno */}
      <path pathLength={1} d="M40 560H1160" className="fv-dibujar stroke-ink/30" strokeWidth={2} style={{ animationDelay: '0.1s', animationDuration: '1.1s' }} />
      <path pathLength={1} d="M90 578h120M300 590h200M640 580h150M900 592h180" className="fv-dibujar stroke-ink/15" strokeWidth={2} style={{ animationDelay: '0.5s', animationDuration: '1.2s' }} />

      {/* Nave industrial */}
      <path pathLength={1} d="M950 560V430l46-30v30l46-30v30l46-30v30h46v130" className="fv-dibujar stroke-ink/40" strokeWidth={2.2} style={{ animationDelay: '0.5s', animationDuration: '1.6s' }} />
      <g className="fv-aparecer stroke-ink/30" strokeWidth={2} style={{ animationDelay: '1.7s' }}>
        <path d="M984 560v-52h34v52M1050 478h22v20h-22zM1092 478h22v20h-22zM1050 516h22v20h-22zM1092 516h22v20h-22z" />
      </g>

      {/* Estructura: postes, tirantes y rieles */}
      <g className="stroke-ink/45" strokeWidth={3}>
        {[178, 330, 482, 634].map((x, i) => (
          <path key={x} pathLength={1} d={`M${x} 560V452`} className="fv-dibujar" style={{ animationDelay: `${0.9 + i * 0.14}s`, animationDuration: '0.6s' }} />
        ))}
        {[236, 388, 540, 692].map((x, i) => (
          <path key={x} pathLength={1} d={`M${x} 560V300`} className="fv-dibujar" style={{ animationDelay: `${1.05 + i * 0.14}s`, animationDuration: '0.8s' }} />
        ))}
      </g>
      <g className="stroke-ink/30" strokeWidth={2}>
        {[178, 330, 482, 634].map((x, i) => (
          <path key={x} pathLength={1} d={`M${x} 540L${x + 58} 420`} className="fv-dibujar" style={{ animationDelay: `${1.6 + i * 0.1}s`, animationDuration: '0.5s' }} />
        ))}
      </g>
      <path pathLength={1} d="M132 448H730M180 300H778" className="fv-dibujar stroke-ink/45" strokeWidth={3} style={{ animationDelay: '1.7s', animationDuration: '0.8s' }} />

      {/* Paneles: caen a su lugar uno por uno, de abajo hacia arriba */}
      <g transform="translate(180 300) skewX(-18)">
          <g className="fv-panel" style={{ animationDelay: '2.30s' }}>
            <rect x={0} y={72} width={92} height={64} rx={3} className="fill-bg" />
            <rect x={0} y={72} width={92} height={64} rx={3} className="fill-teal/25 stroke-teal" strokeWidth={1.6} />
            <path d="M31 72v64M61 72v64M0 104h92" className="stroke-teal/45" strokeWidth={1} />
            <rect x={0} y={72} width={92} height={64} rx={3} className="fv-brillo fill-white" style={{ animationDelay: '6.50s' }} />
          </g>
          <g className="fv-panel" style={{ animationDelay: '2.47s' }}>
            <rect x={100} y={72} width={92} height={64} rx={3} className="fill-bg" />
            <rect x={100} y={72} width={92} height={64} rx={3} className="fill-teal/25 stroke-teal" strokeWidth={1.6} />
            <path d="M131 72v64M161 72v64M100 104h92" className="stroke-teal/45" strokeWidth={1} />
            <rect x={100} y={72} width={92} height={64} rx={3} className="fv-brillo fill-white" style={{ animationDelay: '6.85s' }} />
          </g>
          <g className="fv-panel" style={{ animationDelay: '2.64s' }}>
            <rect x={200} y={72} width={92} height={64} rx={3} className="fill-bg" />
            <rect x={200} y={72} width={92} height={64} rx={3} className="fill-teal/25 stroke-teal" strokeWidth={1.6} />
            <path d="M231 72v64M261 72v64M200 104h92" className="stroke-teal/45" strokeWidth={1} />
            <rect x={200} y={72} width={92} height={64} rx={3} className="fv-brillo fill-white" style={{ animationDelay: '7.20s' }} />
          </g>
          <g className="fv-panel" style={{ animationDelay: '2.81s' }}>
            <rect x={300} y={72} width={92} height={64} rx={3} className="fill-bg" />
            <rect x={300} y={72} width={92} height={64} rx={3} className="fill-teal/25 stroke-teal" strokeWidth={1.6} />
            <path d="M331 72v64M361 72v64M300 104h92" className="stroke-teal/45" strokeWidth={1} />
            <rect x={300} y={72} width={92} height={64} rx={3} className="fv-brillo fill-white" style={{ animationDelay: '7.55s' }} />
          </g>
          <g className="fv-panel" style={{ animationDelay: '2.98s' }}>
            <rect x={400} y={72} width={92} height={64} rx={3} className="fill-bg" />
            <rect x={400} y={72} width={92} height={64} rx={3} className="fill-teal/25 stroke-teal" strokeWidth={1.6} />
            <path d="M431 72v64M461 72v64M400 104h92" className="stroke-teal/45" strokeWidth={1} />
            <rect x={400} y={72} width={92} height={64} rx={3} className="fv-brillo fill-white" style={{ animationDelay: '7.90s' }} />
          </g>
          <g className="fv-panel" style={{ animationDelay: '3.15s' }}>
            <rect x={500} y={72} width={92} height={64} rx={3} className="fill-bg" />
            <rect x={500} y={72} width={92} height={64} rx={3} className="fill-teal/25 stroke-teal" strokeWidth={1.6} />
            <path d="M531 72v64M561 72v64M500 104h92" className="stroke-teal/45" strokeWidth={1} />
            <rect x={500} y={72} width={92} height={64} rx={3} className="fv-brillo fill-white" style={{ animationDelay: '8.25s' }} />
          </g>
          <g className="fv-panel" style={{ animationDelay: '3.32s' }}>
            <rect x={0} y={0} width={92} height={64} rx={3} className="fill-bg" />
            <rect x={0} y={0} width={92} height={64} rx={3} className="fill-teal/25 stroke-teal" strokeWidth={1.6} />
            <path d="M31 0v64M61 0v64M0 32h92" className="stroke-teal/45" strokeWidth={1} />
            <rect x={0} y={0} width={92} height={64} rx={3} className="fv-brillo fill-white" style={{ animationDelay: '8.60s' }} />
          </g>
          <g className="fv-panel" style={{ animationDelay: '3.49s' }}>
            <rect x={100} y={0} width={92} height={64} rx={3} className="fill-bg" />
            <rect x={100} y={0} width={92} height={64} rx={3} className="fill-teal/25 stroke-teal" strokeWidth={1.6} />
            <path d="M131 0v64M161 0v64M100 32h92" className="stroke-teal/45" strokeWidth={1} />
            <rect x={100} y={0} width={92} height={64} rx={3} className="fv-brillo fill-white" style={{ animationDelay: '8.95s' }} />
          </g>
          <g className="fv-panel" style={{ animationDelay: '3.66s' }}>
            <rect x={200} y={0} width={92} height={64} rx={3} className="fill-bg" />
            <rect x={200} y={0} width={92} height={64} rx={3} className="fill-teal/25 stroke-teal" strokeWidth={1.6} />
            <path d="M231 0v64M261 0v64M200 32h92" className="stroke-teal/45" strokeWidth={1} />
            <rect x={200} y={0} width={92} height={64} rx={3} className="fv-brillo fill-white" style={{ animationDelay: '9.30s' }} />
          </g>
          <g className="fv-panel" style={{ animationDelay: '3.83s' }}>
            <rect x={300} y={0} width={92} height={64} rx={3} className="fill-bg" />
            <rect x={300} y={0} width={92} height={64} rx={3} className="fill-teal/25 stroke-teal" strokeWidth={1.6} />
            <path d="M331 0v64M361 0v64M300 32h92" className="stroke-teal/45" strokeWidth={1} />
            <rect x={300} y={0} width={92} height={64} rx={3} className="fv-brillo fill-white" style={{ animationDelay: '9.65s' }} />
          </g>
          <g className="fv-panel" style={{ animationDelay: '4.00s' }}>
            <rect x={400} y={0} width={92} height={64} rx={3} className="fill-bg" />
            <rect x={400} y={0} width={92} height={64} rx={3} className="fill-teal/25 stroke-teal" strokeWidth={1.6} />
            <path d="M431 0v64M461 0v64M400 32h92" className="stroke-teal/45" strokeWidth={1} />
            <rect x={400} y={0} width={92} height={64} rx={3} className="fv-brillo fill-white" style={{ animationDelay: '10.00s' }} />
          </g>
          <g className="fv-panel" style={{ animationDelay: '4.17s' }}>
            <rect x={500} y={0} width={92} height={64} rx={3} className="fill-bg" />
            <rect x={500} y={0} width={92} height={64} rx={3} className="fill-teal/25 stroke-teal" strokeWidth={1.6} />
            <path d="M531 0v64M561 0v64M500 32h92" className="stroke-teal/45" strokeWidth={1} />
            <rect x={500} y={0} width={92} height={64} rx={3} className="fv-brillo fill-white" style={{ animationDelay: '10.35s' }} />
          </g>
      </g>

      {/* Inversor */}
      <g className="fv-aparecer" style={{ animationDelay: '4.5s' }}>
        <rect x={826} y={470} width={64} height={90} rx={8} className="fill-surface stroke-ink/50" strokeWidth={2.2} />
        <path d="M840 488h36M840 500h22" className="stroke-ink/35" strokeWidth={2} />
        <path d="M861 512l-9 14h10l-6 14" className="stroke-teal" strokeWidth={2.4} />
        <circle cx={878} cy={546} r={3.5} className="fv-led fill-teal" />
      </g>

      {/* Cableado: del arreglo al inversor y del inversor a la nave */}
      <path pathLength={1} d="M730 448c30 0 40 24 40 44v6c0 12 8 20 20 20h36" className="fv-dibujar stroke-ink/45" strokeWidth={2.4} style={{ animationDelay: '4.8s', animationDuration: '0.8s' }} />
      <path pathLength={1} d="M890 518h60" className="fv-dibujar stroke-ink/45" strokeWidth={2.4} style={{ animationDelay: '5.5s', animationDuration: '0.5s' }} />
      {/* La energía corriendo */}
      <path d="M730 448c30 0 40 24 40 44v6c0 12 8 20 20 20h36" className="fv-flujo stroke-teal" strokeWidth={3} style={{ animationDelay: '6.1s, 6.1s' }} />
      <path d="M890 518h60" className="fv-flujo stroke-teal" strokeWidth={3} style={{ animationDelay: '6.3s, 6.3s' }} />
    </svg>
  );
}
