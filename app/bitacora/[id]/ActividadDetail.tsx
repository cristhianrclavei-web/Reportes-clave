'use client';

import GrabadorVideo from '@/components/GrabadorVideo';
import VisorVideo, { MarcaVideo } from '@/components/VisorVideo';
import { VideoGrabado, VIDEOS_POR_REGISTRO } from '@/lib/videoEvidencia';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import Logo from '@/components/Logo';
import ModalOverlay from '@/components/ModalOverlay';
import {
  Actividad, ActividadEvento, obtenerActividad, agregarAvance, pausarActividad, reanudarActividad,
  concluirActividad, corregirHoraFin, actualizarNotaAvance, minutosEfectivos, agregarVideoAvance,
} from '@/lib/actividades';
import { tipoActividad } from '@/lib/tiposActividad';
import { duracionTexto } from '@/lib/lineaDelDia';
import { hoyLocal } from '@/lib/fechaHoy';
import { createClient } from '@/lib/supabaseClient';
import { mapsLink } from '@/lib/geolocation';
import { showToast } from '@/components/Toast';
import IconoTipo from '@/components/bitacora/IconoTipo';
import { RotuloGrupo } from '@/components/tecnico/EncabezadoSeccion';
import {
  Play, Pause, Check, Camera, X, Circle, Images, RotateCcw, ChevronLeft, Flag, NotebookPen,
  MessageSquarePlus, FileText, AlertTriangle, CalendarPlus, Video,
} from 'lucide-react';

// Detalle de una actividad de bitácora. Mismo acomodo que el detalle de un
// servicio: tarjeta de resumen, accesos compactos y, abajo, «Foto rápida»
// (abre la cámara y se guarda sola; el comentario se pone después) junto a
// «Concluir». Quien supervisa la ve en solo lectura y puede volverla un
// servicio programado.

const TIPO_ICONO: Record<string, { Icono: any; color: string }> = {
  avance: { Icono: Circle, color: 'text-teal' },
  pausa: { Icono: Pause, color: 'text-amber' },
  reanudacion: { Icono: RotateCcw, color: 'text-teal' },
  cierre: { Icono: Check, color: 'text-teal' },
};

// Mismo estilo que los accesos del detalle de servicio.
const ACCESO = 'min-h-[68px] px-2 py-2.5 rounded-2xl bg-surface border border-line flex flex-col items-center justify-center gap-1.5 text-center text-[12.5px] font-medium leading-tight text-ink/85 transition-all hover:border-line-strong active:scale-95 disabled:opacity-60';

function horaLocal(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', hour12: false, minute: '2-digit' });
}
function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

