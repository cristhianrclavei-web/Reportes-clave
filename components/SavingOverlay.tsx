'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MARCA } from '@/lib/marca';
import {
  ESCUDO_CONTORNO, ESCUDO_RAMAL, ESCUDO_TRAZO, ESCUDO_NODOS,
  ICONOS_SERVICIO, ROJO_FLAMA,
} from '@/lib/logoMarca';

// Pantalla de guardado. El escudo de la marca es la barra de avance: su
// contorno se va trazando de 0 a 100 % (sale del nodo izquierdo, pasa por el
// de arriba y cierra en el de abajo) y los nodos se encienden al paso. Abajo,
// el mensaje de la etapa y los seis servicios del logotipo, que se prenden
// uno a uno.
//
// `pct` y `label` los manda quien guarda, con el avance real. Sin `pct` el
// número avanza solo, cada vez más lento, y nunca llega a 100.

// Marca «bloque» (instalaciones sin escudo): el contorno es el cuadro
// redondeado, empezando arriba al centro.
const BLOQUE_CONTORNO = 'M50 6H70A24 24 0 0 1 94 30V70A24 24 0 0 1 70 94H30A24 24 0 0 1 6 70V30A24 24 0 0 1 30 6Z';

// Punto del recorrido (0–100) en que el contorno alcanza cada nodo, en el
// orden de ESCUDO_NODOS: arriba, izquierda, abajo.
const NODO_UMBRAL = [39.5, 0, 100];

function limitar(n: number): number {
  return Math.max(0, Math.min(100, n));
}

