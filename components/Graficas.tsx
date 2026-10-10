'use client';

import {
  createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { animate, motion, useInView, useReducedMotion } from 'motion/react';

// Piezas con que se arman las gráficas de los indicadores: entran animadas
// cuando la tarjeta aparece en pantalla y responden al cursor (o al dedo, o
// al teclado) resaltando el punto y diciendo qué se midió ahí.
//
//   · ZonaGraficas: envuelve una sección; dibuja el globo de información.
//   · Marco: una tarjeta; avisa a lo de adentro cuándo ya está a la vista.
//   · Punto: cualquier parte de una gráfica que se puede señalar.
//   · Crece, Contador, Dona, Medidor, LineaInteractiva: lo que se anima.

const SUAVE = [0.16, 1, 0.3, 1] as const;

// ---------- Globo de información ----------

type Caja = { x: number; y: number; w: number; h: number };
type Activo = { id: string; grupo?: string; caja: Caja; contenido: React.ReactNode };
type Globo = { activo: Activo | null; mostrar: (a: Activo) => void; ocultar: (id?: string) => void };

const GloboCtx = createContext<Globo>({ activo: null, mostrar: () => {}, ocultar: () => {} });
const VistaCtx = createContext(true);

export function useGlobo(): Globo {
  return useContext(GloboCtx);
}

export function ZonaGraficas({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const [activo, setActivo] = useState<Activo | null>(null);
  const mostrar = useCallback((a: Activo) => setActivo(a), []);
  const ocultar = useCallback((id?: string) => setActivo((a) => (!a || (id && a.id !== id) ? a : null)), []);
  const valor = useMemo(() => ({ activo, mostrar, ocultar }), [activo, mostrar, ocultar]);
  const abierto = activo !== null;

  // El globo va fijo a la pantalla: si la página se mueve, ya no apunta a nada.
  useEffect(() => {
    if (!abierto) return;
    const cerrar = () => setActivo(null);
    const toque = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.('[data-punto]')) cerrar(); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    window.addEventListener('scroll', cerrar, { capture: true, passive: true });
    window.addEventListener('resize', cerrar);
    window.addEventListener('pointerdown', toque);
    window.addEventListener('keydown', tecla);
    return () => {
      window.removeEventListener('scroll', cerrar, { capture: true });
      window.removeEventListener('resize', cerrar);
      window.removeEventListener('pointerdown', toque);
      window.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  return (
    <GloboCtx.Provider value={valor}>
      <div className={className}>{children}</div>
      <GloboFlotante activo={activo} />
    </GloboCtx.Provider>
  );
}

function GloboFlotante({ activo }: { activo: Activo | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // Al aparecer se coloca de golpe; después se desliza de un punto al otro.
  const colocado = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!activo || !el) { setPos(null); colocado.current = false; return; }
    const w = el.offsetWidth, h = el.offsetHeight, m = 8;
    const centro = activo.caja.x + activo.caja.w / 2;
    const left = Math.max(m, Math.min(window.innerWidth - w - m, centro - w / 2));
    const arriba = activo.caja.y - h - m;
    setPos({ left, top: arriba < m ? activo.caja.y + activo.caja.h + m : arriba });
  }, [activo]);
  useEffect(() => { colocado.current = pos !== null; }, [pos]);

  if (!activo || typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className="fixed z-[300] pointer-events-none max-w-[270px] px-3 py-2.5 rounded-xl bg-ink text-bg text-[12px] leading-snug shadow-diffuse"
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        opacity: pos ? 1 : 0,
        transition: colocado.current ? 'left 140ms ease-out, top 140ms ease-out' : 'none',
      }}
    >
      {activo.contenido}
    </div>,
    document.body,
  );
}

// Contenido habitual del globo: qué punto es y qué se midió en él.
export function InfoPunto({
  titulo, filas = [], nota,
}: {
  titulo: React.ReactNode;
  filas?: { color?: string; texto: string; valor: React.ReactNode }[];
  nota?: React.ReactNode;
}) {
  return (
    <div className="min-w-[150px]">
      <p className="font-semibold text-[12.5px] first-letter:uppercase">{titulo}</p>
      {filas.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1">
          {filas.map((f) => (
            <p key={f.texto} className="flex items-center gap-1.5">
              {f.color && <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ backgroundColor: f.color }} />}
              <span className="flex-1 opacity-75">{f.texto}</span>
              <b className="tabular-nums pl-3">{f.valor}</b>
            </p>
          ))}
        </div>
      )}
      {nota && <p className="mt-1.5 opacity-70 text-[11.5px]">{nota}</p>}
    </div>
  );
}

