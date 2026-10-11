'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, CircleDashed, AlertTriangle } from 'lucide-react';
import { Servicio } from '@/lib/serviciosProgramados';
import { Actividad } from '@/lib/actividades';
import { hoyLocal, sumarDias, fechaLocal } from '@/lib/fechaHoy';
import { fechaLargaCalendario } from '@/lib/calendarioMes';
import { tipoActividad, COLOR_SERVICIO } from '@/lib/tiposActividad';
import {
  BloqueDia, ordenar, huecosDelDia, ventanaDelDia, minutosPorClase, minutosDe, finDe, duracionTexto,
} from '@/lib/lineaDelDia';
import IconoTipo from './IconoTipo';

// «Mi día»: la jornada en una barra de tiempo. Junta los servicios
// programados (de la llegada al cierre) y las actividades de bitácora, y
// deja ver los tramos sin registrar entre ellos. Abajo va lo mismo en lista,
// en orden, con su duración.
//
// `hrefServicio` y `hrefActividad` cambian según quién mira (el técnico va a
// sus pantallas; quien supervisa, a las suyas).

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });

// Tarjetas del resumen, que también sirven para resaltar ese tipo de tramo.
type Filtro = 'servicios' | 'bitacora' | 'huecos';

function entraEnFiltro(filtro: Filtro | null, b: BloqueDia): boolean {
  if (!filtro) return true;
  if (filtro === 'huecos') return false;
  return filtro === 'servicios' ? b.clase === 'servicio' : b.clase !== 'servicio';
}

function colorDe(b: BloqueDia): string {
  return b.clase === 'servicio' ? COLOR_SERVICIO : tipoActividad(b.clase).color;
}

