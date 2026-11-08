'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { figuraDe } from '@/lib/simbolosPlano';
import { FiguraEnSvg } from '@/components/lazos/SimboloPlano';
import type { LineaConexion, MarcaConexion } from '@/lib/conexionesPlano';
import type { Ajuste, Guias } from '@/lib/trazoRecto';
import {
  colorEquipo, colorTuberia, equipoEn, tamanoDe, tamanoSimbolo, tuberiaEn,
  type EquipoPlano, type Punto, type Sembrado, type TuberiaPlano,
} from '@/lib/planos';

// El plano con lo sembrado encima. Se mueve con un dedo (o el mouse), se
// acerca con dos dedos (o la rueda), y avisa al editor cuando se toca algo.
// Todo se dibuja en puntos de la hoja dentro de un <g> con la vista
// (desplazamiento y acercamiento), así los símbolos quedan donde van.

export type Seleccion = { tipo: 'equipo' | 'tuberia'; id: string } | null;

type Vista = { s: number; tx: number; ty: number };

// Un quiebre o punta de una tubería (su lugar en la lista de puntos).
export type NodoTuberia = { tuberiaId: string; indice: number };

type Gesto =
  | { tipo: 'nada' }
  | { tipo: 'posible'; x: number; y: number; vista: Vista; equipoId: string | null; nodo: NodoTuberia | null }
  | { tipo: 'pan'; x: number; y: number; vista: Vista }
  | { tipo: 'arrastre'; equipoId: string }
  | { tipo: 'arrastreNodo'; nodo: NodoTuberia }
  | { tipo: 'pinza'; distancia: number; centro: { x: number; y: number }; vista: Vista };

// Cuánto hay que mover el dedo para que deje de ser un toque.
const UMBRAL_MOVIMIENTO = 7;
// Radio para tocar un equipo o una tubería, en pixeles de pantalla.
const RADIO_TOQUE = 22;