// Colores de las gráficas como valor CSS, para SVG y para el globo.
export const COLOR = {
  acento: 'rgb(var(--c-acento))',
  ambar: '#E8B04B',
  rojo: '#E0654A',
  gris: 'rgb(var(--c-line-rgb) / 0.28)',
} as const;

// ---------- Punto señalable ----------

// Algo de la gráfica que se puede señalar. `children` recibe si está señalado
// y si lo está otro de su mismo grupo (para atenuar a los demás). El globo se
// ancla al descendiente marcado con data-ancla, o al elemento entero.
export function Punto({
  info, grupo, etiqueta, como = 'div', className = '', style, children,
}: {
  info: React.ReactNode;
  grupo?: string;
  etiqueta?: string;
  como?: 'div' | 'span' | 'g' | 'tr';
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode | ((activo: boolean, otro: boolean) => React.ReactNode);
}) {
  const id = useId();
  const { activo, mostrar, ocultar } = useGlobo();
  const ref = useRef<Element | null>(null);
  const puntero = useRef('mouse');
  const soy = activo?.id === id;
  const otro = !soy && !!grupo && activo?.grupo === grupo;

  const abrir = () => {
    const el = ref.current;
    if (!el) return;
    const r = (el.querySelector('[data-ancla]') || el).getBoundingClientRect();
    mostrar({ id, grupo, caja: { x: r.left, y: r.top, w: r.width, h: r.height }, contenido: info });
  };

  const Etiqueta = como as any;
  return (
    <Etiqueta
      ref={ref}
      data-punto=""
      tabIndex={0}
      aria-label={etiqueta}
      className={`outline-none focus-visible:ring-2 focus-visible:ring-teal/60 ${como === 'g' ? '' : 'rounded-md'} ${className}`}
      style={{ cursor: 'default', ...style }}
      onPointerEnter={(e: React.PointerEvent) => { puntero.current = e.pointerType; if (e.pointerType === 'mouse') abrir(); }}
      onPointerLeave={(e: React.PointerEvent) => { if (e.pointerType === 'mouse') ocultar(id); }}
      // Con el dedo no hay «pasar por encima»: un toque lo abre y otro lo cierra.
      onClick={() => { if (puntero.current !== 'mouse') { if (soy) ocultar(id); else abrir(); } }}
      onFocus={(e: React.FocusEvent) => { if ((e.currentTarget as Element).matches(':focus-visible')) abrir(); }}
      onBlur={() => ocultar(id)}
    >
      {typeof children === 'function' ? children(soy, otro) : children}
    </Etiqueta>
  );
}

// ---------- Entrada en pantalla ----------

