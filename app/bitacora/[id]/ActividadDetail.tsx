'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/lib/useTheme';
import {
  Actividad,
  ActividadEvento,
  obtenerActividad,
  agregarAvance,
  pausarActividad,
  reanudarActividad,
  concluirActividad,
} from '@/lib/actividades';
import { createClient } from '@/lib/supabaseClient';
import { mapsLink } from '@/lib/geolocation';
import { showToast } from '@/components/Toast';

const TIPO_ICONO: Record<string, { icon: string; color: string }> = {
  avance: { icon: '●', color: 'text-teal' },
  pausa: { icon: '!', color: 'text-red' },
  reanudacion: { icon: '↻', color: 'text-amber' },
  cierre: { icon: '✓', color: 'text-teal' },
};

function horaLocal(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
}
function fechaLocal(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

export default function ActividadDetail({ actividadInicial }: { actividadInicial: Actividad }) {
  const theme = useTheme();
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

  const [showPausaNota, setShowPausaNota] = useState(false);
  const [motivoPausa, setMotivoPausa] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setLoading(true);
    try {
      const { actividad: a, eventos: evs } = await obtenerActividad(actividadInicial.id);
      setActividad(a);
      setEventos(evs);

      const paths = evs.filter((e) => e.foto_path).map((e) => e.foto_path as string);
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

  useEffect(() => {
    cargar();
  }, []);

  function handleFotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setFotoFile(file);
      setFotoPreview(URL.createObjectURL(file));
    }
    if (fotoInputRef.current) fotoInputRef.current.value = '';
    if (fotoGaleriaRef.current) fotoGaleriaRef.current.value = '';
  }

  async function handleAgregarAvance() {
    if (!nota.trim() && !fotoFile) {
      setError('Escribe una nota o agrega una foto.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await agregarAvance(actividad.id, nota, fotoFile);
      setNota('');
      setFotoFile(null);
      setFotoPreview(null);
      setShowAvance(false);
      showToast('Avance registrado', 'success');
      await cargar();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar el avance.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePausar() {
    setBusy(true);
    setError(null);
    try {
      await pausarActividad(actividad.id, motivoPausa);
      setShowPausaNota(false);
      setMotivoPausa('');
      showToast('Actividad pausada', 'success');
      await cargar();
    } catch (e: any) {
      setError(e?.message || 'No se pudo pausar.');
    } finally {
      setBusy(false);
    }
  }

  async function handleReanudar() {
    setBusy(true);
    setError(null);
    try {
      await reanudarActividad(actividad.id);
      showToast('Actividad reanudada', 'success');
      await cargar();
    } catch (e: any) {
      setError(e?.message || 'No se pudo reanudar.');
    } finally {
      setBusy(false);
    }
  }

  async function handleConcluir() {
    if (!confirm('¿Confirmas que quieres concluir esta actividad? No podrás agregar más avances después.')) return;
    setBusy(true);
    setError(null);
    try {
      await concluirActividad(actividad.id, nota);
      showToast('Actividad concluida', 'success');
      await cargar();
    } catch (e: any) {
      setError(e?.message || 'No se pudo concluir.');
    } finally {
      setBusy(false);
    }
  }

  function duracion(): string {
    const fin = actividad.hora_fin ? new Date(actividad.hora_fin).getTime() : Date.now();
    const mins = Math.floor((fin - new Date(actividad.hora_inicio).getTime()) / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  }

  return (
    <div className="max-w-2xl mx-auto pb-32">
      <div className="sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link href="/bitacora" className="shrink-0 w-8 h-8 rounded-full border border-line-strong flex items-center justify-center active:scale-90 transition-transform">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
          <div className="min-w-0">
            <h1 className="font-display font-semibold text-base tracking-wide truncate">Bitácora de actividad</h1>
            <p className="text-[11px] text-muted truncate">{actividad.proyecto}</p>
          </div>
        </div>
        <ThemeToggle />
      </div>

      <div className="px-4 pt-5">
        {/* Actividad activa */}
        <div className={`glass card rounded-2xl p-4 mb-5 ${actividad.estado !== 'concluida' ? 'border border-teal/35' : ''}`}>
          <div className="flex justify-between items-start mb-2.5">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted">Actividad</div>
              <div className="font-display text-[17px] font-bold">{actividad.titulo}</div>
            </div>
            <span
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                actividad.estado === 'en_curso'
                  ? 'bg-teal/15 text-teal'
                  : actividad.estado === 'pausada'
                  ? 'bg-amber/15 text-amber'
                  : 'bg-surface-2 text-muted'
              }`}
            >
              {actividad.estado === 'en_curso' ? '● En curso' : actividad.estado === 'pausada' ? '⏸ Pausada' : '✓ Concluida'}
            </span>
          </div>
          <div className="flex gap-4 text-[12px] text-muted mb-3">
            <span>Inicio: <b className="text-ink">{horaLocal(actividad.hora_inicio)}</b></span>
            <span>Duración: <b className="text-ink">{duracion()}</b></span>
          </div>

          {actividad.estado !== 'concluida' && (
            <div className="flex gap-2">
              {actividad.estado === 'en_curso' && !showPausaNota && (
                <button onClick={() => setShowPausaNota(true)} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-amber text-inkOnAccent text-[13px] font-semibold active:scale-95 transition-transform disabled:opacity-60">
                  ⏸ Pausar actividad
                </button>
              )}
              {actividad.estado === 'pausada' && (
                <button onClick={handleReanudar} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold active:scale-95 transition-transform disabled:opacity-60">
                  ▶ Reanudar
                </button>
              )}
              {actividad.estado === 'en_curso' && !showPausaNota && (
                <button onClick={handleConcluir} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold active:scale-95 transition-transform disabled:opacity-60">
                  ✓ Concluir
                </button>
              )}
            </div>
          )}

          {showPausaNota && (
            <div className="mt-2">
              <label className="text-[11px] uppercase tracking-wider text-muted block mb-1">¿Por qué se pausa?</label>
              <input
                value={motivoPausa}
                onChange={(e) => setMotivoPausa(e.target.value)}
                placeholder="Ej. instrucciones del segurista"
                className="w-full px-3 py-2 mb-2 rounded-xl bg-surface-2 border border-line focus:border-amber focus:outline-none text-[13px]"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowPausaNota(false)} className="flex-1 py-2 rounded-xl border border-line-strong text-ink/80 text-[12px] font-medium active:scale-95 transition-transform">
                  Cancelar
                </button>
                <button onClick={handlePausar} disabled={busy} className="flex-1 py-2 rounded-xl bg-amber text-inkOnAccent text-[12px] font-semibold active:scale-95 transition-transform disabled:opacity-60">
                  {busy ? 'Guardando...' : 'Confirmar pausa'}
                </button>
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-red text-[13px] mb-3">{error}</p>}

        {/* Agregar avance */}
        {actividad.estado !== 'concluida' && (
          <>
            {!showAvance ? (
              <button
                onClick={() => setShowAvance(true)}
                className="w-full mb-5 py-3 rounded-2xl border border-dashed border-teal/50 text-teal text-[13px] font-semibold active:scale-95 transition-transform"
              >
                + Agregar avance (foto + nota)
              </button>
            ) : (
              <div className="glass rounded-2xl p-4 mb-5">
                <p className="font-display font-semibold text-[14px] mb-2.5">Nuevo avance</p>
                <textarea
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Ej. Se instalaron 50 mts de tubería de ajuste en etapa 4"
                  className="w-full px-3 py-2.5 mb-3 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[13.5px] min-h-[70px]"
                />

                <input ref={fotoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFotoSelect} />
                <input ref={fotoGaleriaRef} type="file" accept="image/*" className="hidden" onChange={handleFotoSelect} />

                {fotoPreview ? (
                  <div className="relative mb-3">
                    <img src={fotoPreview} className="w-full h-[140px] object-cover rounded-xl border border-line" />
                    <button
                      onClick={() => { setFotoFile(null); setFotoPreview(null); }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white text-sm flex items-center justify-center"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <button onClick={() => fotoInputRef.current?.click()} className="py-2.5 rounded-xl border border-dashed border-teal/50 text-teal text-[12.5px] font-medium active:scale-95 transition-transform">
                      📷 Tomar foto
                    </button>
                    <button onClick={() => fotoGaleriaRef.current?.click()} className="py-2.5 rounded-xl border border-dashed border-teal/50 text-teal text-[12.5px] font-medium active:scale-95 transition-transform">
                      🖼️ Galería
                    </button>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowAvance(false); setNota(''); setFotoFile(null); setFotoPreview(null); setError(null); }}
                    className="flex-1 py-2.5 rounded-xl border border-line-strong text-ink/80 text-[13px] font-medium active:scale-95 transition-transform"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleAgregarAvance}
                    disabled={busy}
                    className="flex-1 py-2.5 rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold active:scale-95 transition-transform disabled:opacity-60"
                  >
                    {busy ? 'Guardando...' : 'Guardar avance'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Línea de tiempo */}
        <div className="text-[11px] uppercase tracking-wider text-muted mb-3">Línea de tiempo</div>
        {loading ? (
          <p className="text-muted text-sm">Cargando...</p>
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-[9px] top-1.5 bottom-1.5 w-0.5 bg-line-strong" />
            {eventos.length === 0 && <p className="text-muted text-sm">Sin eventos todavía.</p>}
            {eventos.map((ev) => {
              const t = TIPO_ICONO[ev.tipo];
              const link = mapsLink(ev.ubicacion);
              return (
                <div key={ev.id} className="relative mb-5">
                  <div className={`absolute -left-6 top-0.5 w-[18px] h-[18px] rounded-full bg-surface-2 border border-line-strong flex items-center justify-center text-[10px] font-bold ${t.color}`}>
                    {t.icon}
                  </div>
                  <div className="text-[11px] text-muted flex items-center gap-1.5 flex-wrap">
                    <span>{fechaLocal(ev.created_at)} · {horaLocal(ev.created_at)}</span>
                    {link && (
                      <a href={link} target="_blank" rel="noopener noreferrer" className="text-teal underline">
                        Ver ubicación
                      </a>
                    )}
                  </div>
                  {ev.nota && <div className="text-[14px] font-medium mt-1">{ev.nota}</div>}
                  {ev.tipo === 'pausa' && !ev.nota && <div className="text-[14px] font-medium mt-1">Actividad pausada</div>}
                  {ev.tipo === 'reanudacion' && !ev.nota && <div className="text-[14px] font-medium mt-1">Trabajo reanudado</div>}
                  {ev.tipo === 'cierre' && !ev.nota && <div className="text-[14px] font-medium mt-1">Actividad concluida</div>}
                  {ev.foto_path && fotoUrls[ev.foto_path] && (
                    <img src={fotoUrls[ev.foto_path]} className="w-full max-w-[320px] h-[150px] object-cover rounded-xl border border-line mt-2" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
