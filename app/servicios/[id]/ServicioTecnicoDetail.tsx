'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import Logo from '@/components/Logo';
import {
  Servicio, Tarea, Evento,
  obtenerServicioCompleto, marcarLlegada, iniciarServicio, sigoAsignadoAServicio,
  registrarAvanceTarea, registrarRetraso, concluirServicio, agregarEvidenciaExtra,
  calcularProgresoTareas,
} from '@/lib/serviciosProgramados';
import ProgressBar from '@/components/ProgressBar';
import AvisoServicio from '@/components/AvisoServicio';
import {
  ChevronLeft, MapPin, Play, Check, Lock, Camera, AlertTriangle,
  Plus, X, CircleDashed, Clock, Flag, CalendarClock, PackageCheck, ChevronRight,
} from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { calcularResultadoServicio } from '@/lib/resultadoServicio';
import { evaluarVentanaServicio } from '@/lib/ventanaServicio';
import { ResultadoBadges } from '@/components/ResultadoServicioBadges';
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
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', hour12: false, minute: '2-digit' });
}

// Si la tarea se completó otro día (proyectos multi-día con checklist
// compartido), mostrar también la fecha; si fue hoy, solo la hora.
function fmtHoraOFecha(iso: string) {
  const d = new Date(iso);
  const hoy = new Date();
  const esHoy = d.toDateString() === hoy.toDateString();
  if (esHoy) return fmtHora(iso);
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', hour12: false, minute: '2-digit' });
}