// Tarjeta: lo de adentro empieza a animarse cuando ya se alcanza a ver.
export function Marco({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const enVista = useInView(ref, { once: true, amount: 0.2 });
  return (
    <div ref={ref} className={className}>
      <VistaCtx.Provider value={enVista}>{children}</VistaCtx.Provider>
    </div>
  );
}

function useAnimacion() {
  const enVista = useContext(VistaCtx);
  const quieto = !!useReducedMotion();
  return { listo: enVista || quieto, quieto };
}

// Barra o columna que crece hasta su tamaño. `pct` es el tamaño final.
export function Crece({
  eje = 'x', pct, orden = 0, className = '', style, children, ...resto
}: {
  eje?: 'x' | 'y';
  pct: number;
  orden?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  'data-ancla'?: string;
}) {
  const { listo, quieto } = useAnimacion();
  const prop = eje === 'x' ? 'width' : 'height';
  return (
    <motion.div
      {...resto}
      className={className}
      style={style}
      initial={{ [prop]: quieto ? `${pct}%` : '0%' }}
      animate={{ [prop]: listo ? `${pct}%` : '0%' }}
      transition={quieto ? { duration: 0 } : { duration: 0.75, delay: Math.min(orden, 12) * 0.05, ease: SUAVE }}
    >
      {children}
    </motion.div>
  );
}

// Pieza chica (un cuadro, una marca) que aparece en su turno.
export function Aparece({ orden = 0, className = '', style }: { orden?: number; className?: string; style?: React.CSSProperties }) {
  const { listo, quieto } = useAnimacion();
  return (
    <motion.span
      className={className}
      style={style}
      initial={{ opacity: quieto ? 1 : 0, scale: quieto ? 1 : 0.4 }}
      animate={{ opacity: listo ? 1 : 0, scale: listo ? 1 : 0.4 }}
      transition={quieto ? { duration: 0 } : { duration: 0.3, delay: Math.min(orden * 0.008, 0.9), ease: SUAVE }}
    />
  );
}

// Cifra que cuenta hasta su valor.
export function Contador({
  valor, formato = (n) => String(Math.round(n)), className,
}: {
  valor: number;
  formato?: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const { listo, quieto } = useAnimacion();
  const previo = useRef(0);
  const fmt = useRef(formato);
  fmt.current = formato;

  useLayoutEffect(() => {
    if (ref.current && !ref.current.textContent) ref.current.textContent = fmt.current(quieto ? valor : 0);
  }, [valor, quieto]);

  useEffect(() => {
    if (!listo) return;
    const desde = previo.current;
    previo.current = valor;
    const escribir = (v: number) => { if (ref.current) ref.current.textContent = fmt.current(v); };
    if (quieto || desde === valor) { escribir(valor); return; }
    const c = animate(desde, valor, { duration: 0.9, ease: SUAVE, onUpdate: escribir, onComplete: () => escribir(valor) });
    return () => c.stop();
  }, [valor, listo, quieto]);

  return <span ref={ref} className={`tabular-nums ${className || ''}`} />;
}

// ---------- Dona ----------

export type ParteDona = { clave: string; valor: number; color: string; info: React.ReactNode; etiqueta?: string };

// Dona de partes de un todo; cada parte se puede señalar. Al centro va el
// porcentaje de la primera parte.
export function Dona({ partes, size = 112, grosor = 13, grupo }: { partes: ParteDona[]; size?: number; grosor?: number; grupo: string }) {
  const { listo, quieto } = useAnimacion();
  const r = (size - grosor - 4) / 2;
  const c = 2 * Math.PI * r;
  const total = partes.reduce((n, p) => n + p.valor, 0);
  const visibles = partes.filter((p) => p.valor > 0);
  const hueco = visibles.length > 1 ? 3 : 0;
  let recorrido = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={grosor} className="text-line-strong" opacity={total > 0 ? 0.35 : 1} />
        {total > 0 && visibles.map((p) => {
          const largo = Math.max(0.5, (p.valor / total) * c - hueco);
          const giro = (recorrido / total) * 360 - 90;
          recorrido += p.valor;
          return (
            <Punto key={p.clave} como="g" grupo={grupo} info={p.info} etiqueta={p.etiqueta}>
              {(activo, otro) => (
                <motion.circle
                  data-ancla=""
                  cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color}
                  transform={`rotate(${giro} ${size / 2} ${size / 2})`}
                  initial={{ strokeDasharray: quieto ? `${largo} ${c}` : `0 ${c}`, strokeWidth: grosor }}
                  animate={{ strokeDasharray: listo ? `${largo} ${c}` : `0 ${c}`, strokeWidth: activo ? grosor + 4 : grosor, opacity: otro ? 0.35 : 1 }}
                  transition={quieto ? { duration: 0 } : { strokeDasharray: { duration: 0.9, ease: SUAVE }, default: { duration: 0.18 } }}
                />
              )}
            </Punto>
          );
        })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <Contador valor={total > 0 ? ((partes[0]?.valor || 0) / total) * 100 : 0} formato={(n) => `${Math.round(n)}%`} className="font-display font-bold text-xl" />
      </div>
    </div>
  );
}

// ---------- Medidor de media luna ----------

export function Medidor({ pct, info, color = COLOR.acento }: { pct: number; info?: React.ReactNode; color?: string }) {
  const { listo, quieto } = useAnimacion();
  const p = Math.max(0, Math.min(100, pct));
  const C = Math.PI * 46;
  const arco = (activo: boolean) => (
    <div className="relative shrink-0" style={{ width: 124, height: 70 }}>
      <svg width={124} height={70} viewBox="0 0 124 70" aria-hidden="true" className="overflow-visible">
        <path d="M16 62a46 46 0 0 1 92 0" fill="none" stroke="currentColor" strokeWidth={12} strokeLinecap="round" className="text-line-strong" />
        <motion.path
          data-ancla=""
          d="M16 62a46 46 0 0 1 92 0" fill="none" stroke={color} strokeLinecap="round"
          initial={{ strokeDasharray: quieto ? `${(p / 100) * C} ${C}` : `0 ${C}`, strokeWidth: 12 }}
          animate={{ strokeDasharray: listo ? `${(p / 100) * C} ${C}` : `0 ${C}`, strokeWidth: activo ? 15 : 12 }}
          transition={quieto ? { duration: 0 } : { strokeDasharray: { duration: 1, ease: SUAVE }, default: { duration: 0.18 } }}
        />
      </svg>
      <span className="absolute inset-x-0 bottom-0 text-center font-display font-bold text-[26px] leading-none pointer-events-none">
        <Contador valor={p} formato={(n) => `${Math.round(n)}%`} />
      </span>
    </div>
  );
  if (!info) return arco(false);
  return <Punto info={info} className="shrink-0">{(activo) => arco(activo)}</Punto>;
}

// ---------- Línea interactiva ----------

export type PuntoLinea = { valor: number | null; etiqueta: string; info: React.ReactNode };

function useAncho<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setAncho(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, ancho];
}

