'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import Logo from '@/components/Logo';
import {
  listarMisServicios, Servicio, filtrarSiguienteDiaPorGrupo, listarProgresoPorGrupo, ProgresoTareas,
  listarSitiosActivosHoy, avisarTecnicoFueraDeSitio, listarMisConfirmaciones, marcarServiciosVistos,
} from '@/lib/serviciosProgramados';
import BotonEnterado from '@/components/BotonEnterado';
import { getCurrentLocation } from '@/lib/geolocation';
import { distanciaMetros } from '@/lib/geocerca';
import ProgressBar from '@/components/ProgressBar';
import EmptyIllustration from '@/components/EmptyIllustration';
import { MapPin, Play, Check, Clock, CheckCheck } from 'lucide-react';
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
  const [confirmaciones, setConfirmaciones] = useState<Record<string, { visto_en: string | null; enterado_en: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listarMisServicios(), listarProgresoPorGrupo(), listarMisConfirmaciones().catch(() => ({} as Awaited<ReturnType<typeof listarMisConfirmaciones>>))])
      .then(([s, p, c]) => {
        setServicios(s);
        setProgresoPorGrupo(p);
        setConfirmaciones(c);
        // Abrir esta lista cuenta como «visto» para lo que aún no lo estaba.
        const sinVer = s.filter((sv) => sv.estado !== 'concluido' && c[sv.id] && !c[sv.id].visto_en).map((sv) => sv.id);
        marcarServiciosVistos(sinVer);
      })
      .catch((e) => setError(e?.message || 'No se pudieron cargar tus servicios'))
      .finally(() => setLoading(false));
  }, []);

  // Revisión de "¿estoy parado en un sitio que no es el mío?": una sola
  // lectura de GPS al abrir esta pantalla (no rastreo continuo) contra los
  // demás sitios programados de hoy. Si hay uno cerca, avisa a los
  // supervisores — una sola vez por sitio y por día, para no repetir el
  // aviso cada vez que el técnico reabre la app.
  useEffect(() => {
    let cancelado = false;
    listarSitiosActivosHoy()
      .then(async (sitios) => {
        if (cancelado || sitios.length === 0) return;
        const hoy = new Date().toISOString().slice(0, 10);
        const pendientes = sitios.filter((s) => sessionStorage.getItem(`anomalia_${s.servicio_id}_${hoy}`) !== '1');
        if (pendientes.length === 0) return;
        const loc = await getCurrentLocation();
        if (cancelado || !loc) return;
        for (const s of pendientes) {
          if (distanciaMetros(loc, s) <= (s.radio_m || 120)) {
            sessionStorage.setItem(`anomalia_${s.servicio_id}_${hoy}`, '1');
            await avisarTecnicoFueraDeSitio(s.servicio_id).catch(() => {});
          }
        }
      })
      .catch(() => {});
    return () => { cancelado = true; };
  }, []);

  const pendientes = filtrarSiguienteDiaPorGrupo(servicios);

  // «Enterado» confirma todo el proyecto: se refleja en todos sus días.
  function marcarGrupoEnterado(grupoId: string) {
    const ahora = new Date().toISOString();
    setConfirmaciones((prev) => {
      const nuevo = { ...prev };
      servicios.filter((sv) => sv.grupo_id === grupoId).forEach((sv) => {
        nuevo[sv.id] = { visto_en: prev[sv.id]?.visto_en || ahora, enterado_en: prev[sv.id]?.enterado_en || ahora };
      });
      return nuevo;
    });
  }
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
              <div key={i} className="rounded-2xl border-l-4 border-line bg-surface p-4">
                <div className="flex justify-between items-start gap-2.5 mb-2">
                  <div className="h-4 w-2/5 rounded-full skeleton-shimmer" />
                  <div className="h-5 w-20 rounded-full skeleton-shimmer shrink-0" />
                </div>
                <div className="h-2 w-full rounded-full skeleton-shimmer mb-2" />
                <div className="h-3 w-3/5 rounded-full skeleton-shimmer" />
              </div>
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
                <Link key={s.id} href={`/servicios/${s.id}`} className={`group block rounded-2xl border-l-4 ${ESTADO_CFG[s.estado].borde} border-y border-r border-y-line border-r-line bg-surface p-4 shadow-glow transition-all duration-150 hover:-translate-y-1 hover:shadow-diffuse active:translate-y-0 active:scale-[0.98]`}>
                  <div className="flex justify-between items-start gap-2.5 mb-2">
                    <strong className="font-display font-bold text-[16px] leading-snug transition-colors group-hover:text-teal">{s.proyecto}</strong>
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
                  {s.estado === 'programado' && confirmaciones[s.id] && (
                    confirmaciones[s.id].enterado_en ? (
                      <p className="text-[12.5px] text-teal font-medium mt-1.5 flex items-center gap-1.5">
                        <CheckCheck size={14} strokeWidth={2.5} className="shrink-0" /> Confirmaste que estás enterado
                      </p>
                    ) : (
                      <div className="mt-3 flex items-center gap-2.5">
                        <BotonEnterado servicio={s} onConfirmado={() => marcarGrupoEnterado(s.grupo_id)} />
                        <span className="text-[12px] text-muted leading-snug">Confirma que viste este servicio</span>
                      </div>
                    )
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
                <Link key={s.id} href={`/servicios/${s.id}`} className="group block rounded-xl bg-surface-2 border border-line p-3.5 opacity-80 transition-all duration-150 hover:opacity-100 hover:-translate-y-0.5 hover:shadow-diffuse active:translate-y-0 active:scale-[0.99]">
                  <div className="flex justify-between items-center gap-2.5">
                    <span className="text-[14px] font-semibold flex items-center gap-2 min-w-0">
                      <ResultadoIconos resultado={calcularResultadoServicio(s, progresoPorGrupo[s.grupo_id])} size={15} />
                      <span className="truncate transition-colors group-hover:text-teal">{s.proyecto}</span>
                    </span>
                    <span className="text-[12px] text-muted shrink-0">{s.dias_totales > 1 ? `Día ${s.numero_dia}/${s.dias_totales}` : formatFecha(s.fecha)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {!loading && servicios.length === 0 && !error && (
          <div className="flex flex-col items-center py-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center mb-3.5">
              <EmptyIllustration variante="proyecto" />
            </div>
            <p className="text-[14.5px] font-medium mb-1">Todavía no tienes servicios</p>
            <p className="text-[13px] text-muted leading-relaxed max-w-[280px]">
              Aparecerán aquí conforme tu supervisor programe uno.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
