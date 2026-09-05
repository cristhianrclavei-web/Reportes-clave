'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import {
  Servicio, Tarea, Evento, Auditoria,
  obtenerServicioCompleto, editarServicio, reasignarTecnicos, listarTecnicos, calcularEstadoTiempo, agregarDiasAGrupo,
} from '@/lib/serviciosProgramados';
import { createClient } from '@/lib/supabaseClient';
import { mapsLink } from '@/lib/geolocation';
import { showToast } from '@/components/Toast';

const ESTADO_CFG: Record<Servicio['estado'], { label: string; cls: string }> = {
  programado: { label: 'Programado', cls: 'bg-surface-2 text-muted' },
  en_sitio: { label: '📍 En sitio', cls: 'bg-amber/15 text-amber' },
  en_curso: { label: '● En curso', cls: 'bg-teal/15 text-teal' },
  concluido: { label: '✓ Concluido', cls: 'bg-teal/15 text-teal' },
};

function nombre(profiles: any): string {
  if (!profiles) return '—';
  if (Array.isArray(profiles)) return profiles[0]?.full_name || '—';
  return profiles.full_name || '—';
}
function fmtHora(iso: string) {
  return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function ServicioSupervisorDetail({ servicioId }: { servicioId: string }) {
  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [tecnicosAsignados, setTecnicosAsignados] = useState<any[]>([]);
  const [auditoria, setAuditoria] = useState<Auditoria[]>([]);
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({});
  const [folioReporte, setFolioReporte] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [editando, setEditando] = useState(false);
  const [proyecto, setProyecto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState('');
  const [duracionMin, setDuracionMin] = useState(0);
  const [guardando, setGuardando] = useState(false);

  const [editandoTecnicos, setEditandoTecnicos] = useState(false);
  const [showAgregarDias, setShowAgregarDias] = useState(false);
  const [diasNuevos, setDiasNuevos] = useState(1);
  const [agregandoDias, setAgregandoDias] = useState(false);
  const [todosTecnicos, setTodosTecnicos] = useState<{ id: string; full_name: string }[]>([]);
  const [tecnicoIdsSel, setTecnicoIdsSel] = useState<string[]>([]);

  async function cargar() {
    setLoading(true);
    const { servicio: s, tareas: t, eventos: e, tecnicos: tc, auditoria: a } = await obtenerServicioCompleto(servicioId);
    setServicio(s);
    setTareas(t);
    setEventos(e);
    setTecnicosAsignados(tc);
    setAuditoria(a);
    setProyecto(s.proyecto);
    setDescripcion(s.descripcion || '');
    setFecha(s.fecha);
    setDuracionMin(s.duracion_estimada_min);
    setTecnicoIdsSel(tc.map((x) => x.tecnico_id));

    const paths = [...t.filter((x) => x.foto_path).map((x) => x.foto_path as string), ...e.filter((x) => x.foto_path).map((x) => x.foto_path as string)];
    if (paths.length > 0) {
      const supabase = createClient();
      const { data } = await supabase.storage.from('evidencias').createSignedUrls(paths, 3600);
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((d, i) => { if (d.signedUrl) map[paths[i]] = d.signedUrl; });
        setFotoUrls(map);
      }
    }

    if (s.report_id) {
      const supabase = createClient();
      const { data: reportRow } = await supabase.from('reports').select('data').eq('id', s.report_id).single();
      setFolioReporte(reportRow?.data?.claveFormato || null);
    } else {
      setFolioReporte(null);
    }

    setLoading(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function handleGuardarEdicion() {
    if (!servicio) return;
    setGuardando(true);
    try {
      const cambios: string[] = [];
      if (proyecto !== servicio.proyecto) cambios.push(`proyecto: "${servicio.proyecto}" → "${proyecto}"`);
      if (descripcion !== (servicio.descripcion || '')) cambios.push('descripción actualizada');
      if (fecha !== servicio.fecha) cambios.push(`fecha: ${servicio.fecha} → ${fecha}`);
      if (duracionMin !== servicio.duracion_estimada_min) cambios.push(`duración estimada: ${servicio.duracion_estimada_min} → ${duracionMin} min`);

      if (cambios.length > 0) {
        await editarServicio(servicioId, { proyecto, descripcion, fecha, duracion_estimada_min: duracionMin }, cambios.join('; '));
        showToast('Servicio actualizado', 'success');
      }
      setEditando(false);
      await cargar();
    } catch (e: any) {
      alert('No se pudo guardar: ' + (e?.message || 'error desconocido'));
    } finally {
      setGuardando(false);
    }
  }

  async function handleAgregarDias() {
    if (!servicio || diasNuevos < 1) return;
    setAgregandoDias(true);
    try {
      await agregarDiasAGrupo(servicio.grupo_id, diasNuevos);
      showToast(`Se agregaron ${diasNuevos} día(s) más al proyecto`, 'success');
      setShowAgregarDias(false);
      setDiasNuevos(1);
      await cargar();
    } catch (e: any) {
      alert('No se pudo ampliar el proyecto: ' + (e?.message || 'error desconocido'));
    } finally {
      setAgregandoDias(false);
    }
  }

  async function abrirEditorTecnicos() {
    if (todosTecnicos.length === 0) setTodosTecnicos(await listarTecnicos());
    setEditandoTecnicos(true);
  }

  async function handleGuardarTecnicos() {
    setGuardando(true);
    try {
      const nombresAntes = tecnicosAsignados.map((t) => nombre(t.profiles)).join(', ');
      const nombresDespues = todosTecnicos.filter((t) => tecnicoIdsSel.includes(t.id)).map((t) => t.full_name).join(', ');
      await reasignarTecnicos(servicioId, tecnicoIdsSel, `Técnicos reasignados: "${nombresAntes}" → "${nombresDespues}"`);
      showToast('Técnicos actualizados', 'success');
      setEditandoTecnicos(false);
      await cargar();
    } catch (e: any) {
      alert('No se pudo guardar: ' + (e?.message || 'error desconocido'));
    } finally {
      setGuardando(false);
    }
  }

  if (loading || !servicio) {
    return (
      <div className="max-w-2xl mx-auto pb-28 px-4 pt-10">
        <p className="text-muted text-center">Cargando...</p>
      </div>
    );
  }

  const completadas = tareas.filter((t) => t.completada).length;
  const estadoTiempo = calcularEstadoTiempo(servicio);

  return (
    <div className="max-w-2xl lg:max-w-3xl mx-auto pb-28 lg:pb-16">
      <div className="sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link href="/dashboard/servicios" className="shrink-0 w-8 h-8 rounded-full border border-line-strong flex items-center justify-center active:scale-90 transition-transform">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
          <div className="min-w-0">
            <h1 className="font-display font-semibold text-base tracking-wide truncate">{servicio.proyecto}</h1>
            <p className="text-[11px] text-muted">Día {servicio.numero_dia} de {servicio.dias_totales}</p>
          </div>
        </div>
        <ThemeToggle />
      </div>

      <div className="px-4 pt-5">
        {servicio.report_id && (
          <button
            onClick={() => window.open(`/api/reports/${servicio.report_id}/pdf?t=${Date.now()}`, '_blank', 'noopener,noreferrer')}
            className="flex items-center gap-1.5 text-[13px] mb-2"
          >
            <span className="text-muted">Reporte generado — Folio:</span>
            <span className="text-[#3B82F6] font-semibold underline">{folioReporte || 'Ver PDF'}</span>
          </button>
        )}
        {/* Info general */}
        <div className="glass rounded-2xl p-4 mb-4">
          <div className="flex justify-between items-start mb-3">
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${ESTADO_CFG[servicio.estado].cls}`}>{ESTADO_CFG[servicio.estado].label}</span>
            <button onClick={() => setEditando((v) => !v)} className="text-teal text-[12px] font-medium">{editando ? 'Cancelar' : 'Editar'}</button>
          </div>

          {!editando ? (
            <>
              {servicio.descripcion && <p className="text-[13px] text-ink/85 mb-2">{servicio.descripcion}</p>}
              <div className="flex gap-4 text-[12px] text-muted flex-wrap">
                <span>Fecha: <b className="text-ink">{servicio.fecha}</b></span>
                <span>Duración estimada: <b className="text-ink">{servicio.duracion_estimada_min} min</b></span>
                {servicio.hora_llegada && <span>Llegada: <b className="text-ink">{fmtHora(servicio.hora_llegada)}</b></span>}
                {servicio.hora_fin && <span>Cierre: <b className="text-ink">{fmtHora(servicio.hora_fin)}</b></span>}
              </div>
              {estadoTiempo.tipo === 'retraso' && (
                <p className="text-[12px] font-semibold text-red mt-2.5">⚠ Se retrasó {estadoTiempo.minutos} min sobre lo estimado</p>
              )}
              {estadoTiempo.tipo === 'excedido' && (
                <p className="text-[12px] font-semibold text-amber mt-2.5">⏱ Ya lleva {estadoTiempo.minutos} min sobre lo estimado y sigue sin concluir</p>
              )}
              {estadoTiempo.tipo === 'a_tiempo' && (
                <p className="text-[12px] font-semibold text-teal mt-2.5">✓ Concluido dentro del tiempo estimado</p>
              )}
            </>

          ) : (
            <div>
              <label className="text-[11px] uppercase tracking-wider text-muted block mb-1">Proyecto</label>
              <input value={proyecto} onChange={(e) => setProyecto(e.target.value)} className="w-full px-3 py-2 mb-2.5 rounded-xl bg-surface-2 border border-line text-[13.5px]" />
              <label className="text-[11px] uppercase tracking-wider text-muted block mb-1">Descripción</label>
              <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="w-full px-3 py-2 mb-2.5 rounded-xl bg-surface-2 border border-line text-[13.5px]" />
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-muted block mb-1">Fecha</label>
                  <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line text-[13.5px]" />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-muted block mb-1">Duración (min)</label>
                  <input
                    type="number"
                    value={duracionMin === 0 ? '' : duracionMin}
                    onChange={(e) => setDuracionMin(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                    placeholder="120"
                    className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line text-[13.5px]"
                  />
                </div>
              </div>
              <button onClick={handleGuardarEdicion} disabled={guardando} className="w-full py-2.5 rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold active:scale-95 transition-transform disabled:opacity-60">
                {guardando ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          )}

          {!showAgregarDias ? (
            <button onClick={() => setShowAgregarDias(true)} className="text-teal text-[12px] font-medium mt-3">
              + Ampliar este proyecto a más días
            </button>
          ) : (
            <div className="mt-3 p-3 rounded-xl bg-surface-2 border border-line">
              <label className="text-[11px] uppercase tracking-wider text-muted block mb-1.5">¿Cuántos días más se necesitan?</label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min={1}
                  value={diasNuevos === 0 ? '' : diasNuevos}
                  onChange={(e) => setDiasNuevos(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                  placeholder="1"
                  className="flex-1 px-3 py-2 rounded-lg bg-surface border border-line text-[13px]"
                />
                <button onClick={() => setShowAgregarDias(false)} className="text-xs border border-line-strong text-ink/80 rounded-full px-3.5 py-2">Cancelar</button>
                <button onClick={handleAgregarDias} disabled={agregandoDias || diasNuevos < 1} className="text-xs bg-teal text-inkOnAccent rounded-full px-3.5 py-2 font-semibold disabled:opacity-60">
                  {agregandoDias ? 'Agregando...' : 'Agregar'}
                </button>
              </div>
              <p className="text-[11px] text-muted mt-1.5">Los días nuevos copian los mismos técnicos y checklist del último día del proyecto — se pueden editar después.</p>
            </div>
          )}
        </div>

        {/* Técnicos asignados */}
        <div className="glass rounded-2xl p-4 mb-4">
          <div className="flex justify-between items-center mb-2.5">
            <div className="text-[11px] uppercase tracking-wider text-muted">Técnicos asignados</div>
            <button onClick={abrirEditorTecnicos} className="text-teal text-[12px] font-medium">Reasignar</button>
          </div>
          {!editandoTecnicos ? (
            <div className="flex flex-wrap gap-2">
              {tecnicosAsignados.length === 0 && <p className="text-muted text-[13px]">Sin técnicos asignados.</p>}
              {tecnicosAsignados.map((t) => (
                <span key={t.tecnico_id} className="px-3 py-1.5 rounded-full bg-surface-2 text-[12px] font-medium">{nombre(t.profiles)}</span>
              ))}
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap gap-2 mb-3">
                {todosTecnicos.map((t) => (
                  <span
                    key={t.id}
                    onClick={() => setTecnicoIdsSel((prev) => (prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id]))}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-medium cursor-pointer border ${
                      tecnicoIdsSel.includes(t.id) ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line text-ink/80'
                    }`}
                  >
                    {t.full_name}
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditandoTecnicos(false)} className="flex-1 py-2 rounded-xl border border-line-strong text-[12.5px]">Cancelar</button>
                <button onClick={handleGuardarTecnicos} disabled={guardando} className="flex-1 py-2 rounded-xl bg-teal text-inkOnAccent text-[12.5px] font-semibold disabled:opacity-60">
                  {guardando ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Checklist con evidencia */}
        <div className="glass rounded-2xl p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <div className="text-[11px] uppercase tracking-wider text-muted">Lista de tareas</div>
            <span className="text-[12px] font-semibold text-teal">{completadas} / {tareas.length}</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {tareas.map((t) => (
              <div key={t.id} className="p-3 rounded-xl bg-surface-2 border border-line">
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold ${t.completada ? 'bg-teal text-inkOnAccent' : 'border border-line-strong'}`}>
                    {t.completada ? '✓' : ''}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13.5px] ${t.completada ? '' : 'text-muted'}`}>{t.descripcion}</p>
                    {t.completada && t.completada_en && (
                      <p className="text-[11px] text-muted mt-0.5">
                        {fmtHora(t.completada_en)}
                        {mapsLink(t.ubicacion) && (
                          <> · <a href={mapsLink(t.ubicacion)!} target="_blank" rel="noopener noreferrer" className="text-teal underline">ubicación</a></>
                        )}
                      </p>
                    )}
                    {t.nota && <p className="text-[12px] text-ink/80 mt-1">{t.nota}</p>}
                    {t.foto_path && fotoUrls[t.foto_path] && (
                      <img src={fotoUrls[t.foto_path]} className="w-full max-w-[220px] h-[110px] object-cover rounded-lg border border-line mt-2" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Línea de tiempo */}
        {eventos.length > 0 && (
          <div className="glass rounded-2xl p-4 mb-4">
            <div className="text-[11px] uppercase tracking-wider text-muted mb-3">Línea de tiempo</div>
            <div className="flex flex-col gap-3">
              {[...eventos].reverse().map((e) => (
                <div key={e.id} className="text-[12.5px]">
                  <span className="font-semibold">{e.tipo === 'llegada' ? '📍 Llegada a sitio' : e.tipo === 'inicio' ? '▶ Inicio' : e.tipo === 'retraso' ? '⚠ Retraso' : e.tipo === 'cierre' ? '✓ Cierre' : 'Evidencia'}</span>
                  <span className="text-muted"> · {fmtHora(e.created_at)}</span>
                  {mapsLink(e.ubicacion) && (
                    <>
                      {' · '}
                      <a href={mapsLink(e.ubicacion)!} target="_blank" rel="noopener noreferrer" className="text-teal underline">
                        Ver ubicación
                      </a>
                    </>
                  )}
                  {e.nota && <p className="text-ink/80 mt-0.5">{e.nota}</p>}
                  {e.foto_path && fotoUrls[e.foto_path] && (
                    <img src={fotoUrls[e.foto_path]} className="w-full max-w-[240px] h-[120px] object-cover rounded-lg border border-line mt-2" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Auditoría */}
        {auditoria.length > 0 && (
          <div className="glass rounded-2xl p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted mb-3">Historial de modificaciones</div>
            <div className="flex flex-col gap-2.5">
              {auditoria.map((a) => (
                <div key={a.id} className="text-[12px] border-l-2 border-amber pl-3">
                  <p className="text-ink/85">{a.cambio}</p>
                  <p className="text-muted mt-0.5">{nombre(a.profiles)} · {fmtHora(a.created_at)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
