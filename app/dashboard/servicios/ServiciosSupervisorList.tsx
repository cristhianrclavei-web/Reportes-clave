'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/lib/useTheme';
import { crearServicio, listarServiciosSupervisor, listarTecnicos, Servicio, calcularEstadoTiempo } from '@/lib/serviciosProgramados';
import { showToast } from '@/components/Toast';

const ESTADO_CFG: Record<Servicio['estado'], { label: string; cls: string }> = {
  programado: { label: 'Programado', cls: 'bg-surface-2 text-muted' },
  en_sitio: { label: '📍 En sitio', cls: 'bg-amber/15 text-amber' },
  en_curso: { label: '● En curso', cls: 'bg-teal/15 text-teal' },
  concluido: { label: '✓ Concluido', cls: 'bg-teal/15 text-teal' },
};

function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

type Grupo = { grupoId: string; proyecto: string; dias: Servicio[] };

export default function ServiciosSupervisorList() {
  const theme = useTheme();
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [tecnicos, setTecnicos] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNuevo, setShowNuevo] = useState(false);
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(null);

  const [proyecto, setProyecto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [duracionMin, setDuracionMin] = useState(120);
  const [diasTotales, setDiasTotales] = useState(1);
  const [tecnicoIds, setTecnicoIds] = useState<string[]>([]);
  const [tareas, setTareas] = useState<string[]>(['']);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([listarServiciosSupervisor(), listarTecnicos()]);
      setServicios(s);
      setTecnicos(t);
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar los servicios');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  const grupos = useMemo<Grupo[]>(() => {
    const mapa: Record<string, Grupo> = {};
    servicios.forEach((s) => {
      if (!mapa[s.grupo_id]) mapa[s.grupo_id] = { grupoId: s.grupo_id, proyecto: s.proyecto, dias: [] };
      mapa[s.grupo_id].dias.push(s);
    });
    Object.values(mapa).forEach((g) => g.dias.sort((a, b) => a.numero_dia - b.numero_dia));
    return Object.values(mapa).sort((a, b) => {
      const fa = a.dias[a.dias.length - 1]?.created_at || '';
      const fb = b.dias[b.dias.length - 1]?.created_at || '';
      return fb.localeCompare(fa);
    });
  }, [servicios]);

  function toggleTecnico(id: string) {
    setTecnicoIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function updateTarea(i: number, value: string) {
    setTareas((prev) => prev.map((t, idx) => (idx === i ? value : t)));
  }
  function addTarea() {
    setTareas((prev) => [...prev, '']);
  }
  function removeTarea(i: number) {
    setTareas((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : ['']));
  }

  async function handleCrear() {
    if (!proyecto.trim()) {
      setError('Falta el nombre del proyecto/cliente.');
      return;
    }
    if (tecnicoIds.length === 0) {
      setError('Selecciona al menos un técnico.');
      return;
    }
    const tareasLimpias = tareas.map((t) => t.trim()).filter(Boolean);
    setGuardando(true);
    setError(null);
    try {
      await crearServicio({
        proyecto: proyecto.trim(),
        descripcion: descripcion.trim(),
        fecha,
        duracionMin,
        tecnicoIds,
        tareas: tareasLimpias,
        diasTotales,
      });
      showToast(diasTotales > 1 ? `Proyecto programado (${diasTotales} días)` : 'Servicio programado', 'success');
      setShowNuevo(false);
      setProyecto(''); setDescripcion(''); setTecnicoIds([]); setTareas(['']); setDuracionMin(120); setDiasTotales(1);
      await cargar();
    } catch (e: any) {
      setError(e?.message || 'No se pudo programar el servicio.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="max-w-2xl lg:max-w-4xl mx-auto pb-28 lg:pb-16">
      <div className="sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link href="/dashboard" className="shrink-0 w-8 h-8 rounded-full border border-line-strong flex items-center justify-center active:scale-90 transition-transform">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
          <h1 className="font-display font-semibold text-base tracking-wide truncate">Servicios programados</h1>
        </div>
        <ThemeToggle />
      </div>

      <div className="px-4 pt-5">
        {!showNuevo ? (
          <button
            onClick={() => setShowNuevo(true)}
            className="w-full py-4 mb-5 rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-base tracking-wide shadow-glow-teal active:scale-[0.98] transition-transform"
          >
            + Programar servicio
          </button>
        ) : (
          <div className="glass rounded-2xl p-4 mb-5">
            <p className="font-display font-semibold text-[16px] mb-3">Nuevo servicio programado</p>

            <label className="text-[11px] uppercase tracking-wider text-muted block mb-1">Proyecto / Cliente</label>
            <input value={proyecto} onChange={(e) => setProyecto(e.target.value)} className="w-full px-3.5 py-2.5 mb-3 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14px]" placeholder="Ej. PRINT PACK — Etapa 4" />

            <label className="text-[11px] uppercase tracking-wider text-muted block mb-1">Descripción (opcional)</label>
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="w-full px-3.5 py-2.5 mb-3 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14px]" placeholder="Detalle breve del servicio" />

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-muted block mb-1">Fecha</label>
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14px]" />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-muted block mb-1">Duración estimada (min/día)</label>
                <input
                  type="number"
                  value={duracionMin === 0 ? '' : duracionMin}
                  onChange={(e) => setDuracionMin(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                  placeholder="120"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14px]"
                />
              </div>
            </div>

            <label className="text-[11px] uppercase tracking-wider text-muted block mb-1">¿Cuántos días va a durar este proyecto?</label>
            <input
              type="number"
              min={1}
              value={diasTotales === 0 ? '' : diasTotales}
              onChange={(e) => setDiasTotales(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
              placeholder="1"
              className="w-full px-3.5 py-2.5 mb-1 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14px]"
            />
            <p className="text-[11px] text-muted mb-3">
              No tienen que ser consecutivos — cada vez que el técnico vincule un reporte a este proyecto, se le va contando como "día 1", "día 2", etc. Si después necesitan más días de los que pongas aquí, se puede ampliar desde el detalle del proyecto.
            </p>

            <label className="text-[11px] uppercase tracking-wider text-muted block mb-1.5">Técnicos asignados</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {tecnicos.length === 0 && <p className="text-muted text-[12px]">No hay técnicos registrados.</p>}
              {tecnicos.map((t) => (
                <span
                  key={t.id}
                  onClick={() => toggleTecnico(t.id)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-medium cursor-pointer border ${
                    tecnicoIds.includes(t.id) ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line text-ink/80'
                  }`}
                >
                  {t.full_name}
                </span>
              ))}
            </div>

            <label className="text-[11px] uppercase tracking-wider text-muted block mb-1.5">Lista de tareas a realizar (por día)</label>
            {tareas.map((t, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <span className="text-[12px] text-muted w-5 shrink-0">{i + 1}.</span>
                <input
                  value={t}
                  onChange={(e) => updateTarea(i, e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[13.5px]"
                  placeholder="Ej. Instalar 10 detectores en nivel 1"
                />
                <button onClick={() => removeTarea(i)} className="text-red text-base shrink-0 active:scale-90 transition-transform">✕</button>
              </div>
            ))}
            <button onClick={addTarea} className="text-teal text-[13px] font-medium mb-4">+ Agregar tarea</button>

            {error && <p className="text-red text-[12px] mb-3">{error}</p>}

            <div className="flex gap-2">
              <button onClick={() => { setShowNuevo(false); setError(null); }} className="flex-1 py-2.5 rounded-xl border border-line-strong text-ink/80 text-[13px] font-medium active:scale-95 transition-transform">
                Cancelar
              </button>
              <button onClick={handleCrear} disabled={guardando} className="flex-1 py-2.5 rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold active:scale-95 transition-transform disabled:opacity-60">
                {guardando ? 'Guardando...' : diasTotales > 1 ? `Programar ${diasTotales} días` : 'Programar servicio'}
              </button>
            </div>
          </div>
        )}

        {loading && <p className="text-center text-muted py-10 text-sm">Cargando...</p>}
        {!loading && grupos.length === 0 && <p className="text-center text-muted py-10 text-sm">Todavía no hay servicios programados.</p>}

        <div className="flex flex-col gap-3">
          {grupos.map((g) => {
            const diasConReporte = g.dias.filter((d) => d.report_id).length;
            const abierto = grupoAbierto === g.grupoId;
            const diasTotalesGrupo = g.dias[0]?.dias_totales || g.dias.length;
            return (
              <div key={g.grupoId} className="rounded-2xl border-l-4 border-teal bg-surface overflow-hidden">
                <button
                  onClick={() => setGrupoAbierto(abierto ? null : g.grupoId)}
                  className="w-full text-left p-4 active:scale-[0.99] transition-transform"
                >
                  <div className="flex justify-between items-center gap-2">
                    <strong className="font-display font-bold text-[15px]">{g.proyecto}</strong>
                    <span className="text-[11px] text-muted shrink-0">{diasConReporte}/{diasTotalesGrupo} días con reporte</span>
                  </div>
                  <p className="text-[12px] text-muted mt-1">
                    {diasTotalesGrupo === 1 ? formatFecha(g.dias[0].fecha) : `${diasTotalesGrupo} días programados`} · toca para {abierto ? 'ocultar' : 'ver'} el detalle por día
                  </p>
                </button>

                {abierto && (
                  <div className="border-t border-line px-3 pb-3 pt-1 flex flex-col gap-2">
                    {g.dias.map((d) => {
                      const et = calcularEstadoTiempo(d);
                      return (
                        <Link
                          key={d.id}
                          href={`/dashboard/servicios/${d.id}`}
                          className="flex justify-between items-center gap-2 rounded-xl bg-surface-2 px-3.5 py-2.5 active:scale-[0.98] transition-transform"
                        >
                          <div className="min-w-0">
                            <span className="text-[13.5px] font-semibold">{g.proyecto} · Día {d.numero_dia}/{d.dias_totales}</span>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ESTADO_CFG[d.estado].cls}`}>{ESTADO_CFG[d.estado].label}</span>
                              {d.report_id && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal/15 text-teal">📄 Con reporte</span>}
                              {et.tipo === 'retraso' && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red/15 text-red">⚠ Retraso {et.minutos}min</span>}
                              {et.tipo === 'excedido' && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber/15 text-amber">⏱ Excedido</span>}
                            </div>
                          </div>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted shrink-0"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
