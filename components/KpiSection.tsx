'use client';

import { useEffect, useMemo, useState } from 'react';
import { ReportDetail } from './ReportDetailModal';
import BotonInfo from '@/components/BotonInfo';
import { hoyLocal } from '@/lib/fechaHoy';
import { MARCA } from '@/lib/marca';

// «Ing. Everardo Sánchez» → «Ing. Sánchez»: quien firma la revisión, en corto.
const REVISOR_PARTES = MARCA.revisor.trim().split(/\s+/);
const REVISOR_CORTO = REVISOR_PARTES.length > 2
  ? `${REVISOR_PARTES[0]} ${REVISOR_PARTES[REVISOR_PARTES.length - 1]}`
  : MARCA.revisor;

type Report = ReportDetail;

function parseTimeToMinutes(t?: string | null): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

function reportDurationMinutes(r: Report): number | null {
  const a = parseTimeToMinutes(r.data?.horaLlegada);
  const b = parseTimeToMinutes(r.data?.horaSalida);
  if (a === null || b === null) return null;
  let diff = b - a;
  if (diff < 0) diff += 24 * 60; // por si el servicio cruza la medianoche
  if (diff <= 0 || diff > 14 * 60) return null; // descarta capturas con error evidente (> 14h)
  return diff;
}

function formatDuracion(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function isCompletado(r: Report): boolean {
  // "Completado" ahora significa que el Ing. Everardo Sánchez ya revisó y firmó el reporte.
  return Boolean(r.data?.firmaRevisionData);
}
function tieneObservaciones(r: Report): boolean {
  return Boolean(r.data?.observaciones?.trim()) || (r.data?.casoPuntos || []).length > 0;
}

function DonutChart({ percent, size = 108, stroke = 12, color }: { percent: number; size?: number; stroke?: number; color: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, percent)) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-line-strong" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ stroke: color, transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-display font-bold text-xl">{Math.round(percent)}%</span>
      </div>
    </div>
  );
}