export default function LineaDelDia({
  servicios, actividades, hrefServicio, hrefActividad, titulo,
}: {
  servicios: Servicio[];
  actividades: Actividad[];
  hrefServicio: (id: string) => string;
  hrefActividad: (id: string) => string;
  titulo?: string;
}) {
  const [hoy, setHoy] = useState<string | null>(null);
  const [fecha, setFecha] = useState<string | null>(null);
  const [ahora, setAhora] = useState(0);
  // Lo que se tocó en la barra (un registro o un hueco): se resalta y se
  // explica debajo. `filtro` es la tarjeta de resumen elegida.
  const [elegido, setElegido] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro | null>(null);
  const [verAyuda, setVerAyuda] = useState(false);

  useEffect(() => {
    const h = hoyLocal();
    setHoy(h);
    setFecha(h);
    setAhora(Date.now());
    const id = setInterval(() => setAhora(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const { bloques, sinHora } = useMemo(() => {
    if (!fecha) return { bloques: [] as BloqueDia[], sinHora: [] as Servicio[] };
    const lista: BloqueDia[] = [];
    const pendientes: Servicio[] = [];
    servicios.filter((s) => s.fecha === fecha && s.estado !== 'cancelado').forEach((s) => {
      const ini = s.hora_llegada || s.hora_inicio;
      if (!ini) { pendientes.push(s); return; }
      lista.push({
        clave: `s-${s.id}`, clase: 'servicio', titulo: s.proyecto,
        detalle: s.estado === 'concluido' ? 'Servicio concluido' : s.estado === 'en_curso' ? 'Servicio en curso' : 'En sitio',
        inicio: new Date(ini).getTime(), fin: s.hora_fin ? new Date(s.hora_fin).getTime() : null,
        href: hrefServicio(s.id),
      });
    });
    actividades.filter((a) => hoyLocal(new Date(a.hora_inicio)) === fecha).forEach((a) => {
      const tipo = tipoActividad(a.tipo);
      lista.push({
        clave: `a-${a.id}`, clase: tipo.clave, titulo: a.titulo,
        detalle: [tipo.nombre, a.proyecto && a.proyecto !== a.titulo ? a.proyecto : ''].filter(Boolean).join(' · '),
        inicio: new Date(a.hora_inicio).getTime(), fin: a.hora_fin ? new Date(a.hora_fin).getTime() : null,
        href: hrefActividad(a.id), dudoso: !!a.cierre_automatico,
      });
    });
    return { bloques: ordenar(lista), sinHora: pendientes };
  }, [servicios, actividades, fecha, hrefServicio, hrefActividad]);

  if (!hoy || !fecha) return <div className="rounded-3xl bg-surface border border-line h-[260px] animate-pulse" aria-busy="true" />;

  function irA(otraFecha: string) {
    setFecha(otraFecha);
    setElegido(null);
    setFiltro(null);
  }

  const inicioDelDia = fechaLocal(fecha).getTime();
  // En un día que ya pasó, lo que quedó «en curso» se corta al final del día.
  const tope = fecha === hoy ? ahora : inicioDelDia + 24 * 3600000;
  const huecos = huecosDelDia(bloques, tope);
  const { desde, hasta } = ventanaDelDia(bloques, inicioDelDia, tope);
  const total = (hasta - desde) * 3600000;
  const pct = (ms: number) => Math.max(0, Math.min(100, ((ms - inicioDelDia - desde * 3600000) / total) * 100));
  const porClase = minutosPorClase(bloques, tope);
  const enServicios = porClase.servicio || 0;
  const enBitacora = Object.entries(porClase).filter(([k]) => k !== 'servicio').reduce((n, [, v]) => n + (v || 0), 0);
  const sinRegistrar = huecos.reduce((n, h) => n + h.minutos, 0);
  const horas = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
  const filas = [...bloques.map((b) => ({ t: b.inicio, b, h: null as null | typeof huecos[number] })), ...huecos.map((h) => ({ t: h.inicio, b: null as null | BloqueDia, h }))].sort((x, y) => x.t - y.t);

  return (
    <div className="rounded-3xl bg-surface border border-line p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="min-w-0 flex-1">
          {titulo && <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">{titulo}</p>}
          <p className="font-display font-bold text-[19px] tracking-wide leading-tight first-letter:uppercase">
            {fecha === hoy ? 'Hoy · ' : ''}{fechaLargaCalendario(fecha)}
          </p>
        </div>
        {fecha !== hoy && (
          <button type="button" onClick={() => irA(hoy)} className="shrink-0 h-10 px-3.5 rounded-full border border-teal/45 bg-teal/10 text-teal text-[13px] font-semibold active:scale-95 transition-transform">Hoy</button>
        )}
        <button type="button" onClick={() => irA(sumarDias(fecha, -1))} aria-label="Día anterior" className="shrink-0 w-10 h-10 rounded-full border border-line bg-surface-2 flex items-center justify-center active:scale-90 transition">
          <ChevronLeft size={19} strokeWidth={2.4} />
        </button>
        <button type="button" onClick={() => irA(sumarDias(fecha, 1))} disabled={fecha >= hoy} aria-label="Día siguiente" className="shrink-0 w-10 h-10 rounded-full border border-line bg-surface-2 flex items-center justify-center active:scale-90 transition disabled:opacity-35">
          <ChevronRight size={19} strokeWidth={2.4} />
        </button>
      </div>

      {/* Resumen del día: tocar una tarjeta resalta esos tramos en la barra
          y deja solo esos renglones en la lista. */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {([
          ['servicios', 'En servicios', enServicios, 'text-teal'],
          ['bitacora', 'En bitácora', enBitacora, 'text-ink'],
          ['huecos', 'Sin registrar', sinRegistrar, sinRegistrar > 0 ? 'text-amber' : 'text-muted'],
        ] as const).map(([clave, rotulo, min, color]) => (
          <button
            key={clave}
            type="button"
            onClick={() => { setFiltro(filtro === clave ? null : clave); setElegido(null); }}
            aria-pressed={filtro === clave}
            className={`text-left rounded-xl px-3 py-2 border transition-all active:scale-[0.97] ${filtro === clave ? 'bg-surface-2 border-teal/55' : 'bg-surface-2/70 border-transparent'}`}
          >
            <span className="block text-[11px] uppercase tracking-wider text-muted">{rotulo}</span>
            <span className={`block font-display font-bold text-[16px] tabular-nums leading-tight mt-0.5 ${color}`}>{duracionTexto(min)}</span>
          </button>
        ))}
      </div>

      {/* Barra del día: cada tramo se puede tocar para ver qué fue. */}
      <div className="mb-1" aria-label={`Línea de tiempo de ${desde}:00 a ${hasta}:00 con ${bloques.length} registro${bloques.length === 1 ? '' : 's'}`}>
        <div className="relative h-14 rounded-xl bg-surface-2 border border-line">
          {horas.slice(1, -1).map((hr) => (
            <span key={hr} className="absolute top-0 bottom-0 w-px bg-line" style={{ left: `${((hr - desde) / (hasta - desde)) * 100}%` }} />
          ))}
          {huecos.map((h) => {
            const clave = `h-${h.inicio}`;
            return (
              <button
                key={clave}
                type="button"
                onClick={() => setElegido(elegido === clave ? null : clave)}
                aria-label={`Sin registrar de ${hhmm(h.inicio)} a ${hhmm(h.fin)}`}
                aria-pressed={elegido === clave}
                className={`absolute rounded-md border border-dashed border-amber/60 bg-amber/10 transition-all duration-200 ${elegido === clave ? 'top-1 bottom-1 ring-2 ring-amber' : 'top-2.5 bottom-2.5'} ${filtro && filtro !== 'huecos' ? 'opacity-25' : ''}`}
                style={{ left: `${pct(h.inicio)}%`, width: `${Math.max(2.5, pct(h.fin) - pct(h.inicio))}%` }}
              />
            );
          })}
          {bloques.map((b) => (
            <button
              key={b.clave}
              type="button"
              onClick={() => setElegido(elegido === b.clave ? null : b.clave)}
              aria-label={`${b.titulo}, de ${hhmm(b.inicio)} a ${b.fin ? hhmm(b.fin) : 'ahora'}`}
              aria-pressed={elegido === b.clave}
              className={`absolute rounded-md transition-all duration-200 ${elegido === b.clave ? 'top-0.5 bottom-0.5 ring-2 ring-ink/80 z-10' : 'top-2 bottom-2 hover:top-1 hover:bottom-1'} ${b.fin === null ? 'animate-pulse' : ''} ${b.dudoso ? 'opacity-45' : ''} ${!entraEnFiltro(filtro, b) ? 'opacity-20' : ''}`}
              style={{ left: `${pct(b.inicio)}%`, width: `${Math.max(2.5, pct(finDe(b, tope)) - pct(b.inicio))}%`, backgroundColor: colorDe(b) }}
            />
          ))}
          {fecha === hoy && pct(ahora) > 0 && pct(ahora) < 100 && (
            <span className="absolute -top-1 -bottom-1 w-0.5 bg-red pointer-events-none" style={{ left: `${pct(ahora)}%` }} aria-hidden="true">
              <span className={`absolute -top-4 text-[10px] font-bold text-red tabular-nums whitespace-nowrap ${pct(ahora) > 80 ? 'right-0' : pct(ahora) < 20 ? 'left-0' : '-translate-x-1/2'}`}>Ahora {hhmm(ahora)}</span>
            </span>
          )}
        </div>
        <div className="relative h-5 mt-1">
          {horas.map((hr, i) => (
            <span
              key={hr}
              className={`absolute -translate-x-1/2 text-[10.5px] text-faint tabular-nums ${i % 2 ? 'hidden sm:block' : ''} ${i === 0 ? '!translate-x-0' : ''} ${i === horas.length - 1 ? '!-translate-x-full' : ''}`}
              style={{ left: `${(i / (horas.length - 1)) * 100}%` }}
            >
              {hr}:00
            </span>
          ))}
        </div>
      </div>

      {/* Lo que se tocó en la barra, explicado. */}
      {(() => {
        const b = bloques.find((x) => x.clave === elegido);
        const h = huecos.find((x) => `h-${x.inicio}` === elegido);
        if (b) return (
          <div className="flex items-center gap-3 rounded-xl border border-teal/40 bg-surface-2 px-3.5 py-2.5 mb-1">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white" style={{ backgroundColor: colorDe(b) }}>
              <IconoTipo tipo={b.clase} size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold truncate">{b.titulo}</span>
              <span className="block text-[12.5px] text-muted tabular-nums">{hhmm(b.inicio)}–{b.fin ? hhmm(b.fin) : 'ahora'} · {duracionTexto(minutosDe(b, tope))}{b.fin === null ? ' · en curso' : ''}</span>
            </span>
            <Link href={b.href} className="shrink-0 min-h-[38px] px-3.5 rounded-full bg-teal text-inkOnAccent text-[13px] font-semibold flex items-center active:scale-95 transition-transform">Abrir</Link>
          </div>
        );
        if (h) return (
          <div className="rounded-xl border border-dashed border-amber/50 bg-amber/5 px-3.5 py-2.5 mb-1">
            <p className="text-[14px] font-semibold text-amber tabular-nums">Sin registrar · {hhmm(h.inicio)}–{hhmm(h.fin)} · {duracionTexto(h.minutos)}</p>
            <p className="text-[12.5px] text-ink/75 leading-snug mt-0.5">En este tramo no hay servicio ni actividad. Si fue un traslado, una compra u otra cosa, regístralo en la bitácora.</p>
          </div>
        );
        return (
          <button type="button" onClick={() => setVerAyuda(!verAyuda)} aria-expanded={verAyuda} className="text-[12.5px] font-semibold text-teal min-h-[32px]">
            {verAyuda ? 'Ocultar explicación' : '¿Cómo se lee esta barra?'}
          </button>
        );
      })()}
      {verAyuda && !elegido && (
        <ul className="rounded-xl bg-surface-2/70 border border-line px-3.5 py-3 mb-1 flex flex-col gap-1.5 text-[12.5px] text-ink/80 leading-snug">
          <li>La barra es tu día de izquierda a derecha, con las horas abajo.</li>
          <li><span className="inline-block w-3 h-3 rounded-sm align-[-1px] mr-1.5" style={{ backgroundColor: COLOR_SERVICIO }} />Verde: tiempo en un servicio, de la llegada al cierre.</li>
          <li><span className="inline-block w-3 h-3 rounded-sm align-[-1px] mr-1.5 bg-[#7C8CF8]" />Otros colores: actividades de bitácora (traslado, compra, oficina…).</li>
          <li><span className="inline-block w-3 h-3 rounded-sm align-[-1px] mr-1.5 border border-dashed border-amber bg-amber/10" />Punteado: 30 minutos o más sin nada registrado entre dos registros.</li>
          <li><span className="inline-block w-0.5 h-3 align-[-1px] mr-2 ml-1 bg-red" />Línea roja: la hora actual.</li>
          <li>Toca un tramo para ver qué fue, o una tarjeta de arriba para resaltar solo ese tipo.</li>
        </ul>
      )}

      {/* Lo mismo, en orden */}
      {filas.length === 0 && sinHora.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong px-4 py-7 text-center mt-3">
          <p className="text-[14px] font-medium">Nada registrado este día</p>
          <p className="text-[12.5px] text-muted mt-1">{fecha === hoy ? 'Inicia una actividad arriba para que tu día quede registrado.' : 'No hubo servicios ni actividades.'}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mt-3">
          {filas.filter(({ b }) => (b ? entraEnFiltro(filtro, b) : !filtro || filtro === 'huecos')).map(({ b, h }) => b ? (
            <Link key={b.clave} href={b.href} className={`group flex items-center gap-3 rounded-xl border bg-surface px-3.5 py-2.5 transition-all hover:border-teal/45 active:scale-[0.99] ${elegido === b.clave ? 'border-teal/60' : 'border-line'}`}>
              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white" style={{ backgroundColor: colorDe(b) }}>
                <IconoTipo tipo={b.clase} size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold truncate transition-colors group-hover:text-teal">{b.titulo}</span>
                <span className="block text-[12.5px] text-muted truncate">{b.detalle}</span>
              </span>
              <span className="text-right shrink-0">
                <span className="block text-[13px] font-semibold tabular-nums">{hhmm(b.inicio)}–{b.fin ? hhmm(b.fin) : '…'}</span>
                <span className={`block text-[12px] tabular-nums ${b.dudoso ? 'text-amber' : 'text-muted'}`}>
                  {b.dudoso ? 'Confirma la hora' : b.fin === null ? `${duracionTexto(minutosDe(b, tope))} · en curso` : duracionTexto(minutosDe(b, tope))}
                </span>
              </span>
            </Link>
          ) : (
            <div key={`h-${h!.inicio}`} className="flex items-center gap-3 rounded-xl border border-dashed border-amber/50 bg-amber/5 px-3.5 py-2">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-amber"><CircleDashed size={18} strokeWidth={2.2} /></span>
              <span className="min-w-0 flex-1 text-[13px] text-ink/85">Sin registrar</span>
              <span className="text-right shrink-0">
                <span className="block text-[13px] font-semibold tabular-nums text-amber">{hhmm(h!.inicio)}–{hhmm(h!.fin)}</span>
                <span className="block text-[12px] text-muted tabular-nums">{duracionTexto(h!.minutos)}</span>
              </span>
            </div>
          ))}
          {(!filtro || filtro === 'servicios') && sinHora.map((s) => (
            <Link key={s.id} href={hrefServicio(s.id)} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5">
              <span className="w-9 h-9 rounded-xl border border-line flex items-center justify-center shrink-0 text-muted"><IconoTipo tipo="servicio" size={17} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold truncate">{s.proyecto}</span>
                <span className="block text-[12.5px] text-muted">{fecha < hoy ? 'Programado y sin iniciar' : 'Programado, por iniciar'}</span>
              </span>
              {fecha < hoy && <AlertTriangle size={16} className="text-amber shrink-0" />}
              {(s as any).hora_programada && <span className="text-[13px] font-semibold tabular-nums shrink-0">{String((s as any).hora_programada).slice(0, 5)}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
