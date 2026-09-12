'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import Logo from '@/components/Logo';
import {
  Servicio, Tarea, Evento, Auditoria,
  obtenerServicioCompleto, editarServicio, reasignarTecnicos, listarTecnicos, calcularEstadoTiempo, agregarDiasAGrupo, motivoNoEditable,
  calcularProgresoTareas, eliminarProyecto, eliminarDiaDeProyecto, reprogramarDia,
} from '@/lib/serviciosProgramados';
import ProgressBar from '@/components/ProgressBar';
import { ChevronLeft, MapPin, Play, Check, Clock, Trash2, AlertTriangle, Timer, Flag, Camera, Plus, Users, Pencil, CalendarClock, PackageCheck, Bookmark, ChevronRight, X, TrendingUp, CalendarX, Lock } from 'lucide-react';
import { calcularResultadoServicio } from '@/lib/resultadoServicio';
import InsumosChecklist from '@/components/InsumosChecklist';
import ModalOverlay from '@/components/ModalOverlay';
import { listarPlantillas, guardarComoPlantilla, obtenerInsumos, resumenDeChecklist, PlantillaInsumos, ResumenChecklist } from '@/lib/insumos';
import { ResultadoBadges } from '@/components/ResultadoServicioBadges';
import { createClient } from '@/lib/supabaseClient';
import { mapsLink } from '@/lib/geolocation';
import { showToast } from '@/components/Toast';
import { hoyLocal } from '@/lib/fechaHoy';

const ESTADO_CFG: Record<Servicio['estado'], { label: string; cls: string }> = {
  programado: { label: 'Programado', cls: 'bg-surface-2 text-muted' },
  en_sitio: { label: 'En sitio', cls: 'bg-amber/15 text-amber' },
  en_curso: { label: 'En curso', cls: 'bg-teal/15 text-teal' },
  concluido: { label: 'Concluido', cls: 'bg-teal/15 text-teal' },
};

function nombre(profiles: any): string {
  if (!profiles) return '—';
  if (Array.isArray(profiles)) return profiles[0]?.full_name || '—';
  return profiles.full_name || '—';
}
function fmtHora(iso: string) {
  return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', hour12: false, minute: '2-digit' });
}

