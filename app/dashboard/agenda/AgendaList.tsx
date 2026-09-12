'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import Logo from '@/components/Logo';
import DashboardTabs from '@/components/DashboardTabs';
import ProgressBar from '@/components/ProgressBar';
import {
  Servicio, listarServiciosSupervisor, listarTecnicosPorServicio,
  listarProgresoPorGrupo, ProgresoTareas, reprogramarDia,
} from '@/lib/serviciosProgramados';
import { construirAgenda, formatFechaAgenda, diasDeDiferencia } from '@/lib/agenda';
import { showToast } from '@/components/Toast';
import { MapPin, Play, Clock, Users, CalendarClock, AlertTriangle } from 'lucide-react';
import { hoyLocal } from '@/lib/fechaHoy';

const ESTADO_CFG: Record<Servicio['estado'], { label: string; cls: string; Icono: any }> = {
  programado: { label: 'Programado', cls: 'bg-surface-2 text-muted', Icono: Clock },
  en_sitio: { label: 'En sitio', cls: 'bg-amber/15 text-amber', Icono: MapPin },
  en_curso: { label: 'En curso', cls: 'bg-teal/15 text-teal', Icono: Play },
  concluido: { label: 'Concluido', cls: 'bg-teal/15 text-teal', Icono: Clock },
};

