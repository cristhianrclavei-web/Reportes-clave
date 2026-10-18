'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { AlertTriangle, ChevronRight, CircleDashed, PauseCircle, PenLine, Plus, UtensilsCrossed, X } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { ClaseTiempo, Segmento, minutosPorClaseTiempo, seEnciman } from '@/lib/jornada';
import { ActividadJornada, DiaDeTecnico } from '@/lib/jornadaDatos';
import { CLASES_TIEMPO, infoClase } from '@/lib/clasesTiempo';
import { duracionTexto } from '@/lib/lineaDelDia';
import IconoTipo from './IconoTipo';

// La jornada de una persona en un día: cómo se repartió el tiempo y una
// línea de tiempo vertical con todas las horas (como la vista de un día en
// un calendario). Cada minuto cuenta una sola vez (ver
// lib/jornada.ts): si a media jornada salió por material, ese rato se ve
// como compra y no como servicio. La usan el técnico («Mi día») y
// supervisión (Personal → Jornadas).

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
const minutos = (s: Pick<Segmento, 'inicio' | 'fin'>) => Math.round((s.fin - s.inicio) / 60000);

export function IconoClase({ clase, size = 17 }: { clase: ClaseTiempo; size?: number }) {
  if (clase === 'comida') return <UtensilsCrossed size={size} strokeWidth={2.2} />;
  if (clase === 'pausa') return <PauseCircle size={size} strokeWidth={2.2} />;
  if (clase === 'sin_registrar') return <CircleDashed size={size} strokeWidth={2.2} />;
  if (clase === 'servicio') return <IconoTipo tipo="servicio" size={size} />;
  return <IconoTipo tipo={clase} size={size} />;
}

