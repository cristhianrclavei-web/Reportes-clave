'use client';

import { useMemo, useState } from 'react';
import { ReportDetail } from './ReportDetailModal';

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
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
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

  const kpiReports = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 864e5);
    if (periodo === 'dia') return reports.filter((r) => r.fecha === today);
    return reports.filter((r) => new Date(r.created_at) >= weekAgo);
  }, [reports, periodo]);

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Tiempo promedio de atención */}
        <div className="glass rounded-2xl p-4 lg:p-5 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 mb-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="text-[10px] uppercase tracking-wider text-muted">Tiempo promedio de atención</div>
          </div>
          <div className="font-display text-[30px] font-bold leading-none mb-1.5">{avgLabel}</div>
          <p className="text-[11px] text-muted">
            {avgSampleSize > 0
              ? `Desde llegada hasta salida · ${avgSampleSize} reporte${avgSampleSize > 1 ? 's' : ''} con hora registrada`
              : 'Sin reportes con hora de llegada y salida capturadas'}
          </p>
        </div>

        {/* Completados vs pendientes */}
        <div className="glass rounded-2xl p-4 lg:p-5">
          <div className="text-[10px] uppercase tracking-wider text-muted mb-3">Servicios completados vs. pendientes</div>
          <div className="flex items-center gap-4">
            <DonutChart percent={pctCompletados} color="#22B08A" />
            <div className="flex flex-col gap-1.5 text-[12px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-teal shrink-0" />
                <span className="font-semibold">{completados}</span>
                <span className="text-muted">completados (firmados por Ing. Sánchez)</span>
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
          <div className="text-[10px] uppercase tracking-wider text-muted mb-3">Conformidad del cliente</div>
          <div className="flex flex-col gap-3">
            <ConformidadRow label="Con firma de conformidad" value={conformes} total={totalConformidad} color="bg-teal" />
            <ConformidadRow label="Con observaciones" value={conObservaciones} total={totalConformidad} color="bg-amber" />
            <ConformidadRow label="Pendientes de firma" value={sinFirma} total={totalConformidad} color="bg-red" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ConformidadRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[12px] text-ink/85">{label}</span>
        <span className="text-[12px] font-semibold shrink-0 ml-2">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
