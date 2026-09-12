'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import Logo from '@/components/Logo';
import ProgressBar from '@/components/ProgressBar';
import { obtenerProgresoProyecto, ProgresoProyecto } from '@/lib/progresoProyecto';
import { calcularResultadoServicio } from '@/lib/resultadoServicio';
import { ResultadoIconos } from '@/components/ResultadoServicioBadges';
import {
  ChevronLeft, ChevronRight, Users, FileText, AlertTriangle, Timer,
  MapPin, Play, Check, Clock, CircleDashed,
} from 'lucide-react';

const ESTADO_CFG: Record<string, { label: string; cls: string; Icono: any }> = {
  programado: { label: 'Programado', cls: 'bg-surface-2 text-muted', Icono: Clock },
  en_sitio: { label: 'En sitio', cls: 'bg-amber/15 text-amber', Icono: MapPin },
  en_curso: { label: 'En curso', cls: 'bg-teal/15 text-teal', Icono: Play },
  concluido: { label: 'Concluido', cls: 'bg-teal/15 text-teal', Icono: Check },
};

function fmtFecha(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function ProgresoProyectoView({ grupoId }: { grupoId: string }) {
  const [datos, setDatos] = useState<ProgresoProyecto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerProgresoProyecto(grupoId)
      .then(setDatos)
      .catch((e) => setError(e?.message || 'No se pudo cargar el progreso'))
      .finally(() => setLoading(false));
  }, [grupoId]);

  return (
    <div className="max-w-2xl lg:max-w-5xl mx-auto pb-16 lg:px-6">
      <div className="sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link href="/dashboard/servicios" aria-label="Volver" className="shrink-0 w-11 h-11 -ml-1.5 rounded-full flex items-center justify-center active:scale-90 transition-transform">
            <ChevronLeft size={24} strokeWidth={2.4} />
          </Link>
          <Logo size={30} />
          <h1 className="font-display font-semibold text-[17px] tracking-wide truncate">Avance del proyecto</h1>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ThemeToggle />
          <LogoutButton compacto />
        </div>
      </div>

      <div className="px-4 lg:px-0 pt-5">
        {loading && <div className="rounded-2xl bg-surface-2 h-[160px] animate-pulse" aria-busy="true" />}

        {error && (
          <div className="p-4 rounded-2xl bg-red/10 border border-red/30">
            <p className="text-[14px] font-semibold text-red mb-1">No se pudo cargar</p>
            <p className="text-[13px] text-ink/80">{error}</p>
          </div>
        )}

        {!loading && !error && !datos && (
          <p className="text-center text-muted py-10 text-[14px]">Este proyecto ya no existe.</p>
        )}

        {datos && (
          <>
            <h2 className="font-display font-bold text-2xl lg:text-3xl tracking-wide mb-1">{datos.proyecto}</h2>
            <p className="text-[13.5px] text-muted mb-4">
              {datos.diasTotales} {datos.diasTotales === 1 ? 'día' : 'días'} · {datos.diasConReporte} con reporte
            </p>

            <div className="glass rounded-2xl p-4 mb-5">
              <div className="flex items-baseline justify-between mb-1.5">
                <p className="text-[13.5px] text-muted">
                  {datos.tareasCerradas} de {datos.totalTareas} tareas del proyecto
                </p>
                <span className={`font-display font-bold text-[20px] ${datos.pctGlobal >= 100 ? 'text-teal' : 'text-amber'}`}>
                  {datos.pctGlobal}%
                </span>
              </div>
              <ProgressBar pct={datos.pctGlobal} />
            </div>

            {/* Línea de tiempo: un renglón por día, con el avance acumulado */}
            <div className="flex flex-col">
              {datos.dias.map((d, i) => {
                const cfg = ESTADO_CFG[d.servicio.estado] || ESTADO_CFG.programado;
                const esUltimo = i === datos.dias.length - 1;
                const hizoAlgo = d.tareasCerradasEseDia > 0 || d.avancesParciales > 0;
                return (
                  <div key={d.servicio.id} className="flex gap-3">
                    {/* Guía vertical */}
                    <div className="flex flex-col items-center shrink-0 pt-1.5">
                      <span className={`w-3 h-3 rounded-full ${
                        d.servicio.estado === 'concluido' ? 'bg-teal' : hizoAlgo ? 'bg-amber' : 'bg-line-strong'
                      }`} />
                      {!esUltimo && <span className="w-px flex-1 bg-line my-1" />}
                    </div>

                    <div className="flex-1 min-w-0 pb-5">
                      <Link
                        href={`/dashboard/servicios/${d.servicio.id}`}
                        className="block rounded-2xl bg-surface border border-line p-4 active:scale-[0.99] transition-transform"
                      >
                        <div className="flex items-start justify-between gap-2.5 mb-1.5">
                          <div className="min-w-0">
                            <p className="font-display font-bold text-[15.5px] flex items-center gap-2">
                              <ResultadoIconos resultado={calcularResultadoServicio(d.servicio)} size={15} />
                              Día {d.servicio.numero_dia}
                            </p>
                            <p className="text-[13px] text-muted">{fmtFecha(d.servicio.fecha)}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${cfg.cls}`}>
                              <cfg.Icono size={12} strokeWidth={2.6} />
                              {cfg.label}
                            </span>
                            <ChevronRight size={16} strokeWidth={2.4} className="text-muted" />
                          </div>
                        </div>

                        {/* Lo que se avanzó ese día */}
                        <div className="flex items-center gap-2.5 mt-2.5">
                          <ProgressBar pct={d.pctAcumulado} className="flex-1" />
                          <span className={`text-[13px] font-display font-bold shrink-0 ${d.pctAcumulado >= 100 ? 'text-teal' : 'text-amber'}`}>
                            {d.pctAcumulado}%
                          </span>
                        </div>
                        <p className="text-[12.5px] text-muted mt-1.5">
                          {d.tareasCerradasEseDia > 0
                            ? `Cerró ${d.tareasCerradasEseDia} ${d.tareasCerradasEseDia === 1 ? 'tarea' : 'tareas'} este día`
                            : d.avancesParciales > 0
                            ? 'Solo avances parciales este día'
                            : d.servicio.estado === 'concluido'
                            ? 'Sin tareas cerradas este día'
                            : 'Pendiente'}
                          {d.avancesParciales > 0 && d.tareasCerradasEseDia > 0 && ` · ${d.avancesParciales} avance(s) parcial(es)`}
                        </p>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
                          {d.tecnicos.length > 0 && (
                            <span className="text-[12.5px] text-muted flex items-center gap-1.5">
                              <Users size={13} strokeWidth={2.3} />
                              {d.tecnicos.join(', ')}
                            </span>
                          )}
                          {d.tieneReporte ? (
                            <span className="text-[12.5px] text-teal font-medium flex items-center gap-1.5">
                              <FileText size={13} strokeWidth={2.4} />
                              Con reporte
                            </span>
                          ) : (
                            <span className="text-[12.5px] text-muted flex items-center gap-1.5">
                              <CircleDashed size={13} strokeWidth={2.3} />
                              Sin reporte
                            </span>
                          )}
                          {d.retrasoMin && (
                            <span className="text-[12.5px] text-red font-medium flex items-center gap-1.5">
                              <AlertTriangle size={13} strokeWidth={2.5} />
                              {d.retrasoMin} min de más
                            </span>
                          )}
                        </div>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