// Número que se muestra: persigue al avance real sin brincos y, mientras
// espera la siguiente etapa, sigue subiendo despacio para que no parezca
// trabado. Nunca retrocede y solo marca 100 cuando el avance real es 100.
function usePorcentaje(objetivo?: number): number {
  const [visto, setVisto] = useState(0);
  const objetivoRef = useRef(objetivo);
  useEffect(() => { objetivoRef.current = objetivo; }, [objetivo]);

  useEffect(() => {
    let v = 0;
    let raf = 0;
    let previo = performance.now();
    const inicio = previo;
    const paso = (ahora: number) => {
      const dt = Math.min(0.1, (ahora - previo) / 1000);
      previo = ahora;
      const real = objetivoRef.current;
      const meta = real === undefined ? 90 * (1 - Math.exp(-(ahora - inicio) / 6000)) : limitar(real);
      if (v < meta) v = Math.min(meta, v + Math.max(30, (meta - v) * 5) * dt);
      else if (meta < 100) v = Math.max(v, Math.min(v + 0.7 * dt, Math.min(meta + 6, 99)));
      const entero = Math.floor(v);
      setVisto((prev) => (prev === entero ? prev : entero));
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, []);

  return visto;
}

// `pie`: el renglón de abajo mientras avanza. Al guardar pide no cerrar; al
// abrir una página (components/PantallaCarga) no hace falta.
export function Contenido({ pct, label, pie = 'No cierres ni cambies de pantalla', etiquetaAria = 'Avance del guardado' }: { pct?: number; label?: string; pie?: string; etiquetaAria?: string }) {
  const visto = usePorcentaje(pct);
  const listo = visto >= 100;
  const esBloque = MARCA.logo === 'bloque';
  const contorno = esBloque ? BLOQUE_CONTORNO : ESCUDO_CONTORNO;
  const idGrad = `guardado-${useId().replace(/:/g, '')}`;
  const etapa = label || 'Guardando…';
  // Servicio «en turno»: cada ícono cubre una sexta parte del avance.
  const turno = Math.min(ICONOS_SERVICIO.length - 1, Math.floor((visto / 100) * ICONOS_SERVICIO.length));

  return (
    <div className="guardado fixed inset-0 z-[200] flex flex-col items-center justify-center px-6 bg-bg/95 backdrop-blur-md text-ink">
      <div
        className={`relative w-[204px] h-[204px] ${listo ? 'guardado-listo' : ''}`}
        role="progressbar"
        aria-valuenow={visto}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={etiquetaAria}
      >
        <div className="guardado-halo absolute -inset-10 rounded-full" aria-hidden="true" />
        <svg viewBox="0 0 100 100" fill="none" className="relative w-full h-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id={idGrad} x1="17" y1="66" x2="83" y2="23" gradientUnits="userSpaceOnUse">
              <stop offset="0" style={{ stopColor: 'var(--logo-escudo, rgb(var(--c-acento)))' }} />
              <stop offset="1" style={{ stopColor: 'rgb(var(--c-acento))' }} />
            </linearGradient>
          </defs>
          {/* Riel: el escudo completo, apagado. */}
          <g stroke="currentColor" strokeOpacity="0.12" strokeWidth={ESCUDO_TRAZO} strokeLinecap="round" strokeLinejoin="round">
            <path d={contorno} />
            {!esBloque && <path d={ESCUDO_RAMAL} />}
          </g>
          {/* Relleno suave al terminar. */}
          <path d={contorno} className="guardado-relleno" style={{ opacity: listo ? 0.14 : 0 }} fill={`url(#${idGrad})`} />
          {/* Avance: el mismo contorno, trazado hasta el porcentaje. */}
          <g strokeLinecap="round" strokeLinejoin="round" className="guardado-trazo">
            <path
              d={contorno}
              pathLength={100}
              stroke={`url(#${idGrad})`}
              strokeWidth={ESCUDO_TRAZO}
              strokeDasharray="100 100"
              strokeDashoffset={100 - visto}
            />
            {!esBloque && (
              <path d={ESCUDO_RAMAL} stroke={`url(#${idGrad})`} strokeWidth={ESCUDO_TRAZO} style={{ opacity: listo ? 1 : 0 }} />
            )}
            {/* Chispa en la punta del trazo. */}
            {visto > 0 && !listo && (
              <path
                d={contorno}
                pathLength={100}
                stroke="#FFFFFF"
                strokeOpacity="0.9"
                strokeWidth={ESCUDO_TRAZO * 0.5}
                strokeDasharray="0 100"
                strokeDashoffset={-visto}
              />
            )}
          </g>
          {!esBloque && ESCUDO_NODOS.map(([cx, cy, r], i) => {
            const encendido = visto > 0 && visto >= NODO_UMBRAL[i];
            return (
              <circle
                key={`${cx}-${cy}`}
                cx={cx}
                cy={cy}
                r={r}
                className="guardado-nodo"
                fill={encendido ? `url(#${idGrad})` : 'rgb(var(--c-surface-2))'}
                stroke={encendido ? 'none' : 'currentColor'}
                strokeOpacity="0.18"
                strokeWidth="1.5"
              />
            );
          })}
        </svg>
        <p
          className="absolute inset-x-0 top-[47%] -translate-y-1/2 text-center font-display font-bold tabular-nums leading-none"
          aria-hidden="true"
        >
          <span className="text-[50px] tracking-tight">{visto}</span>
          <span className="text-xl text-teal ml-0.5">%</span>
        </p>
      </div>

      <p
        key={etapa}
        role="status"
        className="guardado-etapa mt-9 max-w-xs text-center font-display font-semibold text-base tracking-wide"
      >
        {etapa}
      </p>

      <div className="flex items-end justify-center gap-3.5 mt-5 h-8" aria-hidden="true">
        {ICONOS_SERVICIO.map((ico, i) => {
          const hecho = listo || i < turno;
          const enTurno = !listo && i === turno;
          const color = ico.tono === 'rojo' && (hecho || enTurno) ? ROJO_FLAMA : 'currentColor';
          return (
            <span key={ico.nombre} className="flex flex-col items-center gap-1.5">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                className={`guardado-icono ${enTurno ? 'guardado-icono-turno' : ''}`}
                style={{ opacity: hecho || enTurno ? 1 : 0.22 }}
              >
                {ico.piezas.map((pz, j) => (pz.trazo
                  ? <path key={j} d={pz.d} stroke={color} strokeWidth={pz.trazo} strokeLinecap="round" strokeLinejoin="round" />
                  : <path key={j} d={pz.d} fill={color} />
                ))}
              </svg>
              <span className={`guardado-punto h-1 w-1 rounded-full ${hecho ? 'bg-teal' : enTurno ? 'bg-teal/50' : 'bg-ink/15'}`} />
            </span>
          );
        })}
      </div>

      <p className="text-muted text-xs mt-6 text-center">
        {listo ? 'Todo quedó guardado' : pie}
      </p>
    </div>
  );
}

export default function SavingOverlay({ show, pct, label }: { show: boolean; pct?: number; label?: string }) {
  // Se monta de nuevo en cada guardado: el porcentaje siempre arranca en 0.
  if (!show || typeof document === 'undefined') return null;
  // Al body: dentro de una ventana con vidrio (backdrop-filter) un `fixed`
  // se queda encerrado en la ventana en vez de cubrir la pantalla.
  return createPortal(<Contenido pct={pct} label={label} />, document.body);
}
