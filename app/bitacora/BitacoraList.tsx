'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/lib/useTheme';
import { crearActividad, listarMisActividades, Actividad } from '@/lib/actividades';
import { showToast } from '@/components/Toast';

function tiempoTranscurrido(desde: string): string {
  const ms = Date.now() - new Date(desde).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

const ESTADO_CHIP: Record<string, { label: string; className: string }> = {
  en_curso: { label: '● En curso', className: 'bg-teal/15 text-teal' },
  pausada: { label: '⏸ Pausada', className: 'bg-amber/15 text-amber' },
  concluida: { label: '✓ Concluida', className: 'bg-surface-2 text-muted' },
};

export default function BitacoraList({ userName }: { userName: string }) {
  const theme = useTheme();
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNueva, setShowNueva] = useState(false);
  const [proyecto, setProyecto] = useState('');
  const [titulo, setTitulo] = useState('');
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setLoading(true);
    try {
      setActividades(await listarMisActividades());
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar las actividades');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function handleCrear() {
    if (!proyecto.trim() || !titulo.trim()) {
      setError('Falta el proyecto o el título de la actividad.');
      return;
    }
    setCreando(true);
    setError(null);
    try {
      const nueva = await crearActividad(proyecto.trim(), titulo.trim());
      setActividades((prev) => [nueva, ...prev]);
      setShowNueva(false);
      setProyecto('');
      setTitulo('');
      showToast('Actividad iniciada', 'success');
      window.location.href = `/bitacora/${nueva.id}`;
    } catch (e: any) {
      setError(e?.message || 'No se pudo iniciar la actividad.');
    } finally {
      setCreando(false);
    }
  }

  const activas = actividades.filter((a) => a.estado !== 'concluida');
  const concluidas = actividades.filter((a) => a.estado === 'concluida');

  return (
    <div className="max-w-2xl lg:max-w-4xl mx-auto pb-28 lg:pb-16">
      <div className="sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link href="/mis-reportes" className="shrink-0 w-8 h-8 rounded-full border border-line-strong flex items-center justify-center active:scale-90 transition-transform">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
          <img src={theme === 'light' ? '/brand/logo-badge-light.png' : '/brand/logo-badge.png'} alt="Clave Inteligente" className="h-8 w-8 object-contain shrink-0" />
          <h1 className="font-display font-semibold text-base tracking-wide truncate">Bitácora de actividades</h1>
        </div>
        <ThemeToggle />
      </div>

      <div className="px-4 pt-5">
        {!showNueva ? (
          <button
            onClick={() => setShowNueva(true)}
            className="w-full py-4 mb-5 rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-base tracking-wide shadow-glow-teal active:scale-[0.98] transition-transform"
          >
            + Iniciar nueva actividad
          </button>
        ) : (
          <div className="glass rounded-2xl p-4 mb-5">
            <p className="font-display font-semibold text-[15px] mb-3">Nueva actividad</p>
            <label className="text-[11px] uppercase tracking-wider text-muted block mb-1">Proyecto / Cliente</label>
            <input
              value={proyecto}
              onChange={(e) => setProyecto(e.target.value)}
              placeholder="Ej. PRINT PACK — Etapa 4"
              className="w-full px-3.5 py-2.5 mb-3 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14px]"
            />
            <label className="text-[11px] uppercase tracking-wider text-muted block mb-1">¿Qué vas a hacer?</label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Instalación de tubería, nivel 1"
              className="w-full px-3.5 py-2.5 mb-3 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14px]"
            />
            {error && <p className="text-red text-[12px] mb-2">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setShowNueva(false); setError(null); }} className="flex-1 py-2.5 rounded-xl border border-line-strong text-ink/80 text-[13px] font-medium active:scale-95 transition-transform">
                Cancelar
              </button>
              <button
                onClick={handleCrear}
                disabled={creando}
                className="flex-1 py-2.5 rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold active:scale-95 transition-transform disabled:opacity-60"
              >
                {creando ? 'Iniciando...' : 'Iniciar (se registra hora y ubicación)'}
              </button>
            </div>
          </div>
        )}

        {loading && <p className="text-center text-muted py-10 text-sm">Cargando...</p>}
        {!loading && error && actividades.length === 0 && <p className="text-red text-sm">{error}</p>}

        {!loading && activas.length > 0 && (
          <div className="mb-6">
            <div className="text-[11px] uppercase tracking-wider text-muted mb-2.5">En curso</div>
            <div className="flex flex-col gap-3">
              {activas.map((a) => (
                <Link
                  key={a.id}
                  href={`/bitacora/${a.id}`}
                  className="block rounded-2xl border-l-4 border-teal bg-surface p-4 active:scale-[0.99] transition-transform"
                >
                  <div className="flex justify-between items-start gap-2 mb-1.5">
                    <strong className="font-display font-bold text-[15px]">{a.titulo}</strong>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${ESTADO_CHIP[a.estado].className}`}>
                      {ESTADO_CHIP[a.estado].label}
                    </span>
                  </div>
                  <p className="text-[12px] text-muted">{a.proyecto} · iniciada hace {tiempoTranscurrido(a.hora_inicio)}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {!loading && concluidas.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted mb-2.5">Concluidas</div>
            <div className="flex flex-col gap-2.5">
              {concluidas.map((a) => (
                <Link
                  key={a.id}
                  href={`/bitacora/${a.id}`}
                  className="block rounded-xl bg-surface-2 border border-line p-3.5 active:scale-[0.99] transition-transform opacity-80"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] font-semibold">{a.titulo}</span>
                    <span className="text-[10px] text-muted">{new Date(a.created_at).toLocaleDateString('es-MX')}</span>
                  </div>
                  <p className="text-[11px] text-muted">{a.proyecto}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {!loading && actividades.length === 0 && (
          <p className="text-center text-muted py-10 text-sm">Todavía no has registrado ninguna actividad.</p>
        )}
      </div>
    </div>
  );
}