function tope(max: number): number {
  if (max <= 4) return Math.max(2, Math.ceil(max / 2) * 2);
  const paso = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / paso;
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * paso;
}

// Línea con área: al recorrerla se marca el punto más cercano y el globo dice
// qué se midió ese día. `previos` dibuja, punteado, el periodo anterior para
// comparar. Los valores null se saltan.
export function LineaInteractiva({
  puntos, previos, color = COLOR.acento, alto = 190, desdeCero = true, formatoEje = (n) => String(Math.round(n)), cadaEtiqueta, descripcion,
}: {
  puntos: PuntoLinea[];
  previos?: (number | null)[];
  color?: string;
  alto?: number;
  desdeCero?: boolean;
  formatoEje?: ((n: number) => string) | null;
  cadaEtiqueta?: number;
  descripcion: string;
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const { listo, quieto } = useAnimacion();
  const { activo, mostrar, ocultar } = useGlobo();
  const id = useId();
  const degradado = `area${id.replace(/[^a-zA-Z0-9]/g, '')}`;
  const [sobre, setSobre] = useState<number | null>(null);
  const indice = activo?.id === id ? sobre : null;

  const izq = formatoEje ? 34 : 8, der = 10, arr = 10, aba = 8;
  const validos = puntos.map((p, i) => ({ v: p.valor, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  const todos = [...validos.map((p) => p.v), ...(previos || []).filter((v): v is number => v !== null)];
  const max = desdeCero ? tope(Math.max(1, ...todos)) : Math.max(...todos, 1);
  const min = desdeCero ? 0 : Math.min(...todos, max);
  const rango = max - min || 1;
  const n = Math.max(1, puntos.length - 1);
  const x = (i: number) => izq + (i / n) * Math.max(0, ancho - izq - der);
  const y = (v: number) => arr + (1 - (desdeCero ? v / max : 0.12 + ((v - min) / rango) * 0.76)) * (alto - arr - aba);
  const trazo = (lista: { v: number; i: number }[]) => lista.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const linea = trazo(validos);
  const fantasma = trazo((previos || []).map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null));
  const base = alto - aba;

  const señalar = (i: number) => {
    const el = ref.current;
    const p = puntos[i];
    if (!el || !p || p.valor === null) return;
    const r = el.getBoundingClientRect();
    setSobre(i);
    mostrar({ id, caja: { x: r.left + x(i) - 7, y: r.top + y(p.valor) - 7, w: 14, h: 14 }, contenido: p.info });
  };
  const masCercano = (clientX: number) => {
    const el = ref.current;
    if (!el || validos.length === 0) return;
    const px = clientX - el.getBoundingClientRect().left;
    let mejor = validos[0].i;
    validos.forEach((p) => { if (Math.abs(x(p.i) - px) < Math.abs(x(mejor) - px)) mejor = p.i; });
    if (mejor !== indice) señalar(mejor);
  };
  const tecla = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const orden = validos.map((p) => p.i);
    if (orden.length === 0) return;
    const pos = indice === null ? -1 : orden.indexOf(indice);
    const sig = e.key === 'ArrowRight' ? Math.min(orden.length - 1, pos + 1) : pos <= 0 ? 0 : pos - 1;
    señalar(orden[sig]);
  };

  const cada = cadaEtiqueta || Math.max(1, Math.ceil(puntos.length / 7));
  const marcas = desdeCero ? [0, max / 2, max] : [];

  return (
    <div>
      <div
        ref={ref}
        data-punto=""
        role="img"
        aria-label={descripcion}
        tabIndex={0}
        className="relative outline-none focus-visible:ring-2 focus-visible:ring-teal/60 rounded-lg select-none"
        style={{ height: alto, touchAction: 'pan-y', cursor: 'crosshair' }}
        onPointerMove={(e) => masCercano(e.clientX)}
        onPointerDown={(e) => masCercano(e.clientX)}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') { ocultar(id); setSobre(null); } }}
        onKeyDown={tecla}
        onBlur={() => { ocultar(id); setSobre(null); }}
      >
        {ancho > 0 && (
          <svg width={ancho} height={alto} className="block overflow-visible">
            <defs>
              <linearGradient id={degradado} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {marcas.map((m) => (
              <g key={m}>
                <line x1={izq} x2={ancho - der} y1={y(m)} y2={y(m)} stroke="currentColor" className="text-line-strong" strokeWidth={1} strokeDasharray={m === 0 ? undefined : '3 4'} />
                {formatoEje && <text x={izq - 7} y={y(m) + 3.5} textAnchor="end" className="fill-current text-faint" fontSize={10}>{formatoEje(m)}</text>}
              </g>
            ))}
            {fantasma && <path d={fantasma} fill="none" stroke="currentColor" className="text-muted" strokeWidth={1.5} strokeDasharray="4 5" strokeLinecap="round" opacity={0.55} />}
            {validos.length > 1 && (
              <motion.path
                d={`${linea} L${x(validos[validos.length - 1].i).toFixed(1)} ${base} L${x(validos[0].i).toFixed(1)} ${base} Z`}
                fill={`url(#${degradado})`}
                initial={{ opacity: quieto ? 1 : 0 }}
                animate={{ opacity: listo ? 1 : 0 }}
                transition={quieto ? { duration: 0 } : { duration: 0.7, delay: 0.45 }}
              />
            )}
            {validos.length > 1 && (
              <motion.path
                d={linea} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                initial={{ pathLength: quieto ? 1 : 0 }}
                animate={{ pathLength: listo ? 1 : 0 }}
                transition={quieto ? { duration: 0 } : { duration: 1.1, ease: SUAVE }}
              />
            )}
            {indice !== null && puntos[indice]?.valor !== null && (
              <line x1={x(indice)} x2={x(indice)} y1={arr} y2={base} stroke={color} strokeWidth={1} opacity={0.5} />
            )}
            {/* El mismo día del periodo anterior, marcado sobre la punteada. */}
            {indice !== null && typeof previos?.[indice] === 'number' && (
              <circle cx={x(indice)} cy={y(previos[indice] as number)} r={4.5} fill="rgb(var(--c-surface))" stroke="currentColor" className="text-muted" strokeWidth={2} />
            )}
            {validos.map((p, k) => {
              const es = indice === p.i;
              const ultimo = k === validos.length - 1;
              return (
                <g key={p.i}>
                  {es && <circle cx={x(p.i)} cy={y(p.v)} r={10} fill={color} opacity={0.2} />}
                  <motion.circle
                    cx={x(p.i)} cy={y(p.v)} fill={color} stroke="rgb(var(--c-surface))" strokeWidth={1.5}
                    initial={{ r: quieto ? 3 : 0 }}
                    animate={{ r: !listo ? 0 : es ? 5.5 : ultimo ? 4 : validos.length > 16 ? 0 : 3 }}
                    transition={quieto ? { duration: 0 } : { duration: 0.2, delay: es || sobre !== null ? 0 : 0.5 + k * 0.03 }}
                  />
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <div className="relative h-4 mt-1 text-[10.5px] text-muted" aria-hidden="true">
        {ancho > 0 && puntos.map((p, i) => ((puntos.length - 1 - i) % cada === 0 ? (
          <span key={i} className={`absolute -translate-x-1/2 whitespace-nowrap ${indice === i ? 'text-ink font-semibold' : ''}`} style={{ left: x(i) }}>{p.etiqueta}</span>
        ) : null))}
      </div>
    </div>
  );
}