export default function AgendaList({ userName }: { userName?: string }) {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [tecnicosPorServicio, setTecnicosPorServicio] = useState<Record<string, string[]>>({});
  const [progresoPorGrupo, setProgresoPorGrupo] = useState<Record<string, ProgresoTareas>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroTecnico, setFiltroTecnico] = useState('');

  // Reprogramación rápida desde la propia agenda: es la acción que se necesita
  // justo cuando se está viendo un día vencido.
  const [reprogramandoId, setReprogramandoId] = useState<string | null>(null);
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    try {
      const [s, t, p] = await Promise.all([
        listarServiciosSupervisor(),
        listarTecnicosPorServicio(),
        listarProgresoPorGrupo(),
      ]);
      setServicios(s);
      setTecnicosPorServicio(t);
      setProgresoPorGrupo(p);
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar la agenda');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  const tecnicosUnicos = useMemo(() => {
    const set = new Set<string>();
    Object.values(tecnicosPorServicio).forEach((lista) => lista.forEach((n) => set.add(n)));
    return Array.from(set).sort();
  }, [tecnicosPorServicio]);

  const serviciosFiltrados = useMemo(() => {
    if (!filtroTecnico) return servicios;
    return servicios.filter((s) => (tecnicosPorServicio[s.id] || []).includes(filtroTecnico));
  }, [servicios, filtroTecnico, tecnicosPorServicio]);

  const bloques = useMemo(() => construirAgenda(serviciosFiltrados), [serviciosFiltrados]);

  async function handleReprogramar(servicioId: string) {
    if (!nuevaFecha) return;
    setGuardando(true);
    try {
      await reprogramarDia(servicioId, nuevaFecha);
      showToast('Fecha reprogramada', 'success');
      setReprogramandoId(null);
      setNuevaFecha('');
      await cargar();
    } catch (e: any) {
      alert('No se pudo reprogramar: ' + (e?.message || 'error'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="max-w-2xl lg:max-w-6xl mx-auto pb-28 lg:pb-16 lg:px-6">
      <div className="sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center justify-between gap-3">
        <Logo variante="completo" size={32} className="min-w-0" compactoEnMovil />
        <div className="flex items-center gap-1 shrink-0">
          <ThemeToggle />
          <LogoutButton compacto />
        </div>
      </div>

      <div className="px-4 pt-5">
        <h1 className="font-display font-bold text-2xl lg:text-3xl tracking-wide mb-4">Agenda</h1>
        {userName && <p className="text-[15px] text-muted font-medium mb-4 -mt-2.5">{userName}</p>}

        <DashboardTabs active="agenda" />

        {tecnicosUnicos.length > 0 && (
          <select
            value={filtroTecnico}
            onChange={(e) => setFiltroTecnico(e.target.value)}
            className="w-full px-3.5 min-h-[48px] mb-4 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]"
          >
            <option value="">Todos los técnicos</option>
            {tecnicosUnicos.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        )}

        {loading && (
          <div className="flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="rounded-2xl bg-surface-2 h-[92px] animate-pulse" />)}
          </div>
        )}

        {error && (
          <div className="p-4 rounded-2xl bg-red/10 border border-red/30">
            <p className="text-[14px] font-semibold text-red mb-1">No se pudo cargar la agenda</p>
            <p className="text-[13px] text-ink/80">{error}</p>
          </div>
        )}

        {!loading && !error && bloques.length === 0 && (
          <p className="text-center text-muted py-10 text-[14px]">
            No hay días pendientes en la agenda. Todo lo programado está concluido.
          </p>
        )}

        {bloques.map((bloque) => (
          <div key={bloque.clave} className="mb-6">
            <div className={`text-[13.5px] font-semibold mb-2.5 flex items-center gap-2 ${bloque.clave === 'vencidos' ? 'text-red' : 'text-muted'}`}>
              {bloque.clave === 'vencidos' && <AlertTriangle size={15} strokeWidth={2.6} />}
              {bloque.titulo}
              <span className="text-muted font-normal">({bloque.dias.length})</span>
            </div>

            <div className="flex flex-col lg:grid lg:grid-cols-2 gap-2.5">
              {bloque.dias.map((s) => {
                const cfg = ESTADO_CFG[s.estado];
                const pr = progresoPorGrupo[s.grupo_id];
                const tecnicos = tecnicosPorServicio[s.id] || [];
                const atraso = Math.abs(diasDeDiferencia(s.fecha));
                return (
                  <div
                    key={s.id}
                    className={`rounded-2xl border-l-4 bg-surface p-4 border-y border-r border-y-line border-r-line ${
                      bloque.clave === 'vencidos' ? 'border-l-red' : bloque.clave === 'hoy' ? 'border-l-teal' : 'border-l-line-strong'
                    }`}
                  >
                    <Link href={`/dashboard/servicios/${s.id}`} className="block active:scale-[0.99] transition-transform">
                      <div className="flex justify-between items-start gap-2.5 mb-1.5">
                        <strong className="font-display font-bold text-[16px] leading-snug">{s.proyecto}</strong>
                        <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1.5 ${cfg.cls}`}>
                          <cfg.Icono size={12} strokeWidth={2.6} />
                          {cfg.label}
                        </span>
                      </div>

                      <p className="text-[13px] text-muted">
                        {s.dias_totales > 1 ? `Día ${s.numero_dia} de ${s.dias_totales} · ` : ''}
                        {formatFechaAgenda(s.fecha)} · {s.duracion_estimada_min} min
                      </p>

                      {bloque.clave === 'vencidos' && (
                        <p className="text-[12.5px] text-red font-medium mt-1">
                          {atraso === 1 ? 'Venció ayer' : `Venció hace ${atraso} días`} — el técnico no puede iniciarlo hasta que se reprograme
                        </p>
                      )}

                      {tecnicos.length > 0 && (
                        <p className="text-[12.5px] text-muted mt-1.5 flex items-center gap-1.5">
                          <Users size={13} strokeWidth={2.3} className="shrink-0" />
                          {tecnicos.join(', ')}
                        </p>
                      )}

                      {pr && pr.total > 0 && (
                        <div className="flex items-center gap-2.5 mt-2">
                          <ProgressBar pct={pr.pct} className="flex-1" />
                          <span className={`text-[12px] font-display font-bold shrink-0 ${pr.pct >= 100 ? 'text-teal' : 'text-amber'}`}>{pr.pct}%</span>
                        </div>
                      )}
                    </Link>

                    {reprogramandoId === s.id ? (
                      <div className="mt-3 pt-3 border-t border-line">
                        <label className="text-[13px] text-ink/75 block mb-1.5">Nueva fecha</label>
                        <input
                          type="date"
                          value={nuevaFecha}
                          onChange={(e) => setNuevaFecha(e.target.value)}
                          className="w-full px-3 min-h-[46px] mb-2.5 rounded-lg bg-surface-2 border border-line text-[14.5px]"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setReprogramandoId(null); setNuevaFecha(''); }}
                            className="flex-1 min-h-[46px] border border-line-strong text-ink/80 rounded-xl text-[14px]"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleReprogramar(s.id)}
                            disabled={guardando || !nuevaFecha}
                            className="flex-1 min-h-[46px] bg-amber text-inkOnAccent rounded-xl text-[14px] font-semibold disabled:opacity-60"
                          >
                            {guardando ? 'Guardando...' : 'Reprogramar'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      bloque.clave === 'vencidos' && (
                        <button
                          onClick={() => {
                            setReprogramandoId(s.id);
                            setNuevaFecha(hoyLocal());
                          }}
                          className="mt-2.5 min-h-[44px] w-full rounded-xl bg-amber/15 text-amber text-[14px] font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                        >
                          <CalendarClock size={16} strokeWidth={2.5} />
                          Reprogramar
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
