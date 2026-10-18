'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CircleDashed, PauseCircle, PenLine, UtensilsCrossed } from 'lucide-react';
import { ClaseTiempo, Segmento, minutosPorClaseTiempo, seEnciman } from '@/lib/jornada';
import { DiaDeTecnico } from '@/lib/jornadaDatos';
import { CLASES_TIEMPO, infoClase } from '@/lib/clasesTiempo';
import { duracionTexto } from '@/lib/lineaDelDia';
import IconoTipo from './IconoTipo';

// La jornada de una persona en un día: cómo se repartió el tiempo, la barra
// de horas y la lista en orden. Cada minuto cuenta una sola vez (ver
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

export default function JornadaDia({
  dia, esHoy, ahora, hrefServicio, hrefActividad, onLlenar,
}: {
  dia: DiaDeTecnico;
  esHoy: boolean;
  ahora: number;
  hrefServicio: (id: string) => string;
  hrefActividad: (id: string) => string;
  // Solo el técnico: abre el registro a mano con ese tramo ya puesto
  // (sin tramo cuando el día está vacío).
  onLlenar?: (tramo: { inicio: number; fin: number } | null) => void;
}) {
  const [elegido, setElegido] = useState<number | null>(null);
  const { segmentos } = dia;
  const porClase = minutosPorClaseTiempo(segmentos);
  const manuales = new Set(dia.actividades.filter((a) => a.origen === 'manual').map((a) => a.id));

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

  const desdeMs = segmentos[0].inicio;
  const hastaMs = segmentos[segmentos.length - 1].fin;
  const horaDesde = new Date(desdeMs);
  horaDesde.setMinutes(0, 0, 0);
  const horaHasta = new Date(hastaMs);
  if (horaHasta.getMinutes() > 0 || horaHasta.getSeconds() > 0) horaHasta.setHours(horaHasta.getHours() + 1, 0, 0, 0);
  const ventanaInicio = horaDesde.getTime();
  const ventanaFin = Math.max(horaHasta.getTime(), ventanaInicio + 3600000);
  const total = ventanaFin - ventanaInicio;
  const pct = (t: number) => ((t - ventanaInicio) / total) * 100;
  const horas: number[] = [];
  for (let t = ventanaInicio; t <= ventanaFin; t += 3600000) horas.push(t);

  const sinRegistrar = porClase.sin_registrar || 0;
  const registrado = Object.entries(porClase).reduce((n, [k, v]) => (k === 'sin_registrar' ? n : n + (v || 0)), 0);
  const seg = elegido !== null ? segmentos[elegido] : null;

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
    if (s.origen && manuales.has(s.origen.id)) partes.push('registrada a mano');
    if (s.dudoso) partes.push('se cerró sola');
    return partes.join(' · ');
  }
  function hrefDe(s: Segmento): string | null {
    if (!s.origen) return null;
    return s.origen.tipo === 'servicio' ? hrefServicio(s.origen.id) : hrefActividad(s.origen.id);
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

      {/* Barra de horas */}
      <div>
        <div className="relative h-12 rounded-xl bg-surface-2 border border-line overflow-hidden">
          {horas.slice(1, -1).map((t) => (
            <span key={t} className="absolute top-0 bottom-0 w-px bg-line" style={{ left: `${pct(t)}%` }} />
          ))}
          {segmentos.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setElegido(elegido === i ? null : i)}
              aria-label={`${tituloDe(s)}, de ${hhmm(s.inicio)} a ${hhmm(s.fin)}`}
              aria-pressed={elegido === i}
              className={`absolute transition-all duration-150 ${elegido === i ? 'top-0.5 bottom-0.5 ring-2 ring-ink/80 z-10 rounded' : 'top-2 bottom-2'} ${
                s.clase === 'sin_registrar' ? 'border border-dashed border-amber/70 bg-amber/15 rounded' : ''
              } ${s.dudoso ? 'opacity-50' : ''}`}
              style={{
                left: `${pct(s.inicio)}%`,
                width: `${Math.max(0.8, pct(s.fin) - pct(s.inicio))}%`,
                backgroundColor: s.clase === 'sin_registrar' ? undefined : infoClase(s.clase).color,
              }}
            />
          ))}
          {esHoy && ahora > ventanaInicio && ahora < ventanaFin && (
            <span className="absolute top-0 bottom-0 w-0.5 bg-red pointer-events-none" style={{ left: `${pct(ahora)}%` }} aria-hidden="true" />
          )}
        </div>
        <div className="relative h-5 mt-1">
          {horas.map((t, i) => (
            <span
              key={t}
              className={`absolute -translate-x-1/2 text-[10.5px] text-faint tabular-nums ${i % 2 ? 'hidden sm:block' : ''} ${i === 0 ? '!translate-x-0' : ''} ${i === horas.length - 1 ? '!-translate-x-full' : ''}`}
              style={{ left: `${pct(t)}%` }}
            >
              {new Date(t).getHours()}:00
            </span>
          ))}
        </div>
        {seg && (
          <p className="text-[12.5px] text-ink/85 mt-1">
            <b>{tituloDe(seg)}</b> · {hhmm(seg.inicio)}–{hhmm(seg.fin)} · {duracionTexto(minutos(seg))}
          </p>
        )}
      </div>

      {/* Lo mismo, en orden */}
      <ol className="flex flex-col gap-2">
        {segmentos.map((s, i) => {
          const href = hrefDe(s);
          const contenido = (
            <>
              <span
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${s.clase === 'sin_registrar' ? 'text-amber' : 'text-white'}`}
                style={{ backgroundColor: s.clase === 'sin_registrar' ? undefined : infoClase(s.clase).color }}
              >
                <IconoClase clase={s.clase} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[14px] font-semibold truncate ${s.clase === 'sin_registrar' ? 'text-amber' : ''}`}>{tituloDe(s)}</span>
                <span className="block text-[12.5px] text-muted truncate">{detalleDe(s)}</span>
              </span>
              <span className="text-right shrink-0">
                <span className="block text-[13px] font-semibold tabular-nums">{hhmm(s.inicio)}–{hhmm(s.fin)}</span>
                <span className="block text-[12px] text-muted tabular-nums">{duracionTexto(minutos(s))}</span>
              </span>
            </>
          );
          if (s.clase === 'sin_registrar') {
            return (
              <li key={i} className="flex items-center gap-3 rounded-xl border border-dashed border-amber/50 bg-amber/5 px-3.5 py-2">
                {contenido}
                {onLlenar && (
                  <button type="button" onClick={() => onLlenar({ inicio: s.inicio, fin: s.fin })}
                    className="shrink-0 min-h-[38px] px-3 rounded-full bg-amber text-inkOnAccent text-[12.5px] font-semibold flex items-center gap-1 active:scale-95 transition-transform">
                    <PenLine size={13} strokeWidth={2.5} /> Llenar
                  </button>
                )}
              </li>
            );
          }
          return (
            <li key={i}>
              {href ? (
                <Link href={href} className={`flex items-center gap-3 rounded-xl border bg-surface px-3.5 py-2.5 transition-colors hover:border-teal/45 ${elegido === i ? 'border-teal/60' : 'border-line'}`}>
                  {contenido}
                </Link>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5">{contenido}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