export default function ServicioTecnicoDetail({ servicioId }: { servicioId: string }) {
  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Si al técnico lo quitaron del proyecto en una reasignación, ya no debe
  // poder operar este servicio aunque tenga la pantalla abierta o el enlace.
  const [sinAcceso, setSinAcceso] = useState(false);

  const [tareaActiva, setTareaActiva] = useState<Tarea | null>(null);
  const [notaTarea, setNotaTarea] = useState('');
  const [avanceSel, setAvanceSel] = useState(100);
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
      const asignado = await sigoAsignadoAServicio(servicioId);
      if (!asignado) {
        setSinAcceso(true);
        setLoading(false);
        return;
      }
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
    setAvanceSel(100); // lo más común es completar; para parcial se ajusta con un toque
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
      await registrarAvanceTarea(tareaActiva, servicioId, avanceSel, fotoTarea, notaTarea);
      showToast(avanceSel >= 100 ? 'Tarea completada' : `Avance del ${avanceSel}% registrado`, 'success');
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
    const esUltimoDia = !servicio || servicio.numero_dia >= servicio.dias_totales;
    if (pendientes > 0) {
      const msg = esUltimoDia
        ? `Todavía hay ${pendientes} tarea(s) sin completar y este es el último día del proyecto. ¿Concluir de todas formas?`
        : `Quedan ${pendientes} tarea(s) pendiente(s) — su avance registrado se conserva y seguirán disponibles el siguiente día del proyecto. ¿Concluir este día?`;
      if (!confirm(msg)) return;
    }
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

  if (sinAcceso) {
    return (
      <div className="max-w-2xl mx-auto px-4 pt-10">
        <div className="glass rounded-2xl p-5 text-center">
          <Lock size={28} strokeWidth={2.2} className="text-amber mx-auto mb-3" />
          <p className="font-display font-semibold text-[16px] mb-1.5">Este servicio ya no está asignado a ti</p>
          <p className="text-[13.5px] text-muted leading-relaxed mb-4">
            Tu supervisor reasignó el proyecto. Si crees que es un error, avísale para que te vuelva a incluir.
          </p>
          <Link href="/servicios" className="inline-flex items-center justify-center min-h-[48px] px-5 rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold">
            Ver mis servicios
          </Link>
        </div>
      </div>
    );
  }

  if (loading || !servicio) {
    return <div className="max-w-2xl mx-auto pb-28 px-4 pt-10"><p className="text-muted text-center">Cargando...</p></div>;
  }

  const progreso = calcularProgresoTareas(tareas);
  const resultado = calcularResultadoServicio(servicio, progreso);
  const ventana = evaluarVentanaServicio(servicio);
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
          <Link href="/servicios" aria-label="Volver a mis servicios" className="shrink-0 w-11 h-11 -ml-1.5 rounded-full flex items-center justify-center active:scale-90 transition-transform">
            <ChevronLeft size={24} strokeWidth={2.4} />
          </Link>
          <Logo size={30} />
          <div className="min-w-0">
            <h1 className="font-display font-semibold text-[17px] tracking-wide truncate leading-tight">{servicio.proyecto}</h1>
            <p className="text-[12.5px] text-muted">
              {servicio.dias_totales > 1 ? `Día ${servicio.numero_dia} de ${servicio.dias_totales}` : `${servicio.duracion_estimada_min} min estimados`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ThemeToggle />
          <LogoutButton compacto />
        </div>
      </div>

      {/* Avance: informativo, subordinado a la acción principal */}
      {progreso.total > 0 && (
        <div className="px-4 pt-4">
          <div className="flex items-baseline justify-between mb-1.5">
            <p className="text-[13px] text-muted">
              {progreso.completadas} de {progreso.total} tareas
              {servicio.dias_totales > 1 ? ' · todo el proyecto' : ''}
            </p>
            <span className={`font-display font-bold text-[15px] ${progreso.pct >= 100 ? 'text-teal' : 'text-amber'}`}>{progreso.pct}%</span>
          </div>
          <ProgressBar pct={progreso.pct} />
        </div>
      )}

      <div className="px-4 pt-4">
        {servicio.descripcion && <p className="text-[14px] text-ink/75 mb-4 leading-relaxed">{servicio.descripcion}</p>}

        {/* Solo mientras el día no se haya trabajado: después ya no hay nada
            que reprogramar y el canal correcto es el retraso. */}
        {servicio.estado === 'programado' && (
          <div className="mb-4">
          </div>
        )}

        {/* Alerta de tiempo excedido */}
        {tiempoExcedido && (
          <div className="mb-4 p-4 rounded-2xl bg-red/10 border border-red/30">
            <p className="text-red text-[14px] font-semibold mb-2.5 flex items-center gap-2">
              <AlertTriangle size={17} strokeWidth={2.4} className="shrink-0" />
              Se superó el tiempo estimado ({servicio.duracion_estimada_min} min)
            </p>
            <button
              onClick={() => setShowRetraso(true)}
              className="min-h-[44px] px-4 rounded-xl bg-red text-white text-[14px] font-semibold active:scale-95 transition-transform"
            >
              Explicar por qué no ha concluido
            </button>
          </div>
        )}

        {/* Avisar de un problema con este día. Va antes de la acción primaria:
            si el día no se va a poder, eso se resuelve antes de marcar llegada. */}
        <AvisoServicio
          servicioId={servicioId}
          fechaServicio={servicio.fecha}
          estado={servicio.estado}
        />

        {/* Acción primaria: lo primero que el técnico debe hacer ahora */}
        {/* Fuera de la fecha programada no se puede arrancar el servicio */}
        {!ventana.permitido && servicio.estado !== 'concluido' && (
          <div className="mb-4 p-4 rounded-2xl bg-amber/10 border border-amber/30 flex items-start gap-3">
            <CalendarClock size={20} strokeWidth={2.3} className="text-amber shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] font-semibold text-amber mb-1">Fuera de la fecha programada</p>
              <p className="text-[13.5px] text-ink/80 leading-relaxed">{ventana.motivo}</p>
            </div>
          </div>
        )}

        {servicio.estado === 'programado' && ventana.permitido && (
          <button
            onClick={handleMarcarLlegada}
            disabled={busy}
            className="w-full min-h-[56px] mb-4 rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[16px] flex items-center justify-center gap-2.5 active:scale-95 transition-transform disabled:opacity-60"
          >
            <MapPin size={20} strokeWidth={2.4} />
            Marcar llegada a sitio
          </button>
        )}
        {servicio.estado === 'en_sitio' && !tiempoExcedido && ventana.permitido && (
          <button
            onClick={handleIniciar}
            disabled={busy}
            className="w-full min-h-[56px] mb-4 rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[16px] flex items-center justify-center gap-2.5 active:scale-95 transition-transform disabled:opacity-60"
          >
            <Play size={19} strokeWidth={2.6} fill="currentColor" />
            Iniciar servicio
          </button>
        )}
        {servicio.estado === 'en_sitio' && tiempoExcedido && (
          <p className="text-[13.5px] text-red mb-4 leading-relaxed">
            Ya se superó el tiempo estimado sin iniciar el servicio — usa «Terminar servicio» abajo para cerrarlo con la justificación correspondiente.
          </p>
        )}
        {servicio.hora_llegada && (
          <p className="text-[13px] text-muted mb-4 flex items-center gap-1.5">
            <Clock size={14} strokeWidth={2.2} className="shrink-0" />
            Llegada {fmtHora(servicio.hora_llegada)}{servicio.hora_inicio && ` · Inicio ${fmtHora(servicio.hora_inicio)}`}
          </p>
        )}

        {servicio.estado === 'concluido' && servicio.hora_fin && (
          <div className={`mb-4 p-4 rounded-2xl border ${resultado.marcas.includes('completo') ? 'bg-teal/10 border-teal/30' : 'bg-amber/10 border-amber/30'}`}>
            <ResultadoBadges resultado={resultado} />
            <p className="text-[13px] text-muted mt-2.5">
              Cierre {fmtHora(servicio.hora_fin)} · {servicio.duracion_estimada_min} min estimados
            </p>
          </div>
        )}

        {error && <p className="text-red text-[13px] mb-3">{error}</p>}

        {/* La herramienta vive en su propia sección para no saturar esta
            pantalla; aquí solo queda el acceso. */}
        <Link
          href="/checklists"
          className="flex items-center justify-between gap-2 mb-6 px-4 min-h-[52px] rounded-2xl bg-surface-2 border border-line active:scale-[0.99] transition-transform"
        >
          <span className="flex items-center gap-2.5 text-[14.5px] font-medium">
            <PackageCheck size={18} strokeWidth={2.3} className="text-teal" />
            Herramienta y material
          </span>
          <ChevronRight size={17} strokeWidth={2.4} className="text-muted" />
        </Link>

        {/* Checklist estilo rondín */}
        {servicio.dias_totales > 1 && (
          <p className="text-[11.5px] text-muted mb-2.5">
            Checklist del proyecto completo — lo que se complete hoy queda registrado y lo pendiente sigue disponible los demás días.
          </p>
        )}
        {servicio.estado === 'programado' || servicio.estado === 'en_sitio' ? (
          <div className="mb-3 p-4 rounded-xl bg-amber/10 border border-amber/25 flex items-start gap-2.5">
            <Lock size={17} strokeWidth={2.4} className="text-amber shrink-0 mt-0.5" />
            <p className="text-[13.5px] text-ink/80 leading-relaxed">
              {servicio.estado === 'programado'
                ? 'Marca tu llegada e inicia el servicio antes de poder registrar evidencias en las tareas.'
                : 'Inicia el servicio para poder empezar a registrar evidencias en las tareas.'}
            </p>
          </div>
        ) : null}
        <div className="flex flex-col gap-2.5">
          {tareas.map((t) => {
            const puedeCompletar = servicio.estado === 'en_curso';
            const enProgreso = !t.completada && t.avance_pct > 0;
            return (
            <div
              key={t.id}
              onClick={() => !t.completada && puedeCompletar && abrirTarea(t)}
              className={`rounded-xl px-4 py-3.5 min-h-[60px] flex items-center gap-3.5 border-l-[3px] ${
                t.completada
                  ? 'bg-teal/[0.07] border-l-teal border-y border-r border-y-teal/20 border-r-teal/20'
                  : enProgreso && puedeCompletar
                  ? 'bg-amber/[0.07] border-l-amber border-y border-r border-y-amber/25 border-r-amber/25 cursor-pointer active:scale-[0.99] transition-transform'
                  : puedeCompletar
                  ? 'bg-surface-2 border-l-line-strong border-y border-r border-dashed border-y-line-strong border-r-line-strong cursor-pointer active:scale-[0.99] transition-transform'
                  : 'bg-surface-2/50 border-l-line border-y border-r border-y-line border-r-line opacity-70'
              }`}
            >
              {/* Indicador de estado: hecha / a medias / pendiente / bloqueada */}
              <span className="shrink-0">
                {t.completada ? (
                  <span className="w-7 h-7 rounded-full bg-teal flex items-center justify-center">
                    <Check size={16} strokeWidth={3.2} className="text-inkOnAccent" />
                  </span>
                ) : !puedeCompletar ? (
                  <Lock size={19} strokeWidth={2.2} className="text-faint" />
                ) : enProgreso ? (
                  <span className="w-7 h-7 rounded-full border-2 border-amber flex items-center justify-center">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber" />
                  </span>
                ) : (
                  <CircleDashed size={26} strokeWidth={2} className="text-muted" />
                )}
              </span>

              <div className="flex-1 min-w-0">
                <p className={`text-[14.5px] font-medium leading-snug ${t.completada ? 'text-ink/70' : 'text-ink'}`}>{t.descripcion}</p>
                {enProgreso && <ProgressBar pct={t.avance_pct} className="mt-2 max-w-[140px]" />}
                {t.completada && t.completada_en && (
                  <p className="text-[12px] text-teal font-semibold mt-1 flex items-center gap-1.5">
                    {fmtHoraOFecha(t.completada_en)}
                    {t.foto_path && <Camera size={13} strokeWidth={2.4} />}
                  </p>
                )}
              </div>

              {enProgreso ? (
                <span className="text-amber text-[15px] font-display font-bold shrink-0">{t.avance_pct}%</span>
              ) : !t.completada && puedeCompletar ? (
                <span className="text-muted text-[12.5px] shrink-0">Pendiente</span>
              ) : null}
            </div>
            );
          })}
        </div>

        {tareas.length === 0 && <p className="text-muted text-[14px] text-center py-8">Este servicio no tiene tareas configuradas.</p>}

        {servicio.estado === 'en_curso' && !showEvidenciaExtra && (
          <button
            onClick={() => setShowEvidenciaExtra(true)}
            className="w-full mt-3 mb-1 min-h-[48px] rounded-2xl border border-dashed border-amber/50 text-amber text-[14px] font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <Plus size={17} strokeWidth={2.6} />
            Agregar evidencia adicional
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
                  aria-label="Quitar foto"
                  className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/70 text-white flex items-center justify-center active:scale-90 transition-transform"
                >
                  <X size={17} strokeWidth={2.6} />
                </button>
              </div>
            ) : (
              <button onClick={() => fotoEvidenciaExtraRef.current?.click()} className="w-full min-h-[48px] mb-3 rounded-xl border border-dashed border-teal/50 text-teal text-[14.5px] font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform">
                <Camera size={17} strokeWidth={2.3} />
                Tomar foto de evidencia
              </button>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowEvidenciaExtra(false); setNotaEvidenciaExtra(''); setFotoEvidenciaExtra(null); setFotoEvidenciaExtraPreview(null); }}
                className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium active:scale-95 transition-transform"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardarEvidenciaExtra}
                disabled={busy}
                className="flex-1 min-h-[48px] rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold active:scale-95 transition-transform disabled:opacity-60"
              >
                {busy ? 'Guardando...' : 'Guardar evidencia'}
              </button>
            </div>
          </div>
        )}

        {eventos.filter((e) => e.tipo === 'evidencia' || e.tipo === 'avance').length > 0 && (
          <div className="mt-5">
            <div className="text-[11px] uppercase tracking-wider text-muted mb-2">Evidencias y avances registrados</div>
            <div className="flex flex-col gap-2.5">
              {eventos.filter((e) => e.tipo === 'evidencia' || e.tipo === 'avance').map((e) => (
                <div key={e.id} className={`p-3 rounded-xl border ${e.tipo === 'avance' ? 'bg-amber/5 border-amber/25' : 'bg-surface-2 border-line'}`}>
                  {e.tipo === 'avance' && (
                    <p className="text-[12px] text-amber font-semibold mb-1.5 flex items-center gap-1.5">
                      <Flag size={13} strokeWidth={2.6} />
                      Avance parcial
                    </p>
                  )}
                  {e.nota && <p className="text-[13.5px] text-ink/85 mb-1.5 leading-relaxed">{e.nota}</p>}
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

      {/* Acción de cierre: fija abajo, al alcance del pulgar y fuera del
          camino del checklist (antes competía arriba con el avance) */}
      {(servicio.estado === 'en_curso' || (servicio.estado === 'en_sitio' && tiempoExcedido)) && (
        <div className="fixed bottom-0 left-0 right-0 z-30 glass-strong px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="max-w-2xl lg:max-w-4xl mx-auto">
            <button
              onClick={handleConcluir}
              disabled={busy}
              className="w-full min-h-[52px] rounded-2xl bg-red text-white font-display font-semibold text-[15px] flex items-center justify-center gap-2.5 active:scale-95 transition-transform disabled:opacity-60"
            >
              <Flag size={18} strokeWidth={2.6} />
              Terminar servicio
            </button>
          </div>
        </div>
      )}

      {/* Modal: completar tarea */}
      {tareaActiva && (
        <ModalOverlay onClose={() => setTareaActiva(null)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[90vh] overflow-y-auto">
            <p className="font-display font-semibold text-[16px] mb-1 leading-snug">{tareaActiva.descripcion}</p>
            <p className="text-muted text-[13px] mb-3.5">Se registrará la hora y ubicación actual automáticamente.</p>

            {tareaActiva.avance_pct > 0 && !tareaActiva.completada && (
              <p className="text-[13px] text-amber font-medium mb-3">Avance registrado hasta ahora: {tareaActiva.avance_pct}%</p>
            )}

            <label className="text-[13.5px] text-ink/80 block mb-2">¿Qué tanto quedó avanzada la tarea?</label>
            <div className="flex gap-2 mb-3">
              {[25, 50, 75, 100].map((p) => (
                <button
                  key={p}
                  onClick={() => setAvanceSel(p)}
                  className={`flex-1 min-h-[48px] rounded-xl text-[15px] font-semibold border transition-colors ${
                    avanceSel === p
                      ? p === 100
                        ? 'bg-teal text-inkOnAccent border-teal'
                        : 'bg-amber text-inkOnAccent border-amber'
                      : 'bg-surface-2 border-line-strong text-ink/80'
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 mb-4">
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={avanceSel}
                onChange={(e) => setAvanceSel(parseInt(e.target.value))}
                className="flex-1 h-11 accent-teal"
              />
              <span className={`text-[17px] font-display font-bold w-14 text-right ${avanceSel >= 100 ? 'text-teal' : 'text-amber'}`}>{avanceSel}%</span>
            </div>

            <input ref={fotoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFotoTareaSelect} />

            {fotoTareaPreview ? (
              <div className="relative mb-3">
                <img src={fotoTareaPreview} className="w-full h-[150px] object-cover rounded-xl border border-line" />
                <button onClick={() => { setFotoTarea(null); setFotoTareaPreview(null); }} aria-label="Quitar foto" className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/70 text-white flex items-center justify-center active:scale-90 transition-transform"><X size={17} strokeWidth={2.6} /></button>
              </div>
            ) : (
              <button onClick={() => fotoInputRef.current?.click()} className="w-full min-h-[48px] mb-3 rounded-xl border border-dashed border-teal/50 text-teal text-[14.5px] font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform">
                <Camera size={17} strokeWidth={2.3} />
                Tomar foto de evidencia
              </button>
            )}

            <textarea
              value={notaTarea}
              onChange={(e) => setNotaTarea(e.target.value)}
              placeholder="Nota (opcional)"
              className="w-full px-3 py-2.5 mb-3 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[13.5px] min-h-[60px]"
            />

            <div className="flex gap-2">
              <button onClick={() => setTareaActiva(null)} className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium active:scale-95 transition-transform">
                Cancelar
              </button>
              <button
                onClick={handleGuardarTarea}
                disabled={busy}
                className={`flex-1 min-h-[48px] rounded-xl text-[14.5px] font-semibold active:scale-95 transition-transform disabled:opacity-60 ${
                  avanceSel >= 100 ? 'bg-teal text-inkOnAccent' : 'bg-amber text-inkOnAccent'
                }`}
              >
                {busy ? 'Guardando...' : avanceSel >= 100 ? 'Marcar como completada' : `Guardar avance (${avanceSel}%)`}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Modal: justificar retraso (estilo "Término de ronda") */}
      {showRetraso && (
        <ModalOverlay onClose={() => setShowRetraso(false)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[90vh] overflow-y-auto">
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
            <button onClick={() => retrasoInputRef.current?.click()} className="w-full min-h-[48px] mb-3 rounded-xl border border-dashed border-red/50 text-red text-[14.5px] font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform">
              {fotoRetraso ? <Check size={17} strokeWidth={2.8} /> : <Camera size={17} strokeWidth={2.3} />}
              {fotoRetraso ? fotoRetraso.name : 'Agregar foto (opcional)'}
            </button>

            <div className="flex gap-2">
              <button onClick={() => setShowRetraso(false)} className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium active:scale-95 transition-transform">
                Cancelar
              </button>
              <button onClick={handleGuardarRetraso} disabled={busy} className="flex-1 min-h-[48px] rounded-xl bg-red text-white text-[14.5px] font-semibold active:scale-95 transition-transform disabled:opacity-60">
                {busy ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