// Barra 100% con el reparto del tiempo y su leyenda. También la usa el
// resumen del equipo.
export function RepartoTiempo({ porClase, compacta = false }: { porClase: Partial<Record<ClaseTiempo, number>>; compacta?: boolean }) {
  const total = Object.values(porClase).reduce((n, v) => n + (v || 0), 0);
  if (total === 0) return null;
  const clases = CLASES_TIEMPO.filter((c) => (porClase[c.clave] || 0) > 0);
  return (
    <div>
      <div className={`flex w-full overflow-hidden rounded-full bg-surface-2 ${compacta ? 'h-2.5' : 'h-4'}`} role="img"
        aria-label={clases.map((c) => `${c.nombre} ${Math.round(((porClase[c.clave] || 0) / total) * 100)}%`).join(', ')}>
        {clases.map((c) => (
          <span
            key={c.clave}
            className={c.clave === 'sin_registrar' ? 'bg-amber/35' : ''}
            style={{ width: `${((porClase[c.clave] || 0) / total) * 100}%`, backgroundColor: c.clave === 'sin_registrar' ? undefined : c.color }}
          />
        ))}
      </div>
      {!compacta && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 mt-3">
          {clases.map((c) => (
            <li key={c.clave} className="flex items-center gap-2 text-[12.5px] min-w-0">
              <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${c.clave === 'sin_registrar' ? 'border border-dashed border-amber bg-amber/20' : ''}`}
                style={{ backgroundColor: c.clave === 'sin_registrar' ? undefined : c.color }} />
              <span className="truncate text-ink/85">{c.nombre}</span>
              <span className="ml-auto tabular-nums font-semibold shrink-0">{duracionTexto(porClase[c.clave] || 0)}</span>
              <span className="tabular-nums text-muted w-9 text-right shrink-0">{Math.round(((porClase[c.clave] || 0) / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Alto de la línea de tiempo: píxeles por minuto (66 px por hora).
const PX_POR_MIN = 1.1;
// Un tramo nunca se dibuja más bajo que esto, para que se pueda tocar.
const ALTO_MINIMO = 22;
// Espacio arriba para que la etiqueta de la primera hora no se corte.
const MARGEN_ARRIBA = 8;

// Fondo suave del color del tramo (el color puede ser una variable CSS).
const tinte = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

export default function JornadaDia({
  dia, esHoy, ahora, hrefServicio, hrefActividad, onLlenar, onEditar, onBorrar,
}: {
  dia: DiaDeTecnico;
  esHoy: boolean;
  ahora: number;
  hrefServicio: (id: string) => string;
  hrefActividad: (id: string) => string;
  // Solo el técnico: abre el registro a mano con ese tramo ya puesto
  // (sin tramo cuando el día está vacío).
  onLlenar?: (tramo: { inicio: number; fin: number } | null) => void;
  // Solo el técnico: corregir algo que registró a mano.
  onEditar?: (actividad: ActividadJornada) => void;
  // Solo el técnico: borrar una actividad suya (en vivo o a mano).
  onBorrar?: (actividad: ActividadJornada) => void;
}) {
  // Tramo tocado (que no es un hueco del técnico): se explica en una hoja.
  const [elegido, setElegido] = useState<Segmento | null>(null);
  const { segmentos } = dia;
  const porClase = minutosPorClaseTiempo(segmentos);
  const actividadPorId = new Map(dia.actividades.map((a) => [a.id, a]));

  // Actividades de bitácora encimadas (por ejemplo, una iniciada en vivo
  // mientras ya había otra abierta): se avisa para que se corrija.
  const choques: [string, string][] = [];
  dia.actividades.forEach((a, i) => {
    dia.actividades.slice(i + 1).forEach((b) => {
      const rangoA = { inicio: a.inicio, fin: a.fin ?? ahora };
      const rangoB = { inicio: b.inicio, fin: b.fin ?? ahora };
      if (seEnciman(rangoA, rangoB)) choques.push([a.titulo, b.titulo]);
    });
  });

  if (segmentos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong px-4 py-7 text-center">
        <p className="text-[14px] font-medium">Nada registrado este día</p>
        <p className="text-[12.5px] text-muted mt-1">
          {onLlenar ? 'Si trabajaste y se te pasó iniciar, regístralo a mano.' : 'No hubo servicios ni actividades.'}
        </p>
        {onLlenar && (
          <button type="button" onClick={() => onLlenar(null)}
            className="mt-3 min-h-[42px] px-4 rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold inline-flex items-center gap-2 active:scale-95 transition-transform">
            <PenLine size={15} strokeWidth={2.4} /> Registrar a mano
          </button>
        )}
      </div>
    );
  }

  // Ventana de horas completas que abarca la jornada.
  const horaDesde = new Date(segmentos[0].inicio);
  horaDesde.setMinutes(0, 0, 0);
  const horaHasta = new Date(segmentos[segmentos.length - 1].fin);
  if (horaHasta.getMinutes() > 0 || horaHasta.getSeconds() > 0) horaHasta.setHours(horaHasta.getHours() + 1, 0, 0, 0);
  const ventanaInicio = horaDesde.getTime();
  const ventanaFin = Math.max(horaHasta.getTime(), ventanaInicio + 3600000);
  const y = (t: number) => MARGEN_ARRIBA + ((t - ventanaInicio) / 60000) * PX_POR_MIN;
  const altoTotal = y(ventanaFin);
  const horas: number[] = [];
  for (let t = ventanaInicio; t <= ventanaFin; t += 3600000) horas.push(t);

  const sinRegistrar = porClase.sin_registrar || 0;
  const registrado = Object.entries(porClase).reduce((n, [k, v]) => (k === 'sin_registrar' ? n : n + (v || 0)), 0);

  function tituloDe(s: Segmento): string {
    if (s.clase === 'sin_registrar') return 'Sin registrar';
    if (s.clase === 'comida' || s.clase === 'pausa') return infoClase(s.clase).nombre;
    if (s.clase === 'compra' && s.origen?.tipo === 'servicio') return 'Salida por material';
    return s.origen?.titulo || infoClase(s.clase).nombre;
  }
  function detalleDe(s: Segmento): string {
    if (s.clase === 'sin_registrar') return 'No hay servicio ni actividad en este tramo';
    if (s.origen?.tipo === 'servicio' && s.clase !== 'servicio') return `Pausa del servicio «${s.origen.titulo}»`;
    if (s.clase === 'servicio') return 'Trabajo en servicio';
    const partes = [infoClase(s.clase).nombre];
    const actividad = s.origen ? actividadPorId.get(s.origen.id) : undefined;
    if (actividad?.origen === 'manual') partes.push('registrada a mano');
    if (s.dudoso) partes.push('se cerró sola');
    return partes.join(' · ');
  }
  function hrefDe(s: Segmento): string | null {
    if (!s.origen) return null;
    return s.origen.tipo === 'servicio' ? hrefServicio(s.origen.id) : hrefActividad(s.origen.id);
  }
  function editableDe(s: Segmento): ActividadJornada | null {
    if (!onEditar || s.origen?.tipo !== 'actividad') return null;
    const actividad = actividadPorId.get(s.origen.id);
    if (!actividad || actividad.origen !== 'manual') return null;
    if (ahora - actividad.inicio > 7 * 24 * 3600000) return null;
    return actividad;
  }
  // Actividades propias que se pueden borrar: últimos 7 días y sin reporte.
  function borrableDe(s: Segmento): ActividadJornada | null {
    if (!onBorrar || s.origen?.tipo !== 'actividad') return null;
    const actividad = actividadPorId.get(s.origen.id);
    if (!actividad || actividad.reportId) return null;
    if (ahora - actividad.inicio > 7 * 24 * 3600000) return null;
    return actividad;
  }
  function tocar(s: Segmento) {
    if (s.clase === 'sin_registrar' && onLlenar) {
      onLlenar({ inicio: s.inicio, fin: s.fin });
      return;
    }
    setElegido(s);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Resumen: cuánto se registró y en qué */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-surface-2/70 px-3 py-2">
          <span className="block text-[11px] uppercase tracking-wider text-muted">Registrado</span>
          <span className="block font-display font-bold text-[16px] tabular-nums leading-tight mt-0.5">{duracionTexto(registrado)}</span>
        </div>
        <div className="rounded-xl bg-surface-2/70 px-3 py-2">
          <span className="block text-[11px] uppercase tracking-wider text-muted">En servicio</span>
          <span className="block font-display font-bold text-[16px] tabular-nums leading-tight mt-0.5 text-teal">{duracionTexto(porClase.servicio || 0)}</span>
        </div>
        <div className="rounded-xl bg-surface-2/70 px-3 py-2">
          <span className="block text-[11px] uppercase tracking-wider text-muted">Sin registrar</span>
          <span className={`block font-display font-bold text-[16px] tabular-nums leading-tight mt-0.5 ${sinRegistrar > 0 ? 'text-amber' : 'text-muted'}`}>{duracionTexto(sinRegistrar)}</span>
        </div>
      </div>

      <RepartoTiempo porClase={porClase} />

      {choques.length > 0 && (
        <div className="rounded-xl border border-red/40 bg-red/8 px-3.5 py-2.5 text-[12.5px]">
          <p className="font-semibold text-red flex items-center gap-1.5"><AlertTriangle size={15} strokeWidth={2.4} /> Actividades encimadas</p>
          {choques.map(([a, b], i) => (
            <p key={i} className="text-ink/80 mt-0.5">«{a}» y «{b}» ocupan la misma hora. Solo cuenta la más reciente; corrige la otra.</p>
          ))}
        </div>
      )}

      {onLlenar && sinRegistrar > 0 && (
        <p className="text-[12.5px] text-ink/75 flex items-center gap-1.5">
          <Plus size={14} strokeWidth={2.6} className="text-amber" />
          Toca un tramo con rayas para llenarlo; toca lo que registraste a mano para editarlo.
        </p>
      )}

      {/* Línea de tiempo: horas a la izquierda, cada tramo a su altura. */}
      <div className="relative select-none" style={{ height: altoTotal + 8 }} aria-label="Línea de tiempo del día">
        {/* Fuera del horario de la jornada, el fondo va más tenue. */}
        {dia.jornada && (
          <span
            className="absolute left-12 right-0 rounded-lg bg-surface-2/50"
            style={{ top: Math.max(0, y(dia.jornada.inicio)), height: Math.max(0, Math.min(altoTotal, y(dia.jornada.fin)) - Math.max(0, y(dia.jornada.inicio))) }}
            aria-hidden="true"
          />
        )}
        {horas.map((t) => (
          <div key={t} className="absolute left-0 right-0 flex items-center gap-2 pointer-events-none" style={{ top: y(t) - 7 }}>
            <span className="w-10 text-right text-[11px] font-semibold text-faint tabular-nums">{String(new Date(t).getHours()).padStart(2, '0')}:00</span>
            <span className="flex-1 h-px bg-line" />
          </div>
        ))}
        {horas.slice(0, -1).map((t) => (
          <span key={`m${t}`} className="absolute left-12 right-0 border-t border-dashed border-line/60 pointer-events-none" style={{ top: y(t + 1800000) }} aria-hidden="true" />
        ))}

        {segmentos.map((s, i) => {
          const top = y(s.inicio);
          const alto = Math.max(ALTO_MINIMO, y(s.fin) - top - 2);
          const color = infoClase(s.clase).color;
          const hueco = s.clase === 'sin_registrar';
          const compacto = alto < 44;
          return (
            <motion.button
              key={`${s.inicio}-${i}`}
              type="button"
              onClick={() => tocar(s)}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.4) }}
              whileTap={{ scale: 0.98 }}
              aria-label={`${tituloDe(s)}, de ${hhmm(s.inicio)} a ${hhmm(s.fin)}${hueco && onLlenar ? '. Toca para llenarlo' : ''}`}
              className={`absolute left-14 right-0 z-[1] bg-surface rounded-xl text-left overflow-hidden flex gap-2.5 px-2.5 transition-shadow hover:shadow-diffuse focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal ${
                compacto ? 'items-center' : 'items-start pt-2'
              } ${hueco ? 'border border-dashed border-amber/70' : 'border-l-4'} ${s.dudoso ? 'opacity-60' : ''}`}
              // Fondo sólido (bg-surface) con el tinte encima: así las líneas de
              // las horas no se transparentan sobre el tramo.
              style={{
                top: top + 1,
                height: alto,
                borderLeftColor: hueco ? undefined : color,
                backgroundImage: hueco
                  ? 'repeating-linear-gradient(135deg, rgba(245,158,11,0.13) 0 8px, rgba(245,158,11,0.04) 8px 16px)'
                  : `linear-gradient(${tinte(color, 16)}, ${tinte(color, 16)})`,
              }}
            >
              {!compacto && (
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${hueco ? 'text-amber bg-amber/15' : 'text-white'}`} style={{ backgroundColor: hueco ? undefined : color }}>
                  <IconoClase clase={s.clase} size={15} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className={`block font-semibold truncate leading-tight ${compacto ? 'text-[12.5px]' : 'text-[13.5px]'} ${hueco ? 'text-amber' : ''}`}>
                  {tituloDe(s)}
                  {compacto && <span className="font-normal text-muted"> · {hhmm(s.inicio)}–{hhmm(s.fin)}</span>}
                </span>
                {!compacto && (
                  <span className="block text-[12px] text-muted tabular-nums mt-0.5 truncate">
                    {hhmm(s.inicio)}–{hhmm(s.fin)} · {duracionTexto(minutos(s))}
                  </span>
                )}
              </span>
              {hueco && onLlenar && (
                <span className={`shrink-0 rounded-full bg-amber text-inkOnAccent font-semibold flex items-center gap-1 ${compacto ? 'text-[11px] px-2 py-0.5' : 'text-[12px] px-2.5 py-1 mt-0.5'}`}>
                  <Plus size={12} strokeWidth={2.8} /> Llenar
                </span>
              )}
              {!hueco && !compacto && (
                <span className="shrink-0 text-[11.5px] font-semibold tabular-nums text-ink/70 mt-0.5">{duracionTexto(minutos(s))}</span>
              )}
            </motion.button>
          );
        })}

        {esHoy && ahora > ventanaInicio && ahora < ventanaFin && (
          <div className="absolute left-0 right-0 flex items-center pointer-events-none z-10" style={{ top: y(ahora) - 8 }} aria-hidden="true">
            <span className="w-12 text-right pr-1 text-[10.5px] font-bold text-red tabular-nums">{hhmm(ahora)}</span>
            <span className="w-2.5 h-2.5 rounded-full bg-red -ml-0.5" />
            <span className="flex-1 h-0.5 bg-red" />
          </div>
        )}
      </div>

      {onLlenar && (
        <button type="button" onClick={() => onLlenar(null)}
          className="w-full min-h-[46px] rounded-xl border border-dashed border-teal/50 text-teal text-[13.5px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
          <PenLine size={15} strokeWidth={2.4} /> Registrar algo a mano en este día
        </button>
      )}

      {elegido && (
        <ModalOverlay onClose={() => setElegido(null)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5">
            <div className="flex items-start gap-3">
              <span
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${elegido.clase === 'sin_registrar' ? 'text-amber bg-amber/15' : 'text-white'}`}
                style={{ backgroundColor: elegido.clase === 'sin_registrar' ? undefined : infoClase(elegido.clase).color }}
              >
                <IconoClase clase={elegido.clase} size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold text-[17px] tracking-wide leading-snug">{tituloDe(elegido)}</p>
                <p className="text-[12.5px] text-muted">{detalleDe(elegido)}</p>
              </div>
              <button type="button" onClick={() => setElegido(null)} aria-label="Cerrar" className="w-9 h-9 rounded-full bg-surface-2 border border-line flex items-center justify-center shrink-0">
                <X size={16} strokeWidth={2.4} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4">
              {([['De', hhmm(elegido.inicio)], ['A', hhmm(elegido.fin)], ['Duración', duracionTexto(minutos(elegido))]] as const).map(([r, v]) => (
                <div key={r} className="rounded-xl bg-surface-2/70 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wider text-muted">{r}</p>
                  <p className="font-display font-bold text-[16px] tabular-nums leading-tight mt-0.5">{v}</p>
                </div>
              ))}
            </div>
            {elegido.clase === 'sin_registrar' && (
              <p className="text-[12.5px] text-ink/80 mt-3">En este tramo de la jornada no hay servicio ni actividad. El técnico lo puede llenar desde su bitácora.</p>
            )}
            {elegido.origen?.tipo === 'servicio' && elegido.clase !== 'servicio' && (
              <p className="text-[12.5px] text-ink/80 mt-3">Este rato se descuenta del tiempo de trabajo en el servicio.</p>
            )}
            <div className="flex flex-col gap-2 mt-4">
              {(() => {
                const editable = editableDe(elegido);
                if (!editable) return null;
                return (
                  <button type="button" onClick={() => { setElegido(null); onEditar!(editable); }}
                    className="min-h-[48px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[14.5px] flex items-center justify-center gap-2 active:scale-95 transition-transform">
                    <PenLine size={16} strokeWidth={2.4} /> Editar horario o tipo
                  </button>
                );
              })()}
              {(() => {
                const borrable = borrableDe(elegido);
                if (!borrable) return null;
                return (
                  <button type="button" onClick={() => { setElegido(null); onBorrar!(borrable); }}
                    className="min-h-[44px] rounded-2xl text-red font-semibold text-[14px] flex items-center justify-center gap-1.5 active:scale-95 transition-transform order-last">
                    Borrar esta actividad
                  </button>
                );
              })()}
              {hrefDe(elegido) && (
                <Link href={hrefDe(elegido)!} className="min-h-[48px] rounded-2xl border border-line-strong text-ink/85 font-semibold text-[14.5px] flex items-center justify-center gap-1.5 active:scale-95 transition-transform">
                  Abrir {elegido.origen?.tipo === 'servicio' ? 'el servicio' : 'la actividad'} <ChevronRight size={16} strokeWidth={2.4} />
                </Link>
              )}
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
