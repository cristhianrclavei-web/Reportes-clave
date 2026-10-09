'use client';

import TablaLista from '@/components/TablaLista';
import { VistaCondicional } from '@/lib/vistaSupervisor';
import EncabezadoSeccion, { BOTON_PRINCIPAL, RotuloGrupo } from '@/components/tecnico/EncabezadoSeccion';
import BotonAyuda from '@/components/BotonAyuda';
import EmptyIllustration from '@/components/EmptyIllustration';
import EstadoVacio from '@/components/EstadoVacio';
import MenuCuenta from '@/components/MenuCuenta';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import { crearActividad, listarMisActividades, Actividad } from '@/lib/actividades';
import { showToast } from '@/components/Toast';
import TecnicoTabs from '@/components/TecnicoTabs';
import { ChevronLeft, Plus } from 'lucide-react';
import Logo from '@/components/Logo';

function tiempoTranscurrido(desde: string): string {
  const ms = Date.now() - new Date(desde).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

const ESTADO_CHIP: Record<string, { label: string; className: string }> = {
  en_curso: { label: 'En curso', className: 'bg-teal/15 text-teal' },
  pausada: { label: 'Pausada', className: 'bg-amber/15 text-amber' },
  concluida: { label: 'Concluida', className: 'bg-surface-2 text-muted' },
};

export default function BitacoraList({ userName }: { userName: string }) {
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
    <div className="max-w-2xl lg:max-w-none lg:px-6 mx-auto pb-16">
      <div className="sticky top-0 z-20 bg-bg pb-2">
        <div
          className="barra-fija px-5 pb-3 flex items-center justify-between gap-3"
          style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
        >
        <Logo variante="completo" size={34} className="min-w-0" />
        <div className="flex items-center gap-1 shrink-0">
          <MenuCuenta nombre={userName} respaldo="Personal técnico" />
        </div>
        </div>
        <TecnicoTabs active="bitacora" />
      </div>

      <div className="px-4 pt-5 lg:pt-7">
        <EncabezadoSeccion
          titulo="Bitácora"
          detalle="Lo que haces fuera de un servicio programado, con hora y ubicación."
          accion={!showNueva && (
            <button onClick={() => setShowNueva(true)} className={BOTON_PRINCIPAL}>
              <Plus size={20} strokeWidth={2.6} />
              Iniciar nueva actividad
            </button>
          )}
        />

        {showNueva && (
          <div className="glass rounded-2xl p-4 lg:p-5 mb-6 lg:max-w-xl">
            <p className="font-display font-semibold text-[15px] mb-3">Nueva actividad</p>
            <label className="text-[11px] uppercase tracking-wider text-muted block mb-1">Proyecto / Cliente</label>
            <input
              value={proyecto}
              onChange={(e) => setProyecto(e.target.value)}
              placeholder="Ej. Plaza Central — Etapa 2"
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

        {!loading && actividades.length > 0 && (
        <VistaCondicional
          tabla={
            <TablaLista<(typeof actividades)[number]>
              filas={[...activas, ...concluidas]}
              keyFn={(a) => a.id}
              hrefFn={(a) => `/bitacora/${a.id}`}
              columnas={[
                { header: 'Actividad', render: (a) => <span className="font-semibold">{a.titulo}</span> },
                { header: 'Proyecto / cliente', render: (a) => a.proyecto },
                {
                  header: 'Estado',
                  render: (a) => (
                    <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${ESTADO_CHIP[a.estado].className}`}>{ESTADO_CHIP[a.estado].label}</span>
                  ),
                },
                { header: 'Fecha', render: (a) => <span className="tabular-nums whitespace-nowrap">{new Date(a.created_at).toLocaleDateString('es-MX')}</span> },
              ]}
            />
          }
          tarjetas={<>
        {!loading && activas.length > 0 && (
          <div className="mb-8">
            <RotuloGrupo cuenta={activas.length}>En curso</RotuloGrupo>
            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">
              {activas.map((a) => (
                <Link
                  key={a.id}
                  href={`/bitacora/${a.id}`}
                  className="block rounded-2xl border border-line border-l-4 border-l-teal bg-surface p-4 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-diffuse active:translate-y-0 active:scale-[0.99]"
                >
                  <div className="flex justify-between items-start gap-2 mb-1.5">
                    <strong className="font-display font-bold text-[16px] tracking-wide leading-snug">{a.titulo}</strong>
                    <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${ESTADO_CHIP[a.estado].className}`}>
                      {ESTADO_CHIP[a.estado].label}
                    </span>
                  </div>
                  <p className="text-[13px] text-muted">{a.proyecto} · iniciada hace {tiempoTranscurrido(a.hora_inicio)}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {!loading && concluidas.length > 0 && (
          <div>
            <RotuloGrupo cuenta={concluidas.length}>Concluidas</RotuloGrupo>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5">
              {concluidas.map((a) => (
                <Link
                  key={a.id}
                  href={`/bitacora/${a.id}`}
                  className="block rounded-2xl bg-surface border border-line px-4 py-3.5 transition-all duration-150 hover:border-teal/45 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]"
                >
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-[14px] font-semibold truncate">{a.titulo}</span>
                    <span className="text-[12px] text-muted shrink-0">{new Date(a.created_at).toLocaleDateString('es-MX')}</span>
                  </div>
                  <p className="text-[12.5px] text-muted truncate mt-0.5">{a.proyecto}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

          </>}
        />
        )}

        {!loading && actividades.length === 0 && (
          <EstadoVacio icono={<EmptyIllustration variante="historial" />} titulo="Todavía no hay actividades" detalle="Usa «Iniciar nueva actividad» para registrar lo que haces fuera de un servicio." />
        )}
      </div>
    </div>
  );
}