export default function KpiSection({ reports }: { reports: Report[] }) {
  const [periodo, setPeriodo] = useState<'dia' | 'semana'>('semana');
  // "Hoy"/"esta semana" dependen de la hora del navegador, que puede no
  // coincidir con la del servidor (Vercel corre en UTC) — ver el comentario
  // en components/SelectorSemana.tsx. Mismo patrón: arranca en null (mismo
  // valor en servidor y primer render del cliente) y se corrige ya montado.
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => setAhora(Date.now()), []);

  const kpiReports = useMemo(() => {
    if (ahora === null) return [];
    const today = hoyLocal(new Date(ahora));
    const weekAgo = new Date(ahora - 7 * 864e5);
    if (periodo === 'dia') return reports.filter((r) => r.fecha === today);
    return reports.filter((r) => new Date(r.created_at) >= weekAgo);
  }, [reports, periodo, ahora]);

  const { avgLabel, avgSampleSize } = useMemo(() => {
    const durations = kpiReports.map(reportDurationMinutes).filter((d): d is number => d !== null);
    if (durations.length === 0) return { avgLabel: '—', avgSampleSize: 0 };
    const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
    return { avgLabel: formatDuracion(avg), avgSampleSize: durations.length };
  }, [kpiReports]);

  const { completados, pendientes, pctCompletados } = useMemo(() => {
    const total = kpiReports.length;
    const completados = kpiReports.filter(isCompletado).length;
    const pendientes = total - completados;
    return { completados, pendientes, pctCompletados: total > 0 ? (completados / total) * 100 : 0 };
  }, [kpiReports]);

  const { conformes, conObservaciones, sinFirma } = useMemo(() => {
    let conformes = 0;
    let conObservaciones = 0;
    let sinFirma = 0;
    kpiReports.forEach((r) => {
      if (!r.data?.firmaClienteData) {
        sinFirma++;
      } else if (tieneObservaciones(r)) {
        conObservaciones++;
      } else {
        conformes++;
      }
    });
    return { conformes, conObservaciones, sinFirma };
  }, [kpiReports]);

  const totalConformidad = conformes + conObservaciones + sinFirma;

  // Últimos 7 días: cuántos reportes hubo cada día y cuánto duró en promedio
  // el servicio. Siempre es la semana, sin importar el periodo elegido.
  const dias = useMemo(() => {
    if (ahora === null) return [];
    return Array.from({ length: 7 }, (_, i) => {
      const fecha = hoyLocal(new Date(ahora - (6 - i) * 864e5));
      const delDia = reports.filter((r) => r.fecha === fecha);
      const dur = delDia.map(reportDurationMinutes).filter((d): d is number => d !== null);
      const [y, m, d] = fecha.split('-').map(Number);
      return {
        fecha,
        n: delDia.length,
        duracion: dur.length ? dur.reduce((a, b) => a + b, 0) / dur.length : null,
        letra: ['D', 'L', 'M', 'M', 'J', 'V', 'S'][new Date(y, m - 1, d).getDay()],
        dia: d,
        nombre: new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' }),
        esHoy: i === 6,
      };
    });
  }, [reports, ahora]);
  const maxDia = Math.max(1, ...dias.map((d) => d.n));
  const totalSemana = dias.reduce((a, d) => a + d.n, 0);

  // Qué sistemas se atendieron en el periodo (un reporte puede llevar varios).
  const sistemas = useMemo(() => {
    const cuenta = new Map<string, number>();
    kpiReports.forEach((r) => {
      const lista: string[] = Array.isArray(r.data?.sistemaSeguridad) ? r.data.sistemaSeguridad : [];
      lista.forEach((sis) => {
        const nombre = sis === 'Otra' ? (r.data?.seguridadOtraTexto?.trim() || 'Otro') : sis === 'Alarma&Det' ? 'Alarma y detección' : sis;
        cuenta.set(nombre, (cuenta.get(nombre) || 0) + 1);
      });
    });
    return Array.from(cuenta.entries()).map(([nombre, n]) => ({ nombre, n })).sort((a, b) => b.n - a.n).slice(0, 6);
  }, [kpiReports]);
  const maxSistema = Math.max(1, ...sistemas.map((x) => x.n));
  const [diaSobre, setDiaSobre] = useState<number | null>(null);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-semibold text-[15px] tracking-wide">KPIs operativos</h2>
        <div className="flex items-center gap-1 bg-surface-2 rounded-full p-1 border border-line">
          {(['dia', 'semana'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${
                periodo === p ? 'bg-teal text-inkOnAccent' : 'text-muted'
              }`}
            >
              {p === 'dia' ? 'Hoy' : 'Esta semana'}
            </button>
          ))}
        </div>
      </div>

      {/* Fila 1: el ritmo de la semana y en qué se trabajó */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3 mb-3">
        {/* Reportes por día: columnas */}
        <div className="glass rounded-2xl p-4 lg:p-5 flex flex-col">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Reportes por día · últimos 7 días</div>
              <p className="leading-none">
                <span className="font-display text-[30px] font-bold">{totalSemana}</span>
                <span className="text-[12.5px] text-muted"> reporte{totalSemana === 1 ? '' : 's'} en la semana</span>
              </p>
            </div>
            <BotonInfo titulo="Reportes por día">
              Cuántos reportes de servicio se entregaron cada día de la última semana, por la fecha
              del servicio. La columna de hoy va resaltada.
            </BotonInfo>
          </div>
          <div className="relative flex-1 flex flex-col">
            <div className="flex-1 flex items-end gap-2 sm:gap-3 min-h-[150px] border-b border-line-strong" role="img"
              aria-label={`Reportes por día: ${dias.map((d) => `${d.nombre}, ${d.n}`).join('; ')}`}>
              {dias.map((d, i) => (
                <div key={d.fecha} className="relative flex-1 h-full flex flex-col justify-end items-center"
                  onMouseEnter={() => setDiaSobre(i)} onMouseLeave={() => setDiaSobre(null)}
                  onFocus={() => setDiaSobre(i)} onBlur={() => setDiaSobre(null)} tabIndex={0}>
                  <span className={`text-[12px] font-semibold tabular-nums mb-1 ${d.n === 0 ? 'text-faint' : ''}`}>{d.n}</span>
                  <div
                    className={`w-full max-w-[56px] rounded-t-[5px] transition-all duration-500 ${d.esHoy ? 'bg-teal' : 'bg-teal/45'} ${diaSobre === i ? 'brightness-110' : ''}`}
                    style={{ height: `${d.n === 0 ? 2 : Math.max(6, (d.n / maxDia) * 100 * 0.82)}%` }}
                  />
                  {diaSobre === i && (
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-10 px-2.5 py-1.5 rounded-lg bg-ink text-bg text-[11.5px] leading-snug whitespace-nowrap shadow-diffuse pointer-events-none">
                      <span className="capitalize">{d.nombre}</span>
                      <br />
                      <b>{d.n}</b> reporte{d.n === 1 ? '' : 's'}{d.duracion !== null ? ` · ${formatDuracion(d.duracion)} en promedio` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2 sm:gap-3 mt-1.5">
              {dias.map((d) => (
                <div key={d.fecha} className={`flex-1 text-center text-[11px] leading-tight ${d.esHoy ? 'text-teal font-semibold' : 'text-muted'}`}>
                  {d.letra} {d.dia}
                  {d.esHoy && <span className="block text-[10px]">hoy</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sistemas atendidos: barras horizontales, de más a menos */}
        <div className="glass rounded-2xl p-4 lg:p-5">
          <div className="flex items-center gap-1.5 mb-4">
            <div className="text-[10px] uppercase tracking-wider text-muted">Sistemas atendidos · {periodo === 'dia' ? 'hoy' : 'esta semana'}</div>
            <BotonInfo titulo="Sistemas atendidos">
              En qué tipo de sistema se trabajó, según lo que marca cada reporte. Un reporte puede
              contar en más de un sistema.
            </BotonInfo>
          </div>
          {sistemas.length === 0 ? (
            <p className="text-[13px] text-muted">Sin reportes en el periodo.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {sistemas.map((x) => (
                <div key={x.nombre} title={`${x.nombre}: ${x.n} reporte${x.n === 1 ? '' : 's'}`}>
                  <div className="flex justify-between items-baseline gap-2 mb-1">
                    <span className="text-[12.5px] text-ink/85 truncate">{x.nombre}</span>
                    <span className="text-[12.5px] font-semibold tabular-nums shrink-0">{x.n}</span>
                  </div>
                  <div className="h-2.5 rounded-r-[4px] bg-surface-2 overflow-hidden">
                    <div className="h-full rounded-r-[4px] bg-teal transition-all duration-500" style={{ width: `${(x.n / maxSistema) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fila 2: tiempo, cierre y conformidad */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Tiempo promedio de atención: cifra + tendencia */}
        <div className="glass rounded-2xl p-4 lg:p-5 flex flex-col">
          <div className="flex items-center gap-1.5 mb-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="text-[10px] uppercase tracking-wider text-muted">Tiempo promedio de atención</div>
            <BotonInfo titulo="Tiempo promedio de atención">
              Cuánto dura un servicio en sitio, de la hora de llegada a la de salida que se
              capturan en el reporte. Solo entran los reportes con ambas horas, y se descartan
              los de más de 14 horas: eso no es un servicio largo, es alguien que olvidó cerrar.
              La línea muestra el promedio de cada día de la última semana.
            </BotonInfo>
          </div>
          <div className="font-display text-[30px] font-bold leading-none mb-1.5">{avgLabel}</div>
          <p className="text-[11px] text-muted mb-3">
            {avgSampleSize > 0
              ? `Desde llegada hasta salida · ${avgSampleSize} reporte${avgSampleSize > 1 ? 's' : ''} con hora registrada`
              : 'Sin reportes con hora de llegada y salida capturadas'}
          </p>
          <Tendencia puntos={dias.map((d) => d.duracion)} etiquetas={dias.map((d) => `${d.letra} ${d.dia}`)} />
        </div>

        {/* Completados vs pendientes */}
        <div className="glass rounded-2xl p-4 lg:p-5">
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            <div className="text-[10px] uppercase tracking-wider text-muted">Servicios completados vs. pendientes</div>
            <BotonInfo titulo="Servicios completados vs. pendientes">
              Un reporte cuenta como completado cuando lleva la firma de revisión final. Los
              pendientes son los que ya se entregaron pero todavía esperan esa revisión. No
              mide trabajo hecho en campo, sino trabajo cerrado en papel.
            </BotonInfo>
          </div>
          <div className="flex items-center gap-4">
            <DonutChart percent={pctCompletados} color="rgb(var(--c-acento))" />
            <div className="flex flex-col gap-1.5 text-[12px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-teal shrink-0" />
                <span className="font-semibold">{completados}</span>
                <span className="text-muted">completados (firmados por {REVISOR_CORTO})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-line-strong shrink-0" />
                <span className="font-semibold">{pendientes}</span>
                <span className="text-muted">pendientes</span>
              </div>
            </div>
          </div>
        </div>

        {/* Conformidad del cliente */}
        <div className="glass rounded-2xl p-4 lg:p-5">
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            <div className="text-[10px] uppercase tracking-wider text-muted">Conformidad del cliente</div>
            <BotonInfo titulo="Conformidad del cliente">
              Cómo quedó el cliente al cerrar el servicio. «Con firma» es conforme sin
              objeciones; «con observaciones» es que firmó pero dejó algo anotado, y ahí
              conviene leer el reporte; «pendiente de firma» es que nadie firmó, y esos no
              se pueden facturar.
            </BotonInfo>
          </div>
          {totalConformidad === 0 ? (
            <p className="text-[13px] text-muted">Sin reportes en el periodo.</p>
          ) : (
            <>
              {/* Una sola barra: las tres partes de un todo, separadas por 2 px. */}
              <div className="flex h-5 gap-[2px] rounded-[5px] overflow-hidden mb-3.5" role="img"
                aria-label={`Conformidad: ${conformes} con firma, ${conObservaciones} con observaciones, ${sinFirma} pendientes de firma`}>
                {([[conformes, 'bg-teal', 'Con firma de conformidad'], [conObservaciones, 'bg-amber', 'Con observaciones'], [sinFirma, 'bg-red', 'Pendientes de firma']] as const)
                  .filter(([n]) => n > 0)
                  .map(([n, color, etiqueta]) => (
                    <div key={etiqueta} className={`${color} h-full transition-all duration-500`} style={{ width: `${(n / totalConformidad) * 100}%` }} title={`${etiqueta}: ${n}`} />
                  ))}
              </div>
              <div className="flex flex-col gap-2">
                <ConformidadRow label="Con firma de conformidad" value={conformes} total={totalConformidad} color="bg-teal" />
                <ConformidadRow label="Con observaciones" value={conObservaciones} total={totalConformidad} color="bg-amber" />
                <ConformidadRow label="Pendientes de firma" value={sinFirma} total={totalConformidad} color="bg-red" />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Renglón de la leyenda: color, etiqueta, cuántos y qué parte del total.
function ConformidadRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-[12.5px]">
      <span className={`w-2.5 h-2.5 rounded-[3px] shrink-0 ${color}`} />
      <span className="text-ink/85 flex-1 min-w-0 truncate">{label}</span>
      <span className="font-semibold tabular-nums shrink-0">{value}</span>
      <span className="text-muted tabular-nums shrink-0 w-9 text-right">{pct}%</span>
    </div>
  );
}

// Línea de tendencia (promedio por día). Los días sin dato se saltan; con
// menos de dos puntos no hay tendencia que mostrar.
function Tendencia({ puntos, etiquetas }: { puntos: (number | null)[]; etiquetas: string[] }) {
  const validos = puntos.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (validos.length < 2) return null;
  const W = 320, H = 64, M = 6;
  const min = Math.min(...validos.map((p) => p.v));
  const max = Math.max(...validos.map((p) => p.v));
  const x = (i: number) => M + (i / (puntos.length - 1)) * (W - 2 * M);
  const y = (v: number) => (max === min ? H / 2 : H - M - ((v - min) / (max - min)) * (H - 2 * M));
  const linea = validos.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const ultimo = validos[validos.length - 1];
  return (
    <div className="mt-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible" role="img"
        aria-label={`Tendencia del tiempo promedio: ${validos.map((p) => `${etiquetas[p.i]} ${formatDuracion(p.v)}`).join(', ')}`}>
        <path d={`${linea} L${x(ultimo.i).toFixed(1)} ${H} L${x(validos[0].i).toFixed(1)} ${H} Z`} className="fill-amber/10" />
        <path d={linea} fill="none" className="stroke-amber" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {validos.map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={p.i === ultimo.i ? 4 : 2.8} className="fill-amber stroke-surface" strokeWidth={1.5}>
            <title>{`${etiquetas[p.i]}: ${formatDuracion(p.v)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-[10.5px] text-muted mt-0.5">
        <span>{etiquetas[validos[0].i]}</span>
        <span>{etiquetas[ultimo.i]}</span>
      </div>
    </div>
  );
}
