'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import { listarMisServicios, Servicio, filtrarSiguienteDiaPorGrupo } from '@/lib/serviciosProgramados';

const ESTADO_CFG: Record<Servicio['estado'], { label: string; cls: string }> = {
  programado: { label: 'Por iniciar', cls: 'bg-amber/15 text-amber' },
  en_sitio: { label: '📍 En sitio', cls: 'bg-amber/15 text-amber' },
  en_curso: { label: '● En curso', cls: 'bg-teal/15 text-teal' },
  concluido: { label: '✓ Concluido', cls: 'bg-surface-2 text-muted' },
};

function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

export default function MisServiciosList() {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listarMisServicios()
      .then(setServicios)
      .catch((e) => setError(e?.message || 'No se pudieron cargar tus servicios'))
      .finally(() => setLoading(false));
  }, []);

  const pendientes = filtrarSiguienteDiaPorGrupo(servicios);
  const concluidos = servicios.filter((s) => s.estado === 'concluido');

  return (
    <div className="max-w-2xl lg:max-w-4xl mx-auto pb-28 lg:pb-16">
      <div className="sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link href="/mis-reportes" className="shrink-0 w-8 h-8 rounded-full border border-line-strong flex items-center justify-center active:scale-90 transition-transform">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
          <h1 className="font-display font-semibold text-base tracking-wide truncate">Mis servicios asignados</h1>
        </div>
        <ThemeToggle />
      </div>

      <div className="px-4 pt-5">
        {loading && <p className="text-center text-muted py-10 text-sm">Cargando...</p>}
        {error && <p className="text-red text-sm">{error}</p>}

        {!loading && pendientes.length > 0 && (
          <div className="mb-6">
            <div className="text-[11px] uppercase tracking-wider text-muted mb-2.5">Pendientes</div>
            <div className="flex flex-col gap-3">
              {pendientes.map((s) => (
                <Link key={s.id} href={`/servicios/${s.id}`} className="block rounded-2xl border-l-4 border-teal bg-surface p-4 active:scale-[0.98] transition-transform">
                  <div className="flex justify-between items-start gap-2 mb-1.5">
                    <strong className="font-display font-bold text-[15px]">{s.proyecto}</strong>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${ESTADO_CFG[s.estado].cls}`}>{ESTADO_CFG[s.estado].label}</span>
                  </div>
                  <p className="text-[12px] text-muted">{s.dias_totales > 1 ? `Día ${s.numero_dia}/${s.dias_totales}` : formatFecha(s.fecha)} · {s.duracion_estimada_min} min estimados</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {!loading && concluidos.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted mb-2.5">Concluidos</div>
            <div className="flex flex-col gap-2.5">
              {concluidos.map((s) => (
                <Link key={s.id} href={`/servicios/${s.id}`} className="block rounded-xl bg-surface-2 border border-line p-3.5 active:scale-[0.99] transition-transform opacity-80">
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] font-semibold">{s.proyecto}</span>
                    <span className="text-[10px] text-muted">{s.dias_totales > 1 ? `Día ${s.numero_dia}/${s.dias_totales}` : formatFecha(s.fecha)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {!loading && servicios.length === 0 && !error && (
          <p className="text-center text-muted py-10 text-sm">No tienes servicios asignados por el momento.</p>
        )}
      </div>
    </div>
  );
}