export default function ServicioSupervisorDetail({ servicioId }: { servicioId: string }) {
  const router = useRouter();
  const [eliminando, setEliminando] = useState(false);
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
  const [fechasNuevas, setFechasNuevas] = useState<string[]>([]);
  const [showReprogramar, setShowReprogramar] = useState(false);
  const [showEliminarDia, setShowEliminarDia] = useState(false);
  const [motivoEliminar, setMotivoEliminar] = useState('');
  const [eliminandoDia, setEliminandoDia] = useState(false);
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [reprogramando, setReprogramando] = useState(false);
  const [plantillas, setPlantillas] = useState<PlantillaInsumos[]>([]);
  const [showInsumos, setShowInsumos] = useState(false);
  const [resumenInsumos, setResumenInsumos] = useState<ResumenChecklist | null>(null);
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
        // Se indexa por el path que devuelve el propio resultado: si alguno
        // falla, el orden deja de coincidir con el arreglo original.
        data.forEach((d: any, i: number) => {
          const clave = d.path || paths[i];
          if (d.signedUrl) map[clave] = d.signedUrl;
        });
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

  useEffect(() => {
    if (!showAgregarDias) return;
    setFechasNuevas((prev) => {
      const copia = [...prev];
      const base = servicio?.fecha || hoyLocal();
      while (copia.length < diasNuevos) {
        const [y, m, d] = (copia[copia.length - 1] || base).split('-').map(Number);
        const sig = new Date(y, m - 1, d + 1);
        copia.push(`${sig.getFullYear()}-${String(sig.getMonth() + 1).padStart(2, '0')}-${String(sig.getDate()).padStart(2, '0')}`);
      }
      return copia.slice(0, Math.max(0, diasNuevos));
    });
  }, [diasNuevos, showAgregarDias, servicio?.fecha]);

  useEffect(() => {
    listarPlantillas().then(setPlantillas).catch(() => {});
  }, []);

  async function recargarResumen() {
    if (!servicio) return;
    try {
      setResumenInsumos(await resumenDeChecklist(servicio.grupo_id));
    } catch { /* el resumen es informativo; si falla no bloquea la pantalla */ }
  }

  useEffect(() => { recargarResumen(); }, [servicio?.grupo_id]);

  async function handleGuardarPlantilla() {
    if (!servicio) return;
    const nombre = prompt('¿Con qué nombre guardas esta lista? (ej. Instalación de paneles)');
    if (!nombre || !nombre.trim()) return;
    try {
      const actuales = await obtenerInsumos(servicio.grupo_id, servicio.id);
      if (actuales.length === 0) {
        alert('La lista está vacía; agrega herramienta o material antes de guardarla como plantilla.');
        return;
      }
      await guardarComoPlantilla(nombre, actuales);
      setPlantillas(await listarPlantillas());
      showToast('Plantilla guardada', 'success');
    } catch (e: any) {
      alert('No se pudo guardar: ' + (e?.message || 'error'));
    }
  }

  async function handleEliminarDia() {
    if (!servicio) return;
    if (!motivoEliminar.trim()) {
      alert('Escribe por qué se elimina este día.');
      return;
    }
    setEliminandoDia(true);
    try {
      await eliminarDiaDeProyecto(servicio.id, motivoEliminar);
      showToast('Día eliminado del proyecto', 'success');
      router.push('/dashboard/servicios');
    } catch (e: any) {
      alert(e?.message || 'No se pudo eliminar el día');
      setEliminandoDia(false);
    }
  }

  async function handleReprogramar() {
    if (!servicio || !nuevaFecha) return;
    setReprogramando(true);
    try {
      await reprogramarDia(servicio.id, nuevaFecha);
      showToast('Fecha reprogramada', 'success');
      setShowReprogramar(false);
      setNuevaFecha('');
      await cargar();
    } catch (e: any) {
      alert('No se pudo reprogramar: ' + (e?.message || 'error desconocido'));
    } finally {
      setReprogramando(false);
    }
  }

  async function handleAgregarDias() {
    if (!servicio || diasNuevos < 1) return;
    setAgregandoDias(true);
    try {
      const fechas = fechasNuevas.filter(Boolean);
      if (fechas.length === 0) {
        alert('Indica la fecha de cada día nuevo.');
        setAgregandoDias(false);
        return;
      }
      await agregarDiasAGrupo(servicio.grupo_id, fechas);
      showToast(`Se agregaron ${fechas.length} día(s) más al proyecto`, 'success');
      setShowAgregarDias(false);
      setDiasNuevos(1);
      setFechasNuevas([]);
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

  async function handleEliminarProyecto() {
    if (!servicio) return;
    const esMulti = servicio.dias_totales > 1;
    const queSeElimina = esMulti
      ? `el proyecto COMPLETO «${servicio.proyecto}» (los ${servicio.dias_totales} días)`
      : `el servicio «${servicio.proyecto}»`;
    if (!confirm(`¿Eliminar ${queSeElimina}?\n\nSe borrarán su checklist, evidencias, eventos y fotos. Los reportes de servicio formales que estén vinculados NO se eliminan, solo quedan desvinculados.`)) return;
    if (!confirm('Esta acción es PERMANENTE y quedará registrada en Eventos con tu nombre. ¿Confirmar eliminación?')) return;
    setEliminando(true);
    try {
      await eliminarProyecto(servicio.grupo_id);
      showToast(esMulti ? 'Proyecto eliminado' : 'Servicio eliminado', 'success');
      router.push('/dashboard/servicios');
    } catch (e: any) {
      alert('No se pudo eliminar: ' + (e?.message || 'error desconocido'));
      setEliminando(false);
    }
  }

  if (loading || !servicio) {
    return (
      <div className="max-w-2xl mx-auto pb-28 px-4 pt-10">
        <p className="text-muted text-center">Cargando...</p>
      </div>
    );
  }

  const progreso = calcularProgresoTareas(tareas);
  const estadoTiempo = calcularEstadoTiempo(servicio);
  // Null cuando sí se puede editar; si no, el texto que explica por qué no.
  const bloqueo = motivoNoEditable(servicio.estado);

  return (
    <div className="max-w-2xl lg:max-w-5xl mx-auto pb-28 lg:pb-16 lg:px-6">
      <div className="sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link href="/dashboard/servicios" aria-label="Volver" className="shrink-0 w-11 h-11 -ml-1.5 rounded-full flex items-center justify-center active:scale-90 transition-transform">
            <ChevronLeft size={24} strokeWidth={2.4} />
          </Link>
          <Logo size={30} />
          <div className="min-w-0">
            <h1 className="font-display font-semibold text-base tracking-wide truncate">{servicio.proyecto}</h1>
            <p className="text-[11px] text-muted">Día {servicio.numero_dia} de {servicio.dias_totales}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ThemeToggle />
          <LogoutButton compacto />
        </div>
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
            {!bloqueo && (
              <button onClick={() => setEditando((v) => !v)} className="text-teal text-[12px] font-medium">{editando ? 'Cancelar' : 'Editar'}</button>
            )}
          </div>

          {/* Se dice por qué no hay botón. Un botón que desaparece sin
              explicación se lee como una falla de la app. */}
          {bloqueo && (
            <p className="text-[12px] text-muted mb-3 flex items-start gap-1.5">
              <Lock size={13} strokeWidth={2.4} className="text-muted shrink-0 mt-0.5" />
              <span>{bloqueo}</span>
            </p>
          )}

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
                <p className="text-[13px] font-semibold text-red mt-2.5 flex items-center gap-1.5"><AlertTriangle size={14} strokeWidth={2.6} />Se retrasó {estadoTiempo.minutos} min sobre lo estimado</p>
              )}
              {estadoTiempo.tipo === 'excedido' && (
                <p className="text-[13px] font-semibold text-amber mt-2.5 flex items-center gap-1.5"><Timer size={14} strokeWidth={2.6} />Ya lleva {estadoTiempo.minutos} min de más y sigue sin concluir</p>
              )}
              {estadoTiempo.tipo === 'a_tiempo' && (
                <div className="mt-2.5"><ResultadoBadges resultado={calcularResultadoServicio(servicio, progreso)} /></div>
              )}
            </>

          ) : (
            <div>
              <label className="text-[13px] text-ink/75 block mb-1.5">Proyecto</label>
              <input value={proyecto} onChange={(e) => setProyecto(e.target.value)} className="w-full px-3 py-2 mb-2.5 rounded-xl bg-surface-2 border border-line text-[13.5px]" />
              <label className="text-[13px] text-ink/75 block mb-1.5">Descripción</label>
              <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="w-full px-3 py-2 mb-2.5 rounded-xl bg-surface-2 border border-line text-[13.5px]" />
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="text-[13px] text-ink/75 block mb-1.5">Fecha</label>
                  <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line text-[13.5px]" />
                </div>
                <div>
                  <label className="text-[13px] text-ink/75 block mb-1.5">Duración (min)</label>
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

          {/* Reprogramar la fecha de este día */}
          {servicio.estado !== 'concluido' && (
            !showReprogramar ? (
              <button
                onClick={() => { setShowReprogramar(true); setNuevaFecha(servicio.fecha); }}
                className="text-amber text-[14px] font-medium mt-3 min-h-[44px] flex items-center gap-1.5"
              >
                <CalendarClock size={16} strokeWidth={2.4} />
                Cambiar la fecha de este día
              </button>
            ) : (
              <div className="mt-3 p-3.5 rounded-xl bg-amber/10 border border-amber/30">
                <label className="text-[13px] text-ink/75 block mb-1.5">Nueva fecha para el día {servicio.numero_dia}</label>
                <input
                  type="date"
                  value={nuevaFecha}
                  onChange={(e) => setNuevaFecha(e.target.value)}
                  className="w-full px-3 min-h-[46px] mb-2.5 rounded-lg bg-surface border border-line text-[14.5px]"
                />
                <p className="text-[12.5px] text-muted mb-2.5 leading-relaxed">
                  Si la nueva fecha altera el orden, los días del proyecto se renumeran para que sigan siendo cronológicos. Queda registrado en Eventos con tu nombre.
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setShowReprogramar(false)} className="flex-1 min-h-[46px] border border-line-strong text-ink/80 rounded-xl text-[14px]">Cancelar</button>
                  <button onClick={handleReprogramar} disabled={reprogramando || !nuevaFecha} className="flex-1 min-h-[46px] bg-amber text-inkOnAccent rounded-xl text-[14px] font-semibold disabled:opacity-60">
                    {reprogramando ? 'Guardando...' : 'Reprogramar'}
                  </button>
                </div>
              </div>
            )
          )}

          {/* Cancelar un día concreto sin tocar el resto del proyecto */}
          {servicio.dias_totales > 1 && servicio.estado !== 'concluido' && !servicio.report_id && (
            <button
              onClick={() => { setShowEliminarDia(true); setMotivoEliminar(''); }}
              className="text-red text-[14px] font-medium mt-3 min-h-[44px] flex items-center gap-1.5"
            >
              <CalendarX size={16} strokeWidth={2.4} />
              Eliminar este día del proyecto
            </button>
          )}

          {!showAgregarDias ? (
            <button onClick={() => setShowAgregarDias(true)} className="text-teal text-[14px] font-medium mt-3 min-h-[44px] flex items-center gap-1.5">
              <Plus size={16} strokeWidth={2.6} />
              Ampliar este proyecto a más días
            </button>
          ) : (
            <div className="mt-3 p-3 rounded-xl bg-surface-2 border border-line">
              <label className="text-[13px] text-ink/75 block mb-1.5">¿Cuántos días más se necesitan?</label>
              <input
                type="number"
                min={1}
                value={diasNuevos === 0 ? '' : diasNuevos}
                onChange={(e) => setDiasNuevos(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                placeholder="1"
                className="w-full px-3 min-h-[46px] mb-2.5 rounded-lg bg-surface border border-line text-[14.5px]"
              />
              {fechasNuevas.map((f, i) => (
                <div key={i} className="flex items-center gap-2.5 mb-2">
                  <span className="text-[13px] text-muted w-20 shrink-0">Día {(servicio.dias_totales || 0) + i + 1}</span>
                  <input
                    type="date"
                    value={f}
                    onChange={(e) => setFechasNuevas((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))}
                    className="flex-1 px-3 min-h-[46px] rounded-lg bg-surface border border-line text-[14.5px]"
                  />
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <button onClick={() => setShowAgregarDias(false)} className="flex-1 min-h-[46px] border border-line-strong text-ink/80 rounded-xl text-[14px]">Cancelar</button>
                <button onClick={handleAgregarDias} disabled={agregandoDias || diasNuevos < 1} className="flex-1 min-h-[46px] bg-teal text-inkOnAccent rounded-xl text-[14px] font-semibold disabled:opacity-60">
                  {agregandoDias ? 'Agregando...' : 'Agregar días'}
                </button>
              </div>
              <p className="text-[12.5px] text-muted mt-2 leading-relaxed">Los días nuevos copian los mismos técnicos del último día — el checklist es uno solo para todo el proyecto, así que verán las tareas que sigan pendientes.</p>
            </div>
          )}
        </div>

        {/* Técnicos asignados */}
        <div className="glass rounded-2xl p-4 mb-4">
          <div className="flex justify-between items-center mb-2.5">
            <div className="text-[11px] uppercase tracking-wider text-muted">Técnicos asignados</div>
            {!bloqueo && (
              <button onClick={abrirEditorTecnicos} className="text-teal text-[12px] font-medium">Reasignar</button>
            )}
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

        {servicio.dias_totales > 1 && (
          <Link
            href={`/dashboard/servicios/proyecto/${servicio.grupo_id}`}
            className="flex items-center justify-between gap-2 mb-4 px-4 min-h-[50px] rounded-2xl bg-surface-2 border border-line text-[14.5px] font-medium active:scale-[0.99] transition-transform"
          >
            <span className="flex items-center gap-2">
              <TrendingUp size={17} strokeWidth={2.4} className="text-teal" />
              Ver el avance de los {servicio.dias_totales} días
            </span>
            <ChevronRight size={17} strokeWidth={2.4} className="text-muted" />
          </Link>
        )}

        {/* Lista de carga: resumen en una fila. El checklist completo se abre
            aparte para no saturar el detalle del servicio. */}
        <button
          onClick={() => setShowInsumos(true)}
          className="w-full glass rounded-2xl p-4 mb-4 text-left active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center justify-between gap-2.5 mb-2.5">
            <p className="font-display font-semibold text-[15px] flex items-center gap-2 min-w-0">
              <PackageCheck size={18} strokeWidth={2.3} className="text-teal shrink-0" />
              <span className="truncate">Herramienta y material</span>
            </p>
            <ChevronRight size={18} strokeWidth={2.4} className="text-muted shrink-0" />
          </div>

          {resumenInsumos && resumenInsumos.total > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2.5">
              <ResumenDato label="Herramienta" valor={String(resumenInsumos.herramienta)} />
              <ResumenDato label="Material" valor={String(resumenInsumos.material)} />
              <ResumenDato label="Equipo" valor={String(resumenInsumos.equipo)} />
              <ResumenDato
                label="Entrega al técnico"
                valor={resumenInsumos.entregadoEn
                  ? new Date(resumenInsumos.entregadoEn).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
                  : 'Pendiente'}
                tono={resumenInsumos.entregadoEn ? 'teal' : 'amber'}
              />
            </div>
          ) : (
            <p className="text-[13px] text-muted">Sin herramienta ni material capturado. Toca para agregar.</p>
          )}
        </button>

        {/* Checklist con evidencia */}
        <div className="glass rounded-2xl p-4 mb-4">
          <div className="flex justify-between items-center mb-2">
            <div className="text-[11px] uppercase tracking-wider text-muted">
              Lista de tareas{servicio.dias_totales > 1 ? ' (compartida entre los días del proyecto)' : ''}
            </div>
            <span className={`text-[13px] font-display font-bold ${progreso.pct >= 100 ? 'text-teal' : 'text-amber'}`}>{progreso.pct}%</span>
          </div>
          {progreso.total > 0 && (
            <div className="mb-3">
              <ProgressBar pct={progreso.pct} />
              <p className="text-[11px] text-muted mt-1">{progreso.completadas}/{progreso.total} tareas completadas{servicio.dias_totales > 1 ? ' · avance de todo el proyecto' : ''}</p>
            </div>
          )}
          <div className="flex flex-col gap-2.5">
            {tareas.map((t) => (
              <div key={t.id} className="p-3 rounded-xl bg-surface-2 border border-line">
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold ${t.completada ? 'bg-teal text-inkOnAccent' : 'border border-line-strong'}`}>
                    {t.completada ? <Check size={14} strokeWidth={3.2} className="text-inkOnAccent" /> : null}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13.5px] ${t.completada ? '' : 'text-muted'}`}>{t.descripcion}</p>
                    {!t.completada && t.avance_pct > 0 && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <ProgressBar pct={t.avance_pct} className="flex-1 max-w-[150px]" />
                        <span className="text-[11px] font-bold text-amber">{t.avance_pct}%</span>
                      </div>
                    )}
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
                  <span className="font-semibold flex items-center gap-1.5">
                    {e.tipo === 'llegada' ? <><MapPin size={13} strokeWidth={2.6} />Llegada a sitio</>
                      : e.tipo === 'inicio' ? <><Play size={13} strokeWidth={2.6} />Inicio</>
                      : e.tipo === 'retraso' ? <><AlertTriangle size={13} strokeWidth={2.6} />Retraso</>
                      : e.tipo === 'cierre' ? <><Flag size={13} strokeWidth={2.6} />Cierre</>
                      : e.tipo === 'avance' ? <><Timer size={13} strokeWidth={2.6} />Avance parcial</>
                      : <><Camera size={13} strokeWidth={2.6} />Evidencia</>}
                  </span>
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

        {/* Zona de peligro */}
        <div className="mt-5 pt-4 border-t border-dashed border-red/30">
          <button
            onClick={handleEliminarProyecto}
            disabled={eliminando}
            className="w-full py-2.5 rounded-xl border border-red/40 text-red text-[13px] font-semibold active:scale-95 transition-transform disabled:opacity-60"
          >
            {eliminando
              ? 'Eliminando...'
              : servicio.dias_totales > 1
              ? `Eliminar el proyecto completo (${servicio.dias_totales} días)`
              : 'Eliminar este servicio'}
          </button>
          <p className="text-[11px] text-muted mt-1.5 text-center">Acción permanente. Quedará registrada en la pestaña Eventos.</p>
        </div>
      </div>
      {/* Eliminar un día: el motivo es obligatorio porque es lo que después
          explica en Eventos por qué el proyecto duró menos de lo planeado. */}
      {showEliminarDia && servicio && (
        <ModalOverlay onClose={() => setShowEliminarDia(false)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto">
            <p className="font-display font-semibold text-[16px] mb-1">
              Eliminar el día {servicio.numero_dia} de {servicio.dias_totales}
            </p>
            <p className="text-[13px] text-muted mb-3.5 leading-relaxed">
              El proyecto quedará en {servicio.dias_totales - 1} día(s). Los días siguientes conservan su fecha y
              se recorren en la numeración. Queda registrado en Eventos con tu nombre.
            </p>

            <label className="text-[13px] text-ink/75 block mb-1.5">¿Por qué se elimina?</label>
            <textarea
              value={motivoEliminar}
              onChange={(e) => setMotivoEliminar(e.target.value)}
              placeholder="El cliente no se encuentra, no llegó el equipo para la instalación…"
              className="w-full px-3 py-2.5 mb-4 rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[14px] min-h-[90px]"
            />

            <div className="flex gap-2">
              <button
                onClick={() => setShowEliminarDia(false)}
                className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleEliminarDia}
                disabled={eliminandoDia || !motivoEliminar.trim()}
                className="flex-1 min-h-[48px] rounded-xl bg-red text-white text-[14.5px] font-semibold disabled:opacity-50"
              >
                {eliminandoDia ? 'Eliminando...' : 'Eliminar el día'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Checklist completo, fuera del flujo del detalle */}
      {showInsumos && servicio && (
        <ModalOverlay onClose={() => setShowInsumos(false)}>
          <div className="glass-strong rounded-3xl max-w-2xl w-full flex flex-col max-h-[92vh] sm:max-h-[85vh]">
            {/* Encabezado fijo: antes se iba con el scroll y quedaba cortado */}
            <div className="px-5 pt-5 pb-3 shrink-0 border-b border-line">
              <div className="flex items-start justify-between gap-3 mb-1">
                <p className="font-display font-semibold text-[17px]">Herramienta y material</p>
                <button
                  onClick={() => setShowInsumos(false)}
                  aria-label="Cerrar"
                  className="w-10 h-10 -mr-1.5 -mt-1 flex items-center justify-center active:scale-90 transition-transform shrink-0"
                >
                  <X size={20} strokeWidth={2.5} />
                </button>
              </div>
              <p className="text-[12.5px] text-muted leading-relaxed">
                {servicio.proyecto} · Día {servicio.numero_dia}. La lista es del proyecto; la verificación de salida y retorno la hace el técnico cada día.
              </p>
            </div>

            <div className="px-5 py-4 overflow-y-auto flex-1">
              <button
                onClick={handleGuardarPlantilla}
                className="w-full min-h-[46px] mb-4 rounded-xl border border-line-strong text-ink/80 text-[14px] font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <Bookmark size={16} strokeWidth={2.3} />
                Guardar esta lista como plantilla
              </button>

              <InsumosChecklist
                grupoId={servicio.grupo_id}
                servicioId={servicio.id}
                proyecto={servicio.proyecto}
                puedeEditarTodo
                onCambio={recargarResumen}
              />
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

function ResumenDato({ label, valor, tono }: { label: string; valor: string; tono?: 'teal' | 'amber' }) {
  return (
    <div className="min-w-0">
      <p className="text-[11.5px] text-muted mb-0.5">{label}</p>
      <p className={`text-[15px] font-display font-bold truncate ${tono === 'teal' ? 'text-teal' : tono === 'amber' ? 'text-amber' : ''}`}>{valor}</p>
    </div>
  );
}