export default function LienzoPlano({
  imagenUrl, ancho, alto, sembrado, etiquetaDe, seleccion, trazo, colorTrazo, medida,
  ajustarPunto, onTocar, onDobleToque, onArrastreInicio, onArrastre, onArrastreFin,
  conexiones, colorPorLazo, resaltado, ayudaPuntero, guiasArrastre, verNodos, onNodoInicio, onNodo, onNodoFin,
}: {
  imagenUrl: string | null;
  ancho: number;
  alto: number;
  sembrado: Sembrado;
  etiquetaDe: (e: EquipoPlano) => string;
  seleccion: Seleccion;
  trazo: Punto[];
  colorTrazo: string;
  medida: Punto[];
  // Cómo queda el siguiente toque de la tubería (a 90°, con codo, alineado).
  ajustarPunto: (p: Punto) => Ajuste;
  onTocar: (p: Punto, equipo: EquipoPlano | null, tuberia: TuberiaPlano | null) => void;
  onDobleToque: () => void;
  onArrastreInicio: (id: string) => void;
  onArrastre: (id: string, p: Punto) => void;
  onArrastreFin: (id: string) => void;
  // Línea punteada con flecha entre dispositivos del mismo lazo (null = no se ven).
  conexiones: { lineas: LineaConexion[]; marcas: MarcaConexion[] } | null;
  colorPorLazo: Map<string, string>;
  // Símbolo (id en el plano) del que sale el cable al conectar.
  resaltado: string | null;
  // Tubería, equipos o conectar: con el mouse encima se ven la vista previa y las guías.
  ayudaPuntero: boolean;
  // Guías mientras se arrastra un equipo.
  guiasArrastre: Guias | null;
  // Ver los nodos de tubería (quiebres y puntas): se unen y se arrastran.
  verNodos: boolean;
  onNodoInicio: (nodo: NodoTuberia) => void;
  onNodo: (nodo: NodoTuberia, p: Punto) => void;
  onNodoFin: () => void;
}) {
  const marco = useRef<HTMLDivElement>(null);
  const [vista, setVista] = useState<Vista>({ s: 0, tx: 0, ty: 0 });
  const vistaRef = useRef(vista);
  vistaRef.current = vista;
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<Gesto>({ tipo: 'nada' });
  const [encima, setEncima] = useState<Punto | null>(null);
  // Mientras no se mueva ni se acerque, el plano se reacomoda si cambia el
  // tamaño de la pantalla (girar el teléfono, abrir el panel).
  const movido = useRef(false);

  const ajustar = useCallback(() => {
    const caja = marco.current?.getBoundingClientRect();
    if (!caja || caja.width === 0) return;
    const s = Math.min(caja.width / ancho, caja.height / alto) * 0.96;
    setVista({ s, tx: (caja.width - ancho * s) / 2, ty: (caja.height - alto * s) / 2 });
  }, [ancho, alto]);

  // La primera vez el plano entra completo en pantalla.
  useLayoutEffect(() => {
    if (!movido.current) ajustar();
  }, [ajustar]);

  useEffect(() => {
    const elemento = marco.current;
    if (!elemento) return;
    const observador = new ResizeObserver(() => {
      if (!movido.current) ajustar();
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [ajustar]);

  function enMarco(ev: { clientX: number; clientY: number }) {
    const caja = marco.current!.getBoundingClientRect();
    return { x: ev.clientX - caja.left, y: ev.clientY - caja.top };
  }

  function aHoja(x: number, y: number, v: Vista = vistaRef.current): Punto {
    return [(x - v.tx) / v.s, (y - v.ty) / v.s];
  }

  // Acercar o alejar dejando fijo el punto (cx, cy) de la pantalla.
  function zoomEn(factor: number, cx: number, cy: number) {
    movido.current = true;
    setVista((v) => {
      const minimo = Math.min((marco.current?.clientWidth || 300) / ancho, (marco.current?.clientHeight || 300) / alto) * 0.5;
      const s = Math.min(Math.max(v.s * factor, minimo), minimo * 80);
      const [hx, hy] = [(cx - v.tx) / v.s, (cy - v.ty) / v.s];
      return { s, tx: cx - hx * s, ty: cy - hy * s };
    });
  }

  // La rueda tiene que poder cancelar el desplazamiento de la página.
  useEffect(() => {
    const elemento = marco.current;
    if (!elemento) return;
    function rueda(ev: WheelEvent) {
      ev.preventDefault();
      const caja = elemento!.getBoundingClientRect();
      zoomEn(Math.exp(-ev.deltaY * 0.0015), ev.clientX - caja.left, ev.clientY - caja.top);
    }
    elemento.addEventListener('wheel', rueda, { passive: false });
    return () => elemento.removeEventListener('wheel', rueda);
  });

  function radioEnHoja() {
    return RADIO_TOQUE / vistaRef.current.s;
  }

  function alBajar(ev: React.PointerEvent) {
    try {
      marco.current?.setPointerCapture(ev.pointerId);
    } catch {
      // Algunos navegadores no dejan capturar (puntero ya liberado): se sigue sin captura.
    }
    const p = enMarco(ev);
    punteros.current.set(ev.pointerId, p);
    if (punteros.current.size === 1) {
      // Si empieza sobre un equipo y el dedo se mueve, se arrastra el equipo
      // (con cualquier herramienta); si no, se recorre el plano.
      const tocado = equipoEn(sembrado, aHoja(p.x, p.y), radioEnHoja(), r);
      const equipoId = tocado?.id || null;
      // Si no es un equipo y se ven los nodos, puede ser un nodo de tubería.
      const nodo = !equipoId && verNodos ? nodoEn(aHoja(p.x, p.y), radioEnHoja()) : null;
      gesto.current = { tipo: 'posible', x: p.x, y: p.y, vista: vistaRef.current, equipoId, nodo };
      return;
    }
    if (punteros.current.size === 2) {
      if (gesto.current.tipo === 'arrastre') onArrastreFin(gesto.current.equipoId);
      const [a, b] = [...punteros.current.values()];
      gesto.current = {
        tipo: 'pinza',
        distancia: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        centro: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        vista: vistaRef.current,
      };
    }
  }

  function alMover(ev: React.PointerEvent) {
    const p = enMarco(ev);
    if (ev.pointerType === 'mouse' && ev.buttons === 0) {
      setEncima(aHoja(p.x, p.y));
      return;
    }
    if (!punteros.current.has(ev.pointerId)) return;
    punteros.current.set(ev.pointerId, p);
    const g = gesto.current;
    if (g.tipo === 'posible') {
      if (Math.hypot(p.x - g.x, p.y - g.y) < UMBRAL_MOVIMIENTO) return;
      if (g.equipoId) {
        gesto.current = { tipo: 'arrastre', equipoId: g.equipoId };
        onArrastreInicio(g.equipoId);
      } else if (g.nodo) {
        gesto.current = { tipo: 'arrastreNodo', nodo: g.nodo };
        onNodoInicio(g.nodo);
      } else {
        gesto.current = { tipo: 'pan', x: g.x, y: g.y, vista: g.vista };
      }
    }
    const actual = gesto.current;
    if (actual.tipo === 'pan') {
      movido.current = true;
      setVista({ s: actual.vista.s, tx: actual.vista.tx + p.x - actual.x, ty: actual.vista.ty + p.y - actual.y });
    } else if (actual.tipo === 'arrastre') {
      onArrastre(actual.equipoId, aHoja(p.x, p.y));
    } else if (actual.tipo === 'arrastreNodo') {
      onNodo(actual.nodo, aHoja(p.x, p.y));
    } else if (actual.tipo === 'pinza' && punteros.current.size >= 2) {
      const [a, b] = [...punteros.current.values()];
      const distancia = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const centro = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const v0 = actual.vista;
      const s = v0.s * (distancia / actual.distancia);
      const [hx, hy] = aHoja(actual.centro.x, actual.centro.y, v0);
      movido.current = true;
      setVista({ s, tx: centro.x - hx * s, ty: centro.y - hy * s });
    }
  }

  function alSubir(ev: React.PointerEvent) {
    const g = gesto.current;
    punteros.current.delete(ev.pointerId);
    if (g.tipo === 'posible') {
      const p = aHoja(g.x, g.y);
      const radio = radioEnHoja();
      onTocar(p, equipoEn(sembrado, p, radio, r), tuberiaEn(sembrado, p, radio * 0.6));
    } else if (g.tipo === 'arrastre') {
      onArrastreFin(g.equipoId);
    } else if (g.tipo === 'arrastreNodo') {
      onNodoFin();
    }
    // Al soltar un dedo de la pinza no se brinca a mover: se espera a soltar todo.
    gesto.current = { tipo: 'nada' };
  }

  function alCancelar(ev: React.PointerEvent) {
    punteros.current.delete(ev.pointerId);
    if (gesto.current.tipo === 'arrastre') onArrastreFin(gesto.current.equipoId);
    if (gesto.current.tipo === 'arrastreNodo') onNodoFin();
    gesto.current = { tipo: 'nada' };
  }

  // El nodo de tubería más cercano a p, dentro del radio.
  function nodoEn(p: Punto, radio: number): NodoTuberia | null {
    let mejor: NodoTuberia | null = null;
    let menor = radio;
    for (const t of sembrado.tuberias) {
      t.puntos.forEach((n, indice) => {
        const d = Math.hypot(n[0] - p[0], n[1] - p[1]);
        if (d <= menor) {
          menor = d;
          mejor = { tuberiaId: t.id, indice };
        }
      });
    }
    return mejor;
  }

  const { s } = vista;
  const listo = s > 0;
  // Los símbolos miden lo mismo que en el PDF, pero nunca menos de 9 px en pantalla.
  const r = listo ? Math.max(tamanoSimbolo(ancho, alto) / 2, 9 / s) : 1;
  const grosorTubo = listo ? Math.max(tamanoSimbolo(ancho, alto) / 7, 2.5 / s) : 1;
  const ultimo = trazo[trazo.length - 1];
  // Vista previa (con mouse): lo que agregaría el siguiente toque y sus guías.
  const previa = encima && (ultimo || trazo.length === 0) && ayudaPuntero ? ajustarPunto(encima) : null;
  const guias = guiasArrastre || previa?.guias || null;

  return (
    <div
      ref={marco}
      className="relative w-full h-full overflow-hidden bg-[#e9edf2] dark:bg-[#0b1220] select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={alBajar}
      onPointerMove={alMover}
      onPointerUp={alSubir}
      onPointerCancel={alCancelar}
      onPointerLeave={() => setEncima(null)}
      onDoubleClick={onDobleToque}
    >
      {listo && (
        <svg className="absolute inset-0 w-full h-full" role="img" aria-label="Plano con equipos y tubería">
          <g transform={`translate(${vista.tx} ${vista.ty}) scale(${s})`}>
            <rect width={ancho} height={alto} fill="#fff" style={{ filter: 'drop-shadow(0 2px 10px rgba(15,23,42,.18))' }} />
            {imagenUrl && <image href={imagenUrl} width={ancho} height={alto} preserveAspectRatio="none" />}

            {sembrado.tuberias.map((t) => {
              const elegido = seleccion?.tipo === 'tuberia' && seleccion.id === t.id;
              const puntos = t.puntos.map((p) => p.join(',')).join(' ');
              return (
                <g key={t.id}>
                  {elegido && <polyline points={puntos} fill="none" stroke="#14b8a6" strokeOpacity={0.35} strokeWidth={grosorTubo * 4} strokeLinecap="round" strokeLinejoin="round" />}
                  <polyline points={puntos} fill="none" stroke={colorTuberia(t.diametro)} strokeWidth={grosorTubo} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.92} />
                </g>
              );
            })}

            {trazo.length > 0 && (
              <g>
                <polyline points={trazo.map((p) => p.join(',')).join(' ')} fill="none" stroke={colorTrazo} strokeWidth={grosorTubo} strokeLinecap="round" strokeLinejoin="round" />
                {previa && ultimo && (
                  <polyline points={[ultimo, ...previa.puntos].map((p) => p.join(',')).join(' ')} fill="none" stroke={colorTrazo}
                    strokeWidth={grosorTubo} strokeLinejoin="round" strokeDasharray={`${grosorTubo * 2} ${grosorTubo * 2}`} />
                )}
                {trazo.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={grosorTubo * 1.4} fill="#fff" stroke={colorTrazo} strokeWidth={grosorTubo * 0.6} />)}
              </g>
            )}

            {conexiones && conexiones.lineas.map((l, i) => (
              <LineaPunteada key={i} linea={l} color={colorPorLazo.get(l.lazoId) || '#0f766e'} r={r} grosor={grosorTubo * 0.8} />
            ))}

            {/* Guías de alineación, como el rastreo de AutoCAD: franja
                sombreada y línea punteada a lo largo de toda la hoja. */}
            {guias?.x != null && <Guia x1={guias.x} y1={0} x2={guias.x} y2={alto} s={s} />}
            {guias?.y != null && <Guia x1={0} y1={guias.y} x2={ancho} y2={guias.y} s={s} />}

            {/* Nodos de tubería: puntos donde se puede unir otro tramo. */}
            {verNodos && sembrado.tuberias.flatMap((t) => t.puntos.map((n, i) => (
              <circle key={`nodo-${t.id}-${i}`} cx={n[0]} cy={n[1]} r={5 / s} fill="#fff" stroke={colorTuberia(t.diametro)} strokeWidth={1.8 / s} style={{ pointerEvents: 'none' }} />
            )))}
            {previa && previa.puntos.length > 0 && (
              <circle cx={previa.puntos[previa.puntos.length - 1][0]} cy={previa.puntos[previa.puntos.length - 1][1]} r={grosorTubo * 1.6}
                fill="none" stroke="#14b8a6" strokeWidth={1.5 / s} style={{ pointerEvents: 'none' }} />
            )}

            {sembrado.equipos.filter((e) => e.id === resaltado).map((e) => (
              <circle key={`desde-${e.id}`} cx={e.x} cy={e.y} r={r * tamanoDe(e) * 2.1} fill="none" stroke="#14b8a6" strokeWidth={grosorTubo}
                strokeDasharray={`${grosorTubo * 2} ${grosorTubo * 1.5}`} />
            ))}

            {sembrado.equipos.map((e) => (
              <SimboloEnPlano key={e.id} equipo={e} r={r * tamanoDe(e)} etiqueta={etiquetaDe(e)}
                elegido={seleccion?.tipo === 'equipo' && seleccion.id === e.id} />
            ))}

            {conexiones && conexiones.marcas.map((m, i) => (
              <text key={i} x={m.en[0]} y={m.en[1] + r * 2.3} textAnchor="middle" fontSize={r * 0.85} fontWeight={700}
                fontFamily="ui-sans-serif, system-ui" fill={colorPorLazo.get(m.lazoId) || '#0f766e'}
                stroke="#fff" strokeWidth={r * 0.3} paintOrder="stroke" strokeLinejoin="round">{m.texto}</text>
            ))}

            {medida.length > 0 && (
              <g>
                {medida.length === 2 && <line x1={medida[0][0]} y1={medida[0][1]} x2={medida[1][0]} y2={medida[1][1]} stroke="#f59e0b" strokeWidth={grosorTubo} strokeDasharray={`${grosorTubo * 2} ${grosorTubo}`} />}
                {medida.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={grosorTubo * 2} fill="#f59e0b" stroke="#fff" strokeWidth={grosorTubo * 0.6} />)}
              </g>
            )}
          </g>
        </svg>
      )}

      <div className="absolute right-3 bottom-3 flex flex-col gap-1.5" onPointerDown={(ev) => ev.stopPropagation()} onPointerUp={(ev) => ev.stopPropagation()} onDoubleClick={(ev) => ev.stopPropagation()}>
        {[
          { etiqueta: 'Acercar', icono: <Plus size={18} strokeWidth={2.6} />, accion: () => zoomEn(1.4, (marco.current?.clientWidth || 0) / 2, (marco.current?.clientHeight || 0) / 2) },
          { etiqueta: 'Alejar', icono: <Minus size={18} strokeWidth={2.6} />, accion: () => zoomEn(1 / 1.4, (marco.current?.clientWidth || 0) / 2, (marco.current?.clientHeight || 0) / 2) },
          { etiqueta: 'Ver el plano completo', icono: <Maximize size={16} strokeWidth={2.4} />, accion: () => { movido.current = false; ajustar(); } },
        ].map((b) => (
          <button key={b.etiqueta} type="button" aria-label={b.etiqueta} title={b.etiqueta} onClick={b.accion}
            className="w-11 h-11 rounded-xl bg-surface/95 border border-line shadow-md flex items-center justify-center active:scale-95 transition-transform">
            {b.icono}
          </button>
        ))}
      </div>
    </div>
  );
}

