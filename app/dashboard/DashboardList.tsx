'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabaseClient';
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/lib/useTheme';
import ReportDetailModal, { ReportDetail, techName } from '@/components/ReportDetailModal';
import KpiSection from '@/components/KpiSection';
import BitacoraSupervisorSection from '@/components/BitacoraSupervisorSection';
import { facturaChip } from '@/lib/reportStatus';

type Report = ReportDetail;

function formatFecha(fecha: string): string {
  if (!fecha) return '—';
  const [y, m, d] = fecha.split('-');
  if (!y || !m || !d) return fecha;
  return `${d}/${m}/${y}`;
}

function primerNombre(nombre: string): string {
  return (nombre || '').trim().split(/\s+/)[0] || '';
}

function iniciales(nombre: string): string {
  return (nombre || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

export default function DashboardList({ reports, userName }: { reports: Report[]; userName?: string }) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [open, setOpen] = useState<Report | null>(null);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (filterType && r.tipo_servicio !== filterType) return false;
      if (search) {
        const hay = `${r.empresa_cliente} ${techName(r.profiles)} ${r.data?.claveFormato || ''} ${r.data?.contactoUsuario || ''}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [reports, search, filterType]);

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 864e5);
  const totalToday = reports.filter((r) => r.fecha === today).length;
  const totalWeek = reports.filter((r) => new Date(r.created_at) >= weekAgo).length;
  const tecnicosActivos = new Set(reports.map((r) => techName(r.profiles))).size;
  const porFacturar = reports.filter((r) => r.data?.servicioConcluido && r.data?.facturaEstado !== 'facturado').length;

  return (
    <div className="max-w-3xl lg:max-w-6xl mx-auto pb-28 lg:pb-16 px-0 lg:px-4">
      {/* Header */}
      <div className="sticky top-0 z-20 glass-strong px-5 lg:px-6 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img src={theme === 'light' ? '/brand/logo-rect-light.png' : '/brand/logo-rect.png'} alt="Clave Inteligente" className="h-12 w-auto shrink-0" />
          <div className="min-w-0 hidden sm:block">
            <h1 className="font-display font-semibold text-base tracking-wide leading-tight truncate">Dashboard</h1>
            <p className="text-[11px] text-muted truncate">Supervisor</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="hidden lg:flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-teal text-inkOnAccent flex items-center justify-center text-[11px] font-display font-bold shrink-0">
              {iniciales(userName || '') || '?'}
            </div>
            <span className="text-[13px] font-medium truncate max-w-[140px]">{userName || 'Supervisor'}</span>
          </div>
          <ThemeToggle />
          <button
            onClick={handleLogout}
            className="text-xs border border-line-strong text-ink/80 rounded-full px-3 py-1.5 active:scale-95 transition-transform"
          >
            Salir
          </button>
        </div>
      </div>

      <div className="px-4 lg:px-0 pt-5">
        <h1 className="font-display font-bold text-2xl lg:text-3xl tracking-wide mb-4">
          Panel de reportes{userName ? `, ${primerNombre(userName)}` : ''}
        </h1>

        <Link
          href="/dashboard/servicios"
          className="block w-full text-center py-3 mb-5 rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[14px] tracking-wide active:scale-[0.98] transition-transform"
        >
          🗂️ Programar y ver servicios asignados
        </Link>

        <KpiSection reports={reports} />
        <BitacoraSupervisorSection />

        {/* Bento stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
          <Stat label="Total" value={reports.length} accent="teal" />
          <Stat label="Esta semana" value={totalWeek} accent="amber" />
          <Stat label="Hoy" value={totalToday} accent="red" />
          <Stat label="Técnicos activos" value={tecnicosActivos} accent="teal" />
          <Stat label="Por facturar" value={porFacturar} accent="amber" />
        </div>

        {/* Search + filter */}
        <div className="flex gap-2 mb-6">
          <input
            placeholder="Buscar cliente, folio o técnico..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[14px] placeholder:text-faint"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[13px] shrink-0"
          >
            <option value="">Todos los tipos</option>
            <option value="Instalación nueva">Instalación nueva</option>
            <option value="Mantenimiento">Mantenimiento</option>
            <option value="Otro">Otro</option>
          </select>
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-muted py-14 text-sm">
            {reports.length === 0 ? 'Todavía no hay reportes.' : 'Sin resultados para esa búsqueda.'}
          </p>
        )}

        {/* Lista de reportes: 1 columna en celular, 2-3 en pantallas grandes */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((r) => (
            <div
              key={r.id}
              onClick={() => setOpen(r)}
              className="rounded-2xl border-l-4 border-teal bg-surface p-4 sm:p-5 cursor-pointer active:scale-[0.99] hover:shadow-glow transition-all shadow-glow"
            >
              <div className="flex justify-between items-start gap-3 mb-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Cliente / Empresa</div>
                  <strong className="font-display font-bold text-[16px] tracking-wide block truncate">{r.empresa_cliente}</strong>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Folio</div>
                  <span className="text-[12px] font-mono font-semibold text-teal">{r.data?.claveFormato || '—'}</span>
                </div>
              </div>

              <div className="text-[12px] text-muted mb-3 flex items-center gap-1.5 flex-wrap">
                <span>{r.tipo_servicio || 'Sin tipo'}{r.sub_tipo_servicio ? ` · ${r.sub_tipo_servicio}` : ''}</span>
                <span className="text-faint">·</span>
                <span className="truncate">{techName(r.profiles)}</span>
                <span className="text-faint">·</span>
                {r.data?.firmaRevisionData ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal/15 text-teal">✓ Completado</span>
                ) : (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber/15 text-amber">Pend. revisión</span>
                )}
                {(() => {
                  const chip = facturaChip(r.data, r.fecha);
                  return chip ? <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${chip.className}`}>{chip.label}</span> : null;
                })()}
              </div>

              <div className="flex justify-between items-end">
                <div className="flex gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Fecha</div>
                    <span className="text-[13px] font-medium">{formatFecha(r.fecha)}</span>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Hora</div>
                    <span className="text-[13px] font-medium">{r.data?.horaLlegada || '—'} hrs</span>
                  </div>
                </div>
                <span className="text-teal text-[13px] font-semibold flex items-center gap-0.5 shrink-0">
                  Ver
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {open && <ReportDetailModal report={open} onClose={() => setOpen(null)} />}

      {/* Floating bottom nav — solo en móvil; en escritorio el encabezado ya tiene todo */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex justify-center pb-4 px-4 pointer-events-none">
        <div className="pointer-events-auto glass-strong rounded-full px-2 py-2 flex items-center gap-1 shadow-glow">
          <div className="px-4 py-2 rounded-full bg-teal text-inkOnAccent text-[13px] font-display font-semibold tracking-wide flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-bg/70" /> Reportes
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-full text-[13px] text-ink/70 font-medium active:scale-95 transition-transform"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: 'teal' | 'amber' | 'red' }) {
  const dot = accent === 'teal' ? 'bg-teal' : accent === 'amber' ? 'bg-amber' : 'bg-red';
  return (
    <div className="glass rounded-2xl px-3.5 py-3.5 lg:px-5 lg:py-5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      </div>
      <div className="font-display text-[28px] lg:text-[34px] font-bold leading-none">{value}</div>
    </div>
  );
}
