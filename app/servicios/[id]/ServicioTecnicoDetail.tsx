'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import {
  Servicio, Tarea, Evento,
  obtenerServicioCompleto, marcarLlegada, iniciarServicio,
  completarTarea, registrarRetraso, concluirServicio, agregarEvidenciaExtra,
} from '@/lib/serviciosProgramados';
import { createClient } from '@/lib/supabaseClient';
import { showToast } from '@/components/Toast';

const MOTIVOS_RETRASO = [
  'Falta de material',
  'Acceso restringido en sitio',
  'Instrucciones del cliente',
  'Condiciones climáticas',
  'Problema técnico imprevisto',
  'Otro',
];

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
}

export default function ServicioTecnicoDetail({ servicioId }: { servicioId: string }) {
  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tareaActiva, setTareaActiva] = useState<Tarea | null>(null);
  const [notaTarea, setNotaTarea] = useState('');
  const [fotoTarea, setFotoTarea] = useState<File | null>(null);
  const [fotoTareaPreview, setFotoTareaPreview] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const [showRetraso, setShowRetraso] = useState(false);
  const [motivoRetraso, setMotivoRetraso] = useState(MOTIVOS_RETRASO[0]);
  const [comentarioRetraso, setComentarioRetraso] = useState('');
  const [fotoRetraso, setFotoRetraso] = useState<File | null>(null);
  const retrasoInputRef = useRef<HTMLInputElement>(null);

  const [ahora, setAhora] = useState(Date.now());

  const [showEvidenciaExtra, setShowEvidenciaExtra] = useState(false);
  const [notaEvidenciaExtra, setNotaEvidenciaExtra] = useState('');
  const [fotoEvidenciaExtra, setFotoEvidenciaExtra] = useState<File | null>(null);
  const [fotoEvidenciaExtraPreview, setFotoEvidenciaExtraPreview] = useState<string | null>(null);
  const fotoEvidenciaExtraRef = useRef<HTMLInputElement>(null);

  async function cargar() {
    setLoading(true);
    try {
      const { servicio: s, tareas: t, eventos: e } = await obtenerServicioCompleto(servicioId);
      setServicio(s);
      setTareas(t);
      setEventos(e);

      const paths = [
        ...t.filter((x) => x.foto_path).map((x) => x.foto_path as string),
        ...e.filter((x) => x.foto_path).map((x) => x.foto_path as string),
      ];
      if (paths.length > 0) {
        const supabase = createClient();
        const { data } = await supabase.storage.from('evidencias').createSignedUrls(paths, 3600);
        if (data) {
          const map: Record<string, string> = {};
          data.forEach((d, i) => { if (d.signedUrl) map[paths[i]] = d.signedUrl; });
          setFotoUrls(map);
        }
      }
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el servicio');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  // Reloj en vivo para detectar tiempo excedido sin recargar la página.
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  async function handleMarcarLlegada() {
    setBusy(true);
    try {
      await marcarLlegada(servicioId);
      showToast('Llegada registrada', 'success');
      await cargar();
    } catch (e: any) {
      alert('No se pudo registrar la llegada: ' + (e?.message || 'error'));
    } finally {
      setBusy(false);
    }
  }

  async function handleIniciar() {
    setBusy(true);
    try {
      await iniciarServicio(servicioId);
      showToast('Servicio iniciado', 'success');
      await cargar();
    } catch (e: any) {
      alert('No se pudo iniciar: ' + (e?.message || 'error'));
    } finally {
      setBusy(false);
    }
  }

  function abrirTarea(t: Tarea) {
    setTareaActiva(t);
    setNotaTarea('');
    setFotoTarea(null);
    setFotoTareaPreview(null);
  }

  function handleFotoTareaSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setFotoTarea(file);
      setFotoTareaPreview(URL.createObjectURL(file));
    }
  }

  async function handleGuardarTarea() {
    if (!tareaActiva) return;
    setBusy(true);
    try {
      await completarTarea(tareaActiva.id, servicioId, fotoTarea, notaTarea);
      showToast('Tarea completada', 'success');
      setTareaActiva(null);
      await cargar();
    } catch (e: any) {
      alert('No se pudo guardar: ' + (e?.message || 'error'));
    } finally {
      setBusy(false);
    }
  }

  function handleFotoEvidenciaExtraSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setFotoEvidenciaExtra(file);
      setFotoEvidenciaExtraPreview(URL.createObjectURL(file));
    }
  }

  async function handleGuardarEvidenciaExtra() {
    if (!notaEvidenciaExtra.trim() && !fotoEvidenciaExtra) {
      alert('Escribe una nota o agrega una foto.');
      return;
    }
    setBusy(true);
    try {
      await agregarEvidenciaExtra(servicioId, notaEvidenciaExtra, fotoEvidenciaExtra);
      showToast('Evidencia agregada', 'success');
      setShowEvidenciaExtra(false);
      setNotaEvidenciaExtra('');
      setFotoEvidenciaExtra(null);
      setFotoEvidenciaExtraPreview(null);
      await cargar();
    } catch (e: any) {
      alert('No se pudo guardar: ' + (e?.message || 'error'));
    } finally {
      setBusy(false);
    }
  }

  async function handleGuardarRetraso() {
    setBusy(true);
    try {
      await registrarRetraso(servicioId, motivoRetraso, comentarioRetraso, fotoRetraso);
      showToast('Motivo registrado', 'success');
      setShowRetraso(false);
      setComentarioRetraso('');
      setFotoRetraso(null);
      await cargar();
    } catch (e: any) {
      alert('No se pudo guardar: ' + (e?.message || 'error'));
    } finally {
      setBusy(false);
    }
  }

  async function handleConcluir() {
    const pendientes = tareas.filter((t) => !t.completada).length;
    if (pendientes > 0 && !confirm(`Todavía hay ${pendientes} tarea(s) sin completar. ¿Concluir de todas formas?`)) return;
    setBusy(true);
    try {
      await concluirServicio(servicioId);
      showToast('Servicio concluido', 'success');
      await cargar();
    } catch (e: any) {
      alert('No se pudo concluir: ' + (e?.message || 'error'));
    } finally {
      setBusy(false);
    }
  }

  if (loading || !servicio) {
    return <div className="max-w-2xl mx-auto pb-28 px-4 pt-10"><p className="text-muted text-center">Cargando...</p></div>;
  }

  const completadas = tareas.filter((t) => t.completada).length;
  const inicioReferencia = servicio.hora_inicio || servicio.hora_llegada;
  const minutosTranscurridos = inicioReferencia ? Math.floor((ahora - new Date(inicioReferencia).getTime()) / 60000) : 0;
  const tiempoExcedido = servicio.estado !== 'concluido' && inicioReferencia && minutosTranscurridos > servicio.duracion_estimada_min;

  let retrasoFinalMin: number | null = null;
  if (servicio.estado === 'concluido' && servicio.hora_fin && inicioReferencia) {
    const totalMin = Math.floor((new Date(servicio.hora_fin).getTime() - new Date(inicioReferencia).getTime()) / 60000);
    const diff = totalMin - servicio.duracion_estimada_min;
    if (diff > 0) retrasoFinalMin = diff;
  }

  return (
    <div className="max-w-2xl mx-auto pb-32">
      <div className="sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link href="/servicios" className="shrink-0 w-8 h-8 rounded-full border border-line-strong flex items-center justify-center active:scale-90 transition-transform">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
          <div className="min-w-0">
            <h1 className="font-display font-semibold text-base tracking-wide truncate">{servicio.proyecto}</h1>
            <p className="text-[11px] text-muted">Día {servicio.numero_dia} de {servicio.dias_totales}</p>
          </div>
        </div>
        <ThemeToggle />
      </div>

      {/* Barra de progreso + botón de término, estilo rondín */}
      <div className="px-4 pt-4 flex items-center gap-3">
        <div className="glass rounded-xl px-3.5 py-2 flex items-center gap-1.5 shrink-0">
          <span className="text-teal font-display font-bold text-[15px]">{completadas}</span>
          <span className="text-muted text-[13px]">|</span>
          <span className="text-muted text-[13px]">{tareas.length}</span>
        </div>
        {(servicio.estado === 'en_curso' || (servicio.estado === 'en_sitio' && tiempoExcedido)) && (
          <button
            onClick={handleConcluir}
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl bg-red text-white text-[13px] font-bold tracking-wide active:scale-95 transition-transform disabled:opacity-60"
          >
            TÉRMINO DE SERVICIO
          </button>
        )}
      </div>

      <div className="px-4 pt-4">
        {servicio.descripcion && <p className="text-[13px] text-muted mb-3">{servicio.descripcion}</p>}

        {/* Alerta de tiempo excedido */}
        {tiempoExcedido && (
          <div className="mb-4 p-3.5 rounded-2xl bg-red/10 border border-red/30">
            <p className="text-red text-[13px] font-semibold mb-2">⚠ Se superó el tiempo estimado ({servicio.duracion_estimada_min} min)</p>
            <button onClick={() => setShowRetraso(true)} className="text-xs bg-red text-white rounded-full px-3.5 py-2 font-semibold active:scale-95 transition-transform">
              Explicar por qué no ha concluido
            </button>
          </div>
        )}

        {/* Acciones de estado */}
        {servicio.estado === 'programado' && (
          <button onClick={handleMarcarLlegada} disabled={busy} className="w-full py-3.5 mb-4 rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] active:scale-95 transition-transform disabled:opacity-60">
            📍 Marcar llegada a sitio
          </button>
        )}
        {servicio.estado === 'en_sitio' && !tiempoExcedido && (
          <button onClick={handleIniciar} disabled={busy} className="w-full py-3.5 mb-4 rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] active:scale-95 transition-transform disabled:opacity-60">
            ▶ Iniciar servicio
          </button>
        )}
        {servicio.estado === 'en_sitio' && tiempoExcedido && (
          <p className="text-[12.5px] text-red mb-4">
            Ya se superó el tiempo estimado sin iniciar el servicio — usa "Término de servicio" arriba para cerrarlo con la justificación correspondiente.
          </p>
        )}
        {servicio.hora_llegada && (
          <p className="text-[12px] text-muted mb-4">Llegada registrada: {fmtHora(servicio.hora_llegada)}{servicio.hora_inicio && ` · Inicio: ${fmtHora(servicio.hora_inicio)}`}</p>
        )}

        {servicio.estado === 'concluido' && servicio.hora_fin && (
          <div className={`mb-4 p-3.5 rounded-2xl border ${retrasoFinalMin ? 'bg-red/10 border-red/30' : 'bg-teal/10 border-teal/30'}`}>
            <p className={`text-[13px] font-semibold ${retrasoFinalMin ? 'text-red' : 'text-teal'}`}>
              {retrasoFinalMin
                ? `⚠ El servicio se retrasó ${retrasoFinalMin} min sobre lo estimado (${servicio.duracion_estimada_min} min)`
                : `✓ Servicio concluido dentro del tiempo estimado (${servicio.duracion_estimada_min} min)`}
            </p>
            <p className="text-[12px] text-muted mt-1">Cierre: {fmtHora(servicio.hora_fin)}</p>
          </div>
        )}

        {error && <p className="text-red text-[13px] mb-3">{error}</p>}

        {/* Checklist estilo rondín */}
        {servicio.estado === 'programado' || servicio.estado === 'en_sitio' ? (
          <div className="mb-3 p-3.5 rounded-xl bg-amber/10 border border-amber/25 flex items-start gap-2.5">
            <span className="text-amber text-base leading-none">🔒</span>
            <p className="text-[12.5px] text-ink/80">
              {servicio.estado === 'programado'
                ? 'Marca tu llegada e inicia el servicio antes de poder registrar evidencias en las tareas.'
                : 'Inicia el servicio para poder empezar a registrar evidencias en las tareas.'}
            </p>
          </div>
        ) : null}
        <div className="flex flex-col gap-2.5">
          {tareas.map((t) => {
            const puedeCompletar = servicio.estado === 'en_curso';
            return (
            <div
              key={t.id}
              onClick={() => !t.completada && puedeCompletar && abrirTarea(t)}
              className={`rounded-xl px-4 py-3.5 flex items-center gap-3 ${
                t.completada
                  ? 'bg-surface-2'
                  : puedeCompletar
                  ? 'bg-surface-2 border border-dashed border-line-strong cursor-pointer active:scale-[0.99] transition-transform'
                  : 'bg-surface-2/50 border border-line opacity-60'
              }`}
            >
              <span className={t.completada ? 'text-teal' : 'text-muted'}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" /></svg>
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-[14px] font-medium ${t.completada ? '' : 'text-ink/85'}`}>{t.descripcion}</p>
              </div>
              {t.completada && t.completada_en ? (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-teal text-[13px] font-semibold">{fmtHora(t.completada_en)}</span>
                  {t.foto_path && <span className="text-[14px]">📷</span>}
                </div>
              ) : !puedeCompletar ? (
                <span className="text-faint text-[12px] shrink-0">🔒</span>
              ) : (
                <span className="text-faint text-[12px] shrink-0">Pendiente</span>
              )}
            </div>
            );
          })}
        </div>

        {tareas.length === 0 && <p className="text-muted text-sm text-center py-8">Este servicio no tiene tareas configuradas.</p>}

        {servicio.estado === 'en_curso' && !showEvidenciaExtra && (
          <button
            onClick={() => setShowEvidenciaExtra(true)}
            className="w-full mt-3 mb-1 py-3 rounded-2xl border border-dashed border-amber/50 text-amber text-[13px] font-semibold active:scale-95 transition-transform"
          >
            + Agregar evidencia adicional (fuera de las tareas)
          </button>
        )}

        {showEvidenciaExtra && (
          <div className="glass rounded-2xl p-4 mt-3 mb-1">
            <p className="font-display font-semibold text-[14px] mb-2.5">Evidencia adicional</p>
            <textarea
              value={notaEvidenciaExtra}
              onChange={(e) => setNotaEvidenciaExtra(e.target.value)}
              placeholder="Describe lo que estás documentando..."
              className="w-full px-3 py-2.5 mb-3 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[13.5px] min-h-[70px]"
            />
            <input ref={fotoEvidenciaExtraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFotoEvidenciaExtraSelect} />
            {fotoEvidenciaExtraPreview ? (
              <div className="relative mb-3">
                <img src={fotoEvidenciaExtraPreview} className="w-full h-[140px] object-cover rounded-xl border border-line" />
                <button
                  onClick={() => { setFotoEvidenciaExtra(null); setFotoEvidenciaExtraPreview(null); }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white text-sm flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button onClick={() => fotoEvidenciaExtraRef.current?.click()} className="w-full py-2.5 mb-3 rounded-xl border border-dashed border-teal/50 text-teal text-[13px] font-medium active:scale-95 transition-transform">
                📷 Tomar foto de evidencia
              </button>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowEvidenciaExtra(false); setNotaEvidenciaExtra(''); setFotoEvidenciaExtra(null); setFotoEvidenciaExtraPreview(null); }}
                className="flex-1 py-2.5 rounded-xl border border-line-strong text-ink/80 text-[13px] font-medium active:scale-95 transition-transform"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardarEvidenciaExtra}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold active:scale-95 transition-transform disabled:opacity-60"
              >
                {busy ? 'Guardando...' : 'Guardar evidencia'}
              </button>
            </div>
          </div>
        )}

        {eventos.filter((e) => e.tipo === 'evidencia').length > 0 && (
          <div className="mt-5">
            <div className="text-[11px] uppercase tracking-wider text-muted mb-2">Evidencias adicionales</div>
            <div className="flex flex-col gap-2.5">
              {eventos.filter((e) => e.tipo === 'evidencia').map((e) => (
                <div key={e.id} className="p-3 rounded-xl bg-surface-2 border border-line">
                  {e.nota && <p className="text-[12.5px] text-ink/85 mb-1.5">{e.nota}</p>}
                  {e.foto_path && fotoUrls[e.foto_path] && (
                    <img src={fotoUrls[e.foto_path]} className="w-full max-w-[280px] h-[140px] object-cover rounded-lg border border-line mb-1.5" />
                  )}
                  <p className="text-[11px] text-muted">{fmtHora(e.created_at)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Línea de tiempo de eventos */}
        {eventos.filter((e) => e.tipo === 'retraso').length > 0 && (
          <div className="mt-5">
            <div className="text-[11px] uppercase tracking-wider text-muted mb-2">Justificaciones registradas</div>
            {eventos.filter((e) => e.tipo === 'retraso').map((e) => (
              <div key={e.id} className="p-3 rounded-xl bg-amber/10 border border-amber/25 mb-2">
                <p className="text-[12.5px] text-ink/85">{e.nota}</p>
                <p className="text-[11px] text-muted mt-1">{fmtHora(e.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: completar tarea */}
      {tareaActiva && (
        <div onClick={() => setTareaActiva(null)} className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div onClick={(e) => e.stopPropagation()} className="glass-strong rounded-3xl max-w-md w-full p-5">
            <p className="font-display font-semibold text-[15px] mb-1">{tareaActiva.descripcion}</p>
            <p className="text-muted text-[12px] mb-3">Se registrará la hora y ubicación actual automáticamente.</p>

            <input ref={fotoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFotoTareaSelect} />

            {fotoTareaPreview ? (
              <div className="relative mb-3">
                <img src={fotoTareaPreview} className="w-full h-[150px] object-cover rounded-xl border border-line" />
                <button onClick={() => { setFotoTarea(null); setFotoTareaPreview(null); }} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white text-sm flex items-center justify-center">✕</button>
              </div>
            ) : (
              <button onClick={() => fotoInputRef.current?.click()} className="w-full py-3 mb-3 rounded-xl border border-dashed border-teal/50 text-teal text-[13px] font-medium active:scale-95 transition-transform">
                📷 Tomar foto de evidencia
              </button>
            )}

            <textarea
              value={notaTarea}
              onChange={(e) => setNotaTarea(e.target.value)}
              placeholder="Nota (opcional)"
              className="w-full px-3 py-2.5 mb-3 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[13.5px] min-h-[60px]"
            />

            <div className="flex gap-2">
              <button onClick={() => setTareaActiva(null)} className="flex-1 py-2.5 rounded-xl border border-line-strong text-ink/80 text-[13px] font-medium active:scale-95 transition-transform">
                Cancelar
              </button>
              <button onClick={handleGuardarTarea} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold active:scale-95 transition-transform disabled:opacity-60">
                {busy ? 'Guardando...' : 'Marcar como hecho'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: justificar retraso (estilo "Término de ronda") */}
      {showRetraso && (
        <div onClick={() => setShowRetraso(false)} className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div onClick={(e) => e.stopPropagation()} className="glass-strong rounded-3xl max-w-md w-full p-5">
            <p className="font-display font-semibold text-[15px] mb-3">El servicio superó el tiempo estimado, por favor explique por qué</p>

            <label className="text-[11px] uppercase tracking-wider text-muted block mb-1.5">Motivo</label>
            <select
              value={motivoRetraso}
              onChange={(e) => setMotivoRetraso(e.target.value)}
              className="w-full px-3 py-2.5 mb-3 rounded-xl bg-surface-2 border border-line focus:border-red focus:outline-none text-[13.5px]"
            >
              {MOTIVOS_RETRASO.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>

            <label className="text-[11px] uppercase tracking-wider text-muted block mb-1.5">Comentario</label>
            <textarea
              value={comentarioRetraso}
              onChange={(e) => setComentarioRetraso(e.target.value)}
              className="w-full px-3 py-2.5 mb-3 rounded-xl bg-surface-2 border border-line focus:border-red focus:outline-none text-[13.5px] min-h-[70px]"
            />

            <input ref={retrasoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFotoRetraso(e.target.files?.[0] || null)} />
            <button onClick={() => retrasoInputRef.current?.click()} className="w-full py-2.5 mb-3 rounded-xl border border-dashed border-red/50 text-red text-[13px] font-medium active:scale-95 transition-transform">
              {fotoRetraso ? `✓ ${fotoRetraso.name}` : '📷 Agregar foto de evidencia (opcional)'}
            </button>

            <div className="flex gap-2">
              <button onClick={() => setShowRetraso(false)} className="flex-1 py-2.5 rounded-xl border border-line-strong text-ink/80 text-[13px] font-medium active:scale-95 transition-transform">
                Cancelar
              </button>
              <button onClick={handleGuardarRetraso} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-red text-white text-[13px] font-semibold active:scale-95 transition-transform disabled:opacity-60">
                {busy ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