function Guia({ x1, y1, x2, y2, s }: { x1: number; y1: number; x2: number; y2: number; s: number }) {
  return (
    <g style={{ pointerEvents: 'none' }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#14b8a6" strokeOpacity={0.18} strokeWidth={10 / s} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0d9488" strokeWidth={1.3 / s} strokeDasharray={`${7 / s} ${5 / s}`} />
    </g>
  );
}

// Conexión de un dispositivo al siguiente: punteada, sin tocar los símbolos,
// con una flecha a la mitad que dice hacia dónde va el cable.
function LineaPunteada({ linea, color, r, grosor }: { linea: LineaConexion; color: string; r: number; grosor: number }) {
  const [x1, y1] = linea.desde;
  const [x2, y2] = linea.hasta;
  const largo = Math.hypot(x2 - x1, y2 - y1);
  if (largo < r * 2.4) return null;
  const ux = (x2 - x1) / largo;
  const uy = (y2 - y1) / largo;
  const separacion = r * 1.2;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const punta = r * 0.75;
  const flecha = [
    [mx + ux * punta, my + uy * punta],
    [mx - ux * punta * 0.6 - uy * punta * 0.7, my - uy * punta * 0.6 + ux * punta * 0.7],
    [mx - ux * punta * 0.6 + uy * punta * 0.7, my - uy * punta * 0.6 - ux * punta * 0.7],
  ].map((p) => p.join(',')).join(' ');
  return (
    <g style={{ pointerEvents: 'none' }}>
      <line x1={x1 + ux * separacion} y1={y1 + uy * separacion} x2={x2 - ux * separacion} y2={y2 - uy * separacion}
        stroke={color} strokeWidth={grosor} strokeDasharray={`${grosor * 3} ${grosor * 2.2}`} strokeLinecap="round" />
      <polygon points={flecha} fill={color} />
    </g>
  );
}

// El símbolo del plano (el mismo del PDF), girado y en puntos de la hoja. La
// etiqueta no gira: se lee siempre derecha.
function SimboloEnPlano({ equipo, r, etiqueta, elegido }: { equipo: EquipoPlano; r: number; etiqueta: string; elegido: boolean }) {
  const tinta = colorEquipo(equipo.tipo);
  return (
    <g transform={`translate(${equipo.x} ${equipo.y})`} style={{ cursor: 'pointer' }}>
      {elegido && <circle r={r * 1.9} fill="#14b8a6" fillOpacity={0.22} stroke="#14b8a6" strokeWidth={r / 7} />}
      <g transform={`rotate(${equipo.rotacion || 0}) scale(${r})`}>
        <FiguraEnSvg figura={figuraDe(equipo.tipo)} />
      </g>
      {etiqueta && (
        <text x={r * 1.25} y={-r * 0.75} fontSize={r * 0.85} fontWeight={700} fontFamily="ui-sans-serif, system-ui" fill={tinta}
          stroke="#fff" strokeWidth={r * 0.28} paintOrder="stroke" strokeLinejoin="round">{etiqueta}</text>
      )}
    </g>
  );
}
