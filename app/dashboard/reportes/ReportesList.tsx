'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabaseClient';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import ReportDetailModal, { ReportDetail, techName } from '@/components/ReportDetailModal';
import DashboardTabs from '@/components/DashboardTabs';
import { facturaChip } from '@/lib/reportStatus';
import { showToast } from '@/components/Toast';
import { Check, MessageSquareWarning } from 'lucide-react';
import Logo from '@/components/Logo';
import SelectorSemana, { RangoSeleccionado } from '@/components/SelectorSemana';

type Report = ReportDetail;

function formatFecha(fecha: string): string {
  if (!fecha) return '—';
  const [y, m, d] = fecha.split('-');
  if (!y || !m || !d) return fecha;
  return `${d}/${m}/${y}`;
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

export default function ReportesList({
  reports: reportsIniciales,
  userName,
  errorCarga,
}: {
  reports: Report[];
  userName?: string;
  errorCarga?: string | null;
}) {
  // Copia local: al eliminar un reporte desde el modal se quita de la
  // lista al instante, sin esperar una recarga del servidor.
  const [reports, setReports] = useState<Report[]>(reportsIniciales);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [rango, setRango] = useState<RangoSeleccionado | null>(null);
  const fechasDeReportes = useMemo(() => reports.map((r) => r.fecha).filter(Boolean), [reports]);
  const [open, setOpen] = useState<Report | null>(null);

  function handleReporteEliminado(reportId: string) {
    setReports((prev) => prev.filter((r) => r.id !== reportId));
    showToast('Reporte eliminado', 'success');
  }


  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (filterType && r.tipo_servicio !== filterType) return false;
      // El rango de fechas no aplica cuando se busca por texto: quien escribe
      // el nombre de un cliente quiere encontrarlo esté en la semana que esté.
      if (!search && rango && r.fecha) {
        if (r.fecha < rango.desde || r.fecha > rango.hasta) return false;
      }
      if (search) {
        const hay = `${r.empresa_cliente} ${techName(r.profiles)} ${r.data?.claveFormato || ''} ${r.data?.contactoUsuario || ''}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [reports, search, filterType, rango]);

  const solicitudesPendientes = useMemo(
    () => reports.filter((r) => r.correccion_solicitada && !r.correccion_habilitada),
    [reports]
  );

  return (
    <div className="max-w-3xl lg:max-w-6xl mx-auto pb-10 px-0 lg:px-4">
      {/* Header */}
      <div className="sticky top-0 z-20 glass-strong px-5 lg:px-6 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Logo variante="completo" size={34} className="min-w-0" />
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="hidden lg:flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-teal text-inkOnAccent flex items-center justify-center text-[11px] font-display font-bold shrink-0">
              {iniciales(userName || '') || '?'}
            </div>
            <span className="text-[13px] font-medium truncate max-w-[140px]">{userName || 'Supervisor'}</span>
          </div>
          <ThemeToggle />
          <LogoutButton />
        </div>
      </div>

      <div className="px-4 lg:px-0 pt-5">
        <h1 className="font-display font-bold text-2xl lg:text-3xl tracking-wide mb-4">
          Reportes de servicio
        </h1>
        {userName && (
          <p className="text-[15px] text-muted font-medium mb-4 -mt-2.5">{userName}</p>
        )}

        <DashboardTabs active="reportes" />

        {solicitudesPendientes.length > 0 && (
          <div className="mb-4 p-4 rounded-2xl bg-amber/12 border-2 border-amber/40">
            <p className="font-display font-semibold text-[15px] text-amber mb-2 flex items-center gap-2">
              <MessageSquareWarning size={18} strokeWidth={2.5} />
              {solicitudesPendientes.length === 1
                ? 'Hay 1 solicitud de corrección'
                : `Hay ${solicitudesPendientes.length} solicitudes de corrección`}
            </p>
            <div className="flex flex-col gap-2">
              {solicitudesPendientes.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setOpen(r)}
                  className="text-left rounded-xl bg-surface border border-amber/25 p-3 min-h-[48px] active:scale-[0.99] transition-transform"
                >
                  <p className="text-[14px] font-semibold">{r.empresa_cliente}</p>
                  <p className="text-[12.5px] text-muted">
                    {techName(r.profiles)}{r.correccion_motivo ? ` — ${r.correccion_motivo}` : ''}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
        {errorCarga && (
          <div className="mb-4 p-4 rounded-2xl bg-red/10 border border-red/30">
            <p className="text-[14px] font-semibold text-red mb-1">No se pudieron cargar los reportes</p>
            <p className="text-[13px] text-ink/80 leading-relaxed">{errorCarga}</p>
            <p className="text-[12.5px] text-muted mt-2 leading-relaxed">
              Si el mensaje habla de una columna o tabla que no existe, falta correr un patch de SQL en Supabase.
            </p>
          </div>
        )}

        <SelectorSemana fechas={fechasDeReportes} onCambio={setRango} etiqueta="reportes" />

        {/* Search + filter */}
        <div className="flex gap-2 mb-6">
          <input
            placeholder="Buscar en todos los reportes..."
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
          <p className="text-center text-muted py-14 text-[14px] leading-relaxed">
            {reports.length === 0
              ? 'Todavía no hay reportes.'
              : search
              ? 'Sin resultados para esa búsqueda.'
              : 'No hay reportes en estas fechas. Cambia de semana o toca «Toda la semana».'}
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
                  <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-teal/15 text-teal flex items-center gap-1.5"><Check size={12} strokeWidth={3} />Completado</span>
                ) : (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber/15 text-amber">Pend. revisión</span>
                )}
                {r.correccion_solicitada && !r.correccion_habilitada && (
                  <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-amber/20 text-amber flex items-center gap-1.5">
                    <MessageSquareWarning size={12} strokeWidth={2.6} />Corrección pedida
                  </span>
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

      {open && <ReportDetailModal report={open} onClose={() => setOpen(null)} canDelete esSupervisor onDeleted={handleReporteEliminado} />}

    </div>
  );
}
