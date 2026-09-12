'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import Logo from '@/components/Logo';
import { listarMisServicios, Servicio, filtrarSiguienteDiaPorGrupo, listarProgresoPorGrupo, ProgresoTareas } from '@/lib/serviciosProgramados';
import ProgressBar from '@/components/ProgressBar';
import { MapPin, Play, Check, Clock } from 'lucide-react';
import { calcularResultadoServicio } from '@/lib/resultadoServicio';
import { ResultadoIconos } from '@/components/ResultadoServicioBadges';
import { evaluarVentanaServicio } from '@/lib/ventanaServicio';
import { CalendarClock } from 'lucide-react';
import TecnicoTabs from '@/components/TecnicoTabs';

// Cada estado se distingue por color de borde + ícono, para leerse de reojo
// sin necesidad de leer la etiqueta.
const ESTADO_CFG: Record<Servicio['estado'], { label: string; cls: string; borde: string; Icono: any }> = {
  programado: { label: 'Por iniciar', cls: 'bg-amber/15 text-amber', borde: 'border-l-amber', Icono: Clock },
  en_sitio: { label: 'En sitio', cls: 'bg-amber/15 text-amber', borde: 'border-l-amber', Icono: MapPin },
  en_curso: { label: 'En curso', cls: 'bg-teal/15 text-teal', borde: 'border-l-teal', Icono: Play },
  concluido: { label: 'Concluido', cls: 'bg-surface-2 text-muted', borde: 'border-l-line-strong', Icono: Check },
};

function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

export default function MisServiciosList({ userName }: { userName?: string }) {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [progresoPorGrupo, setProgresoPorGrupo] = useState<Record<string, ProgresoTareas>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listarMisServicios(), listarProgresoPorGrupo()])
      .then(([s, p]) => {
        setServicios(s);
        setProgresoPorGrupo(p);
      })
      .catch((e) => setError(e?.message || 'No se pudieron cargar tus servicios'))
      .finally(() => setLoading(false));
  }, []);

  const pendientes = filtrarSiguienteDiaPorGrupo(servicios);
  const concluidos = servicios.filter((s) => s.estado === 'concluido');

  return (
    <div className="max-w-2xl lg:max-w-4xl mx-auto pb-28 lg:pb-16">
      <div className="sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center justify-between gap-3">
        <Logo variante="completo" size={32} className="min-w-0" compactoEnMovil />
        <div className="flex items-center gap-1 shrink-0">
          <ThemeToggle />
          <LogoutButton compacto />
        </div>
      </div>

      <div className="px-4 pt-5">
        <h1 className="font-display font-bold text-2xl lg:text-3xl tracking-wide mb-4">Mis servicios</h1>
        {userName && <p className="text-[15px] text-muted font-medium mb-4 -mt-2.5">{userName}</p>}

        <TecnicoTabs active="servicios" />
        {loading && (
          <div className="flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl bg-surface-2 h-[104px] animate-pulse" />
            ))}
          </div>
        )}
        {error && <p className="text-red text-sm">{error}</p>}

        {!loading && pendientes.length > 0 && (
          <div className="mb-6">
            <div className="text-[13px] font-semibold text-muted mb-2.5">Pendientes</div>
            <div className="flex flex-col gap-3">
              {pendientes.map((s) => {
                const pr = progresoPorGrupo[s.grupo_id];
                const ventana = evaluarVentanaServicio(s);
                return (
                <Link key={s.id} href={`/servicios/${s.id}`} className={`block rounded-2xl border-l-4 ${ESTADO_CFG[s.estado].borde} border-y border-r border-y-line border-r-line bg-surface p-4 active:scale-[0.98] transition-transform`}>
                  <div className="flex justify-between items-start gap-2.5 mb-2">
                    <strong className="font-display font-bold text-[16px] leading-snug">{s.proyecto}</strong>
                    <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1.5 ${ESTADO_CFG[s.estado].cls}`}>
                      {(() => { const I = ESTADO_CFG[s.estado].Icono; return <I size={13} strokeWidth={2.6} />; })()}
                      {ESTADO_CFG[s.estado].label}
                    </span>
                  </div>
                  {pr && pr.total > 0 && (
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <ProgressBar pct={pr.pct} className="flex-1" />
                      <span className={`text-[13px] font-display font-bold shrink-0 ${pr.pct >= 100 ? 'text-teal' : 'text-amber'}`}>{pr.pct}%</span>
                    </div>
                  )}
                  <p className="text-[13px] text-muted">{s.dias_totales > 1 ? `Día ${s.numero_dia} de ${s.dias_totales}` : formatFecha(s.fecha)} · {s.duracion_estimada_min} min estimados</p>
                  {!ventana.permitido && (
                    <p className="text-[12.5px] text-amber font-medium mt-1.5 flex items-center gap-1.5">
                      <CalendarClock size={13} strokeWidth={2.5} className="shrink-0" />
                      Disponible el {ventana.fechaTexto}
                    </p>
                  )}
                </Link>
                );
              })}
            </div>
          </div>
        )}

        {!loading && concluidos.length > 0 && (
          <div>
            <div className="text-[13px] font-semibold text-muted mb-2.5">Concluidos</div>
            <div className="flex flex-col gap-2.5">
              {concluidos.map((s) => (
                <Link key={s.id} href={`/servicios/${s.id}`} className="block rounded-xl bg-surface-2 border border-line p-3.5 active:scale-[0.99] transition-transform opacity-80">
                  <div className="flex justify-between items-center gap-2.5">
                    <span className="text-[14px] font-semibold flex items-center gap-2 min-w-0">
                      <ResultadoIconos resultado={calcularResultadoServicio(s, progresoPorGrupo[s.grupo_id])} size={15} />
                      <span className="truncate">{s.proyecto}</span>
                    </span>
                    <span className="text-[12px] text-muted shrink-0">{s.dias_totales > 1 ? `Día ${s.numero_dia}/${s.dias_totales}` : formatFecha(s.fecha)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {!loading && servicios.length === 0 && !error && (
          <p className="text-center text-muted py-10 text-[14px]">No tienes servicios asignados. Tu supervisor te avisará cuando programe uno.</p>
        )}
      </div>
    </div>
  );
}
