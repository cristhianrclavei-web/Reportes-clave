'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabaseClient';
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/lib/useTheme';
import ReportDetailModal, { ReportDetail } from '@/components/ReportDetailModal';

type Report = ReportDetail;

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

function formatFecha(fecha: string): string {
  if (!fecha) return '—';
  const [y, m, d] = fecha.split('-');
  if (!y || !m || !d) return fecha;
  return `${d}/${m}/${y}`;
}

export default function MisReportesList({ reports, userName }: { reports: Report[]; userName?: string }) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [showFilter, setShowFilter] = useState(false);
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
        const hay = `${r.empresa_cliente} ${r.data?.claveFormato || ''}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [reports, search, filterType]);

  return (
    <div className="max-w-2xl lg:max-w-4xl mx-auto pb-28 lg:pb-16">
      {/* Header */}
      <div className="sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center justify-between gap-3">
        <img src={theme === 'light' ? '/brand/logo-badge-light.png' : '/brand/logo-badge.png'} alt="Clave Inteligente" className="h-11 w-11 shrink-0 object-contain" />
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-teal text-inkOnAccent flex items-center justify-center text-[11px] font-display font-bold shrink-0">
              {iniciales(userName || '') || '?'}
            </div>
            <span className="text-[13px] font-medium truncate max-w-[100px]">{userName || 'Técnico'}</span>
          </div>
          <ThemeToggle />
          <button
            onClick={handleLogout}
            className="hidden lg:inline-block text-xs border border-line-strong text-ink/80 rounded-full px-3 py-1.5 active:scale-95 transition-transform"
          >
            Salir
          </button>
        </div>
      </div>

      <div className="px-4 pt-5">
        <h1 className="font-display font-bold text-2xl lg:text-3xl tracking-wide mb-4">
          Mis Reportes, {primerNombre(userName || '') || 'Técnico'}
        </h1>

        {/* Botón principal: nuevo reporte */}
        <Link
          href="/nuevo"
          className="block w-full text-center py-4 mb-3 rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-base tracking-wide shadow-glow-teal active:scale-[0.98] transition-transform"
        >
          + Crear Nuevo Reporte
        </Link>
        <Link
          href="/servicios"
          className="block w-full text-center py-3 mb-2.5 rounded-2xl border border-teal/40 text-teal font-display font-semibold text-[14px] tracking-wide active:scale-[0.98] transition-transform"
        >
          🗂️ Servicios asignados
        </Link>
        <Link
          href="/bitacora"
          className="block w-full text-center py-3 mb-5 rounded-2xl border border-line-strong text-ink/70 font-display font-semibold text-[14px] tracking-wide active:scale-[0.98] transition-transform"
        >
          📋 Bitácora libre
        </Link>

        {/* Buscador + filtro */}
        <div className="flex gap-2 mb-3">
          <input
            placeholder="Buscar por cliente o folio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[14px] placeholder:text-faint"
          />
          <button
            onClick={() => setShowFilter((v) => !v)}
            className={`px-4 py-2.5 rounded-xl border text-[13px] font-medium flex items-center gap-1.5 shrink-0 transition-colors ${
              showFilter || filterType ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line text-ink/80'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
            </svg>
            Filtro
          </button>
        </div>
        {showFilter && (
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full mb-5 px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[13px]"
          >
            <option value="">Todos los tipos</option>
            <option value="Instalación nueva">Instalación nueva</option>
            <option value="Mantenimiento">Mantenimiento</option>
            <option value="Otro">Otro</option>
          </select>
        )}
        {!showFilter && <div className="mb-5" />}

        {/* Lista de reportes */}
        {filtered.length === 0 && (
          <p className="text-center text-muted py-10 text-sm">
            {reports.length === 0 ? 'Todavía no has creado ningún reporte.' : 'Sin resultados para esa búsqueda.'}
          </p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((r) => (
            <div
              key={r.id}
              onClick={() => setOpen(r)}
              className="rounded-2xl border-l-4 border-teal bg-surface p-4 sm:p-5 cursor-pointer active:scale-[0.99] transition-transform shadow-glow"
            >
              <div className="flex justify-between items-start gap-3 mb-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Cliente / Empresa</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="font-display font-bold text-[17px] tracking-wide truncate">{r.empresa_cliente}</strong>
                    {r.data?.firmaRevisionData ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal/15 text-teal shrink-0">✓ Completado</span>
                    ) : (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber/15 text-amber shrink-0">Pend. revisión</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Folio</div>
                  <span className="text-[13px] font-mono font-semibold text-teal">{r.data?.claveFormato || '—'}</span>
                </div>
              </div>
              <div className="flex justify-between items-end">
                <div className="flex gap-5">
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

      {/* Floating bottom nav — solo en móvil */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex justify-center pb-4 px-4 pointer-events-none">
        <div className="pointer-events-auto glass-strong rounded-full px-2 py-2 flex items-center gap-1 shadow-glow">
          <div className="px-4 py-2 rounded-full bg-teal text-inkOnAccent text-[13px] font-display font-semibold tracking-wide flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-bg/70" /> Mis Reportes
          </div>
          <Link href="/bitacora" className="px-4 py-2 rounded-full text-[13px] text-ink/70 font-medium active:scale-95 transition-transform">
            Bitácora
          </Link>
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