export default function ActividadDetail({
  actividadInicial,
  soloLectura = false,
}: {
  actividadInicial: Actividad;
  soloLectura?: boolean;
}) {
  const [actividad, setActividad] = useState<Actividad>(actividadInicial);
  const [eventos, setEventos] = useState<ActividadEvento[]>([]);
  const [loading, setLoading] = useState(true);
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({});

  const [showAvance, setShowAvance] = useState(false);
  const [nota, setNota] = useState('');
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const fotoGaleriaRef = useRef<HTMLInputElement>(null);
  const fotoRapidaRef = useRef<HTMLInputElement>(null);
  const [subiendoFotos, setSubiendoFotos] = useState(0);
  const [comentando, setComentando] = useState<string | null>(null);
  const [textoComentario, setTextoComentario] = useState('');

  const [showPausaNota, setShowPausaNota] = useState(false);
  const [motivoPausa, setMotivoPausa] = useState('');
  const [concluyendo, setConcluyendo] = useState(false);
  const [notaFinal, setNotaFinal] = useState('');
  const [horaReal, setHoraReal] = useState('');
  const [grabandoVideo, setGrabandoVideo] = useState(false);
  const [viendoVideo, setViendoVideo] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reloj para la duración en vivo: se lee ya montado.
  const [ahora, setAhora] = useState(0);
  useEffect(() => {
    setAhora(Date.now());
    const id = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  async function cargar(silencioso = false) {
    if (!silencioso) setLoading(true);
    try {
      const { actividad: a, eventos: evs } = await obtenerActividad(actividadInicial.id);
      setActividad(a);
      setEventos(evs);
      if (a.hora_fin) setHoraReal(horaLocal(a.hora_fin));

      const paths = [...evs.filter((e) => e.foto_path).map((e) => e.foto_path as string), ...evs.filter((e) => e.video_path).map((e) => e.video_path as string)];
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
      setError(e?.message || 'No se pudo cargar la actividad');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function handleFotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setFotoFile(file);
      setFotoPreview(URL.createObjectURL(file));
    }
    if (fotoInputRef.current) fotoInputRef.current.value = '';
    if (fotoGaleriaRef.current) fotoGaleriaRef.current.value = '';
  }

  // Un paso con su aviso y su recarga.
  async function hacer(fn: () => Promise<unknown>, ok: string, fallo: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      showToast(ok, 'success');
      await cargar(true);
      return true;
    } catch (e: any) {
      setError(e?.message || fallo);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleAgregarAvance() {
    if (!nota.trim() && !fotoFile) { setError('Escribe una nota o agrega una foto.'); return; }
    if (await hacer(() => agregarAvance(actividad.id, nota, fotoFile), 'Avance registrado', 'No se pudo guardar el avance.')) {
      setNota(''); setFotoFile(null); setFotoPreview(null); setShowAvance(false);
    }
  }

  // Foto rápida: la cámara se abre de una vez y la foto se guarda sola.
  async function handleFotoRapida(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSubiendoFotos((n) => n + 1);
    try {
      await agregarAvance(actividad.id, '', file);
      showToast('Foto guardada', 'success');
      await cargar(true);
    } catch (err: any) {
      alert('No se pudo guardar la foto: ' + (err?.message || 'revisa tu conexión') + '. Tómala de nuevo.');
    } finally {
      setSubiendoFotos((n) => n - 1);
    }
  }

  async function handleVideo(v: VideoGrabado) {
    setGrabandoVideo(false);
    setSubiendoFotos((n) => n + 1);
    try {
      await agregarVideoAvance(actividad.id, v);
      showToast('Video guardado', 'success');
      await cargar(true);
    } catch (err: any) {
      alert('No se pudo guardar el video: ' + (err?.message || 'revisa tu conexión') + '. Grábalo de nuevo.');
    } finally {
      setSubiendoFotos((n) => n - 1);
    }
  }
  function abrirGrabadora() {
    if (eventos.filter((e) => e.video_path).length >= VIDEOS_POR_REGISTRO) {
      showToast(`Esta actividad ya tiene ${VIDEOS_POR_REGISTRO} videos, que es el máximo`, 'error');
      return;
    }
    setGrabandoVideo(true);
  }

  async function handlePausar() {
    if (await hacer(() => pausarActividad(actividad.id, motivoPausa), 'Actividad pausada', 'No se pudo pausar.')) {
      setShowPausaNota(false); setMotivoPausa('');
    }
  }

  async function handleConcluir() {
    if (await hacer(() => concluirActividad(actividad.id, notaFinal), 'Actividad concluida', 'No se pudo concluir.')) {
      setConcluyendo(false); setNotaFinal('');
    }
  }

  async function handleGuardarComentario() {
    if (!comentando) return;
    if (await hacer(() => actualizarNotaAvance(comentando, textoComentario), 'Comentario guardado', 'No se pudo guardar el comentario.')) {
      setComentando(null); setTextoComentario('');
    }
  }

  // La hora real de fin va en el mismo día en que empezó la actividad.
  async function handleCorregirHora() {
    if (!/^\d{2}:\d{2}$/.test(horaReal)) { setError('Elige la hora en que terminaste.'); return; }
    const fin = new Date(`${hoyLocal(new Date(actividad.hora_inicio))}T${horaReal}`).toISOString();
    await hacer(() => corregirHoraFin(actividad, fin), 'Hora de fin confirmada', 'No se pudo guardar la hora.');
  }

  const tipo = tipoActividad(actividad.tipo);
  const abierta = actividad.estado !== 'concluida';
  const minutos = ahora ? minutosEfectivos(actividad, eventos, ahora) : null;
  const estadoChip = actividad.estado === 'en_curso'
    ? { texto: 'En curso', cls: 'bg-teal/15 text-teal' }
    : actividad.estado === 'pausada' ? { texto: 'En pausa', cls: 'bg-amber/15 text-amber' } : { texto: 'Concluida', cls: 'bg-surface-2 text-muted' };
  const notasParaServicio = eventos.filter((e) => e.tipo === 'avance' && e.nota).map((e) => e.nota).reverse().join('. ');

  return (
    <div className="max-w-2xl mx-auto pb-32">
      <div className="sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link href={soloLectura ? '/dashboard' : '/bitacora'} aria-label="Volver" className="shrink-0 w-11 h-11 -ml-1.5 rounded-full flex items-center justify-center active:scale-90 transition-transform">
            <ChevronLeft size={24} strokeWidth={2.4} />
          </Link>
          <Logo size={30} />
          <div className="min-w-0">
            <h1 className="font-display font-semibold text-[17px] tracking-wide truncate leading-tight">{actividad.titulo}</h1>
            <p className="text-[12.5px] text-muted truncate">{tipo.nombre}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ThemeToggle />
          <LogoutButton compacto />
        </div>
      </div>

      <div className="px-4 pt-4">
        {soloLectura && (
          <p className="text-[11.5px] font-semibold text-muted mb-3 uppercase tracking-wider">Viendo como supervisor · solo lectura</p>
        )}

        {/* Resumen */}
        <div className="mb-4 rounded-2xl bg-surface border border-line p-4">
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-white" style={{ backgroundColor: tipo.color }}>
              <IconoTipo tipo={tipo.clave} size={21} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold text-[17px] tracking-wide leading-snug">{actividad.titulo}</p>
              <p className="text-[13px] text-muted truncate">{actividad.proyecto} · {fechaCorta(actividad.hora_inicio)}</p>
            </div>
            <span className={`shrink-0 text-[12px] font-semibold px-2.5 py-1 rounded-full ${estadoChip.cls}`}>{estadoChip.texto}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3.5">
            {([
              ['Inicio', horaLocal(actividad.hora_inicio)],
              ['Fin', actividad.hora_fin ? horaLocal(actividad.hora_fin) : '—'],
              ['Duración', actividad.cierre_automatico ? '—' : minutos === null ? '…' : duracionTexto(minutos)],
            ] as const).map(([rotulo, valor]) => (
              <div key={rotulo} className="rounded-xl bg-surface-2/70 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wider text-muted">{rotulo}</p>
                <p className="font-display font-bold text-[16px] tabular-nums leading-tight mt-0.5">{valor}</p>
              </div>
            ))}
          </div>
          {actividad.report_id && (
            <p className="text-[12.5px] text-teal font-semibold mt-3 flex items-center gap-1.5"><FileText size={14} strokeWidth={2.4} />Ya tiene un reporte ligado</p>
          )}
        </div>

        {/* Se cerró sola: falta la hora real */}
        {actividad.cierre_automatico && (
          <div className="mb-4 rounded-2xl border border-amber/40 bg-amber/8 p-3.5">
            <p className="text-[13.5px] font-semibold text-amber flex items-center gap-2"><AlertTriangle size={16} strokeWidth={2.4} />Se cerró sola al terminar el día</p>
            <p className="text-[12.5px] text-ink/80 mt-1 leading-snug">
              Quedó abierta, así que no se sabe cuánto duró. {soloLectura ? 'Falta que su dueño confirme la hora.' : 'Dinos a qué hora terminaste para que cuente en tu día.'}
            </p>
            {!soloLectura && (
              <div className="flex items-center gap-2 mt-2.5">
                <input type="time" value={horaReal} onChange={(e) => setHoraReal(e.target.value)} className="flex-1 min-w-0 px-3 min-h-[44px] rounded-xl bg-surface border border-line focus:border-amber focus:outline-none text-[15px]" />
                <button type="button" onClick={handleCorregirHora} disabled={busy} className="shrink-0 min-h-[44px] px-4 rounded-xl bg-amber text-inkOnAccent text-[13.5px] font-semibold active:scale-95 transition-transform disabled:opacity-60">
                  {busy ? 'Guardando...' : 'Confirmar hora'}
                </button>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-red text-[13px] mb-3">{error}</p>}

        {/* Accesos */}
        {!soloLectura && abierta && !showPausaNota && !showAvance && (
          <div className="grid grid-cols-2 gap-2 mb-5">
            {actividad.estado === 'en_curso' ? (
              <button type="button" onClick={() => setShowPausaNota(true)} disabled={busy} className={ACCESO}>
                <Pause size={20} strokeWidth={2.2} className="text-amber" />
                <span>Pausar</span>
              </button>
            ) : (
              <button type="button" onClick={() => hacer(() => reanudarActividad(actividad.id), 'Actividad reanudada', 'No se pudo reanudar.')} disabled={busy} className={ACCESO}>
                <Play size={20} strokeWidth={2.2} className="text-teal" />
                <span>Reanudar</span>
              </button>
            )}
            <button type="button" onClick={() => setShowAvance(true)} disabled={busy} className={ACCESO}>
              <NotebookPen size={20} strokeWidth={2.2} className="text-teal" />
              <span>Nota con o sin foto</span>
            </button>
          </div>
        )}

        {!soloLectura && showPausaNota && (
          <div className="mb-5 rounded-2xl border border-line bg-surface p-4">
            <label className="block text-[13px] font-medium text-ink/70 mb-1.5">¿Por qué se pausa? (opcional)</label>
            <input
              value={motivoPausa}
              onChange={(e) => setMotivoPausa(e.target.value)}
              placeholder="Ej. comida"
              className="w-full px-3.5 min-h-[44px] mb-2.5 rounded-xl bg-surface-2 border border-line focus:border-amber focus:outline-none text-[14.5px]"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowPausaNota(false)} className="flex-1 min-h-[44px] rounded-xl border border-line-strong text-ink/80 text-[13.5px] font-medium active:scale-95 transition-transform">Cancelar</button>
              <button onClick={handlePausar} disabled={busy} className="flex-1 min-h-[44px] rounded-xl bg-amber text-inkOnAccent text-[13.5px] font-semibold active:scale-95 transition-transform disabled:opacity-60">{busy ? 'Guardando...' : 'Pausar'}</button>
            </div>
          </div>
        )}

        {!soloLectura && abierta && showAvance && (
          <div className="mb-5 rounded-2xl border border-line bg-surface p-4">
            <p className="font-display font-semibold text-[15px] mb-2.5">Nota</p>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="¿Qué hiciste o qué pasó?"
              className="w-full px-3.5 py-2.5 mb-3 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px] min-h-[76px]"
            />
            <input ref={fotoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFotoSelect} />
            <input ref={fotoGaleriaRef} type="file" accept="image/*" className="hidden" onChange={handleFotoSelect} />
            {fotoPreview ? (
              <div className="relative mb-3">
                <img src={fotoPreview} alt="Foto elegida" className="w-full h-[150px] object-cover rounded-xl border border-line" />
                <button onClick={() => { setFotoFile(null); setFotoPreview(null); }} aria-label="Quitar foto" className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center">
                  <X size={17} strokeWidth={2.6} />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button onClick={() => fotoInputRef.current?.click()} className="min-h-[46px] rounded-xl border border-dashed border-line-strong text-ink/80 text-[13.5px] font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform">
                  <Camera size={17} strokeWidth={2.3} />Tomar foto
                </button>
                <button onClick={() => fotoGaleriaRef.current?.click()} className="min-h-[46px] rounded-xl border border-dashed border-line-strong text-ink/80 text-[13.5px] font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform">
                  <Images size={17} strokeWidth={2.3} />Galería
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setShowAvance(false); setNota(''); setFotoFile(null); setFotoPreview(null); setError(null); }} className="flex-1 min-h-[46px] rounded-xl border border-line-strong text-ink/80 text-[13.5px] font-medium active:scale-95 transition-transform">Cancelar</button>
              <button onClick={handleAgregarAvance} disabled={busy} className="flex-1 min-h-[46px] rounded-xl bg-teal text-inkOnAccent text-[14px] font-semibold active:scale-95 transition-transform disabled:opacity-60">{busy ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        )}

        {/* Ya concluida: lo que sigue */}
        {!abierta && !soloLectura && !actividad.report_id && (
          <Link href={`/nuevo?actividad=${actividad.id}`} className="mb-5 flex items-center gap-3 rounded-2xl border border-teal/40 bg-teal/8 p-3.5 active:scale-[0.99] transition-transform">
            <FileText size={20} strokeWidth={2.3} className="text-teal shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">Hacer un reporte con esta actividad</span>
              <span className="block text-[12.5px] text-muted">Se abre con el cliente, las notas y las fotos ya puestas.</span>
            </span>
          </Link>
        )}
        {soloLectura && (
          <Link
            href={`/dashboard/servicios?agendar=1&proyecto=${encodeURIComponent(actividad.proyecto)}${actividad.cliente_id ? `&cliente=${actividad.cliente_id}` : ''}&descripcion=${encodeURIComponent([actividad.titulo, notasParaServicio].filter(Boolean).join('. ').slice(0, 400))}`}
            className="mb-5 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 hover:border-teal/45 active:scale-[0.99] transition-all"
          >
            <CalendarPlus size={20} strokeWidth={2.3} className="text-teal shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">Programar un servicio a partir de esto</span>
              <span className="block text-[12.5px] text-muted">Abre el alta con el cliente y lo que se anotó aquí.</span>
            </span>
          </Link>
        )}

        {/* Registro */}
        <RotuloGrupo cuenta={eventos.length}>Registro</RotuloGrupo>
        {loading ? (
          <p className="text-muted text-sm">Cargando...</p>
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-[9px] top-1.5 bottom-1.5 w-0.5 bg-line-strong" />
            {eventos.length === 0 && <p className="text-muted text-[13.5px]">Todavía no hay nada anotado. Usa «Foto rápida» o agrega una nota.</p>}
            {eventos.map((ev) => {
              const t = TIPO_ICONO[ev.tipo] || TIPO_ICONO.avance;
              const link = mapsLink(ev.ubicacion);
              return (
                <div key={ev.id} className="relative mb-5">
                  <div className={`absolute -left-6 top-0.5 w-[18px] h-[18px] rounded-full bg-surface-2 border border-line-strong flex items-center justify-center ${t.color}`}>
                    <t.Icono size={10} strokeWidth={3} />
                  </div>
                  <div className="text-[12px] text-muted flex items-center gap-1.5 flex-wrap">
                    <span>{fechaCorta(ev.created_at)} · {horaLocal(ev.created_at)}</span>
                    {link && <a href={link} target="_blank" rel="noopener noreferrer" className="text-teal underline">Ver ubicación</a>}
                  </div>
                  {comentando === ev.id ? (
                    <div className="mt-1.5">
                      <textarea
                        autoFocus
                        value={textoComentario}
                        onChange={(e) => setTextoComentario(e.target.value)}
                        placeholder="¿Qué se ve en la foto?"
                        className="w-full px-3 py-2 rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[13.5px] min-h-[64px]"
                      />
                      <div className="flex gap-2 mt-1.5">
                        <button onClick={() => { setComentando(null); setTextoComentario(''); }} className="flex-1 min-h-[40px] rounded-xl border border-line-strong text-ink/80 text-[13px] font-medium">Cancelar</button>
                        <button onClick={handleGuardarComentario} disabled={busy} className="flex-1 min-h-[40px] rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold disabled:opacity-60">{busy ? 'Guardando...' : 'Guardar'}</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {ev.nota && <div className="text-[14px] font-medium mt-1 leading-snug">{ev.nota}</div>}
                      {ev.tipo === 'pausa' && !ev.nota && <div className="text-[14px] font-medium mt-1">Actividad pausada</div>}
                      {ev.tipo === 'reanudacion' && !ev.nota && <div className="text-[14px] font-medium mt-1">Trabajo reanudado</div>}
                      {ev.tipo === 'cierre' && !ev.nota && <div className="text-[14px] font-medium mt-1">Actividad concluida</div>}
                    </>
                  )}
                  {ev.foto_path && fotoUrls[ev.foto_path] && ev.video_path && (
                    <button type="button" onClick={() => fotoUrls[ev.video_path!] && setViendoVideo(fotoUrls[ev.video_path!])} aria-label="Ver video" className="relative block w-full max-w-[320px] mt-2">
                      <img src={fotoUrls[ev.foto_path]} alt="Video de evidencia" className="w-full h-[150px] object-cover rounded-xl border border-line" />
                      <MarcaVideo dur={ev.video_duracion} />
                    </button>
                  )}
                  {ev.foto_path && fotoUrls[ev.foto_path] && !ev.video_path && (
                    <a href={fotoUrls[ev.foto_path]} target="_blank" rel="noreferrer" className="block mt-2">
                      <img src={fotoUrls[ev.foto_path]} alt="Evidencia" className="w-full max-w-[320px] h-[150px] object-cover rounded-xl border border-line" />
                    </a>
                  )}
                  {!soloLectura && abierta && ev.tipo === 'avance' && comentando !== ev.id && (
                    <button
                      onClick={() => { setComentando(ev.id); setTextoComentario(ev.nota || ''); }}
                      className="mt-1.5 min-h-[36px] px-3 rounded-lg border border-dashed border-teal/50 text-teal text-[12.5px] font-semibold inline-flex items-center gap-1.5 active:scale-95 transition-transform"
                    >
                      <MessageSquarePlus size={14} strokeWidth={2.4} />
                      {ev.nota ? 'Editar comentario' : 'Agregar comentario'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Barra de abajo: lo que más se usa, al pulgar */}
      {!soloLectura && abierta && (
        <div className="fixed bottom-0 left-0 right-0 z-30 glass-strong px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="max-w-2xl mx-auto">
            <input ref={fotoRapidaRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFotoRapida} />
            {/* El hueco a la derecha es del botón flotante del asistente. */}
            <div className="flex gap-2.5 pr-[64px] lg:pr-0">
              <button
                onClick={() => fotoRapidaRef.current?.click()}
                className="flex-[1.6] min-h-[56px] rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15.5px] flex items-center justify-center gap-2.5 active:scale-95 transition-transform shadow-glow-teal"
              >
                <Camera size={21} strokeWidth={2.5} />
                {subiendoFotos > 0 ? 'Guardando…' : 'Foto rápida'}
              </button>
              <button
                onClick={abrirGrabadora}
                aria-label="Grabar video de evidencia"
                title="Grabar video"
                className="shrink-0 w-[56px] min-h-[56px] rounded-2xl border border-teal/50 bg-teal/10 text-teal flex items-center justify-center active:scale-95 transition-transform"
              >
                <Video size={22} strokeWidth={2.3} />
              </button>
              <button
                onClick={() => setConcluyendo(true)}
                disabled={busy}
                className="flex-1 min-h-[56px] rounded-2xl border border-red/60 bg-red/10 text-red font-display font-semibold text-[14.5px] flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
              >
                <Flag size={17} strokeWidth={2.6} />
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {grabandoVideo && <GrabadorVideo onListo={handleVideo} onCerrar={() => setGrabandoVideo(false)} />}
      {viendoVideo && <VisorVideo url={viendoVideo} onCerrar={() => setViendoVideo(null)} />}

      {concluyendo && (
        <ModalOverlay onClose={() => !busy && setConcluyendo(false)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5">
            <p className="font-display font-bold text-[18px] tracking-wide mb-1">¿Concluir la actividad?</p>
            <p className="text-[13px] text-muted mb-3.5">Se registra la hora de fin. Ya cerrada no se le agregan fotos ni notas.</p>
            <textarea
              value={notaFinal}
              onChange={(e) => setNotaFinal(e.target.value)}
              placeholder="Nota final (opcional)"
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14px] min-h-[64px]"
            />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setConcluyendo(false)} disabled={busy} className="flex-1 min-h-[50px] rounded-2xl border border-line-strong text-ink/80 text-[14.5px] font-semibold active:scale-95 transition-transform disabled:opacity-60">Seguir</button>
              <button onClick={handleConcluir} disabled={busy} className="flex-1 min-h-[50px] rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] active:scale-95 transition-transform disabled:opacity-60">{busy ? 'Cerrando...' : 'Concluir'}</button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
