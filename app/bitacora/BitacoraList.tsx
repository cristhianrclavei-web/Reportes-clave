'use client';

import TablaLista from '@/components/TablaLista';
import { VistaCondicional } from '@/lib/vistaSupervisor';
import EncabezadoSeccion, { RotuloGrupo } from '@/components/tecnico/EncabezadoSeccion';
import EmptyIllustration from '@/components/EmptyIllustration';
import EstadoVacio from '@/components/EstadoVacio';
import MenuCuenta from '@/components/MenuCuenta';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearActividad, listarMisActividades, cerrarActividadesAbiertas, Actividad } from '@/lib/actividades';
import { listarMisServicios, Servicio } from '@/lib/serviciosProgramados';
import { TIPOS_ACTIVIDAD, TipoActividad, tipoActividad } from '@/lib/tiposActividad';
import { showToast } from '@/components/Toast';
import TecnicoTabs from '@/components/TecnicoTabs';
import SubTabs from '@/components/SubTabs';
import ModalOverlay from '@/components/ModalOverlay';
import AutocompletarCliente from '@/components/AutocompletarCliente';
import LineaDelDia from '@/components/bitacora/LineaDelDia';
import IconoTipo from '@/components/bitacora/IconoTipo';
import { Play, Pause, CalendarClock, List, AlertTriangle } from 'lucide-react';
import Logo from '@/components/Logo';

// Bitácora del técnico: lo que hace fuera de un servicio programado
// (traslados, compras, oficina, capacitación, apoyos). Se inicia con un toque
// sobre el tipo; «Mi día» junta servicios y actividades en una línea de
// tiempo. Un día con actividad ya no pide reporte ni justificación
// (patch_bitacora_tipos.sql).

function tiempoTranscurrido(desde: string, ahora: number): string {
  const mins = Math.max(0, Math.floor((ahora - new Date(desde).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

const ESTADO_CHIP: Record<string, { label: string; className: string }> = {
  en_curso: { label: 'En curso', className: 'bg-teal/15 text-teal' },
  pausada: { label: 'Pausada', className: 'bg-amber/15 text-amber' },
  concluida: { label: 'Concluida', className: 'bg-surface-2 text-muted' },
};

export default function BitacoraList({ userName }: { userName: string }) {
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<'dia' | 'actividades'>('dia');
  // Tipo elegido: abre la hoja para ponerle nombre y, si aplica, cliente.
  const [nuevo, setNuevo] = useState<TipoActividad | null>(null);
  const [titulo, setTitulo] = useState('');
  const [cliente, setCliente] = useState('');
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reloj para «iniciada hace…»: se lee ya montado y avanza cada minuto.
  const [ahora, setAhora] = useState(0);

  useEffect(() => {
    setAhora(Date.now());
    const id = setInterval(() => setAhora(Date.now()), 60000);
    (async () => {
      // Lo que quedó abierto de días anteriores se cierra antes de listar.
      await cerrarActividadesAbiertas();
      try {
        setActividades(await listarMisActividades());
      } catch (e: any) {
        setError(e?.message || 'No se pudieron cargar las actividades');
      } finally {
        setLoading(false);
      }
    })();
    listarMisServicios().then(setServicios).catch(() => {});
    return () => clearInterval(id);
  }, []);

  function abrirNuevo(tipo: TipoActividad) {
    setNuevo(tipo);
    setTitulo(tipoActividad(tipo).nombre);
    setCliente('');
    setClienteId(null);
    setError(null);
  }

  async function handleCrear() {
    if (!nuevo) return;
    if (!titulo.trim()) { setError('Ponle un nombre a la actividad.'); return; }
    setCreando(true);
    setError(null);
    try {
      const nueva = await crearActividad(cliente.trim() || tipoActividad(nuevo).nombre, titulo.trim(), { tipo: nuevo, clienteId });
      showToast('Actividad iniciada', 'success');
      window.location.href = `/bitacora/${nueva.id}`;
    } catch (e: any) {
      setError(e?.message || 'No se pudo iniciar la actividad.');
      setCreando(false);
    }
  }

  const activas = actividades.filter((a) => a.estado !== 'concluida');
  const concluidas = actividades.filter((a) => a.estado === 'concluida');
  const porConfirmar = concluidas.filter((a) => a.cierre_automatico);

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
          detalle="Lo que haces fuera de un servicio programado. Un día con actividad registrada ya no pide reporte ni justificación."
        />

        {error && !nuevo && <p className="text-red text-[13.5px] mb-3">{error}</p>}

        {/* Lo que está abierto ahora va arriba de todo: es a lo que se regresa. */}
        {activas.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3 mb-5">
            {activas.map((a) => {
              const tipo = tipoActividad(a.tipo);
              return (
                <Link
                  key={a.id}
                  href={`/bitacora/${a.id}`}
                  className="flex items-center gap-3.5 rounded-2xl border border-teal/40 bg-teal/8 p-4 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-diffuse active:translate-y-0 active:scale-[0.99]"
                >
                  <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-white" style={{ backgroundColor: tipo.color }}>
                    <IconoTipo tipo={tipo.clave} size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display font-bold text-[16px] tracking-wide leading-snug truncate">{a.titulo}</span>
                    <span className="block text-[13px] text-muted truncate">
                      {a.estado === 'pausada' ? 'En pausa' : 'En curso'} · iniciada hace {tiempoTranscurrido(a.hora_inicio, ahora)}
                    </span>
                  </span>
                  <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${a.estado === 'pausada' ? 'bg-amber/15 text-amber' : 'bg-teal text-inkOnAccent'}`}>
                    {a.estado === 'pausada' ? <Pause size={16} strokeWidth={2.6} /> : <Play size={15} strokeWidth={2.8} fill="currentColor" />}
                  </span>
                </Link>
              );
            })}
          </div>
        )}

        {porConfirmar.length > 0 && (
          <div className="mb-5 rounded-2xl border border-amber/40 bg-amber/8 p-3.5">
            <p className="text-[13.5px] font-semibold text-amber flex items-center gap-2">
              <AlertTriangle size={16} strokeWidth={2.4} />
              {porConfirmar.length === 1 ? 'Una actividad se cerró sola' : `${porConfirmar.length} actividades se cerraron solas`}
            </p>
            <p className="text-[12.5px] text-ink/80 mt-1 leading-snug">Quedaron abiertas al terminar el día. Ábrelas y confirma a qué hora terminaste.</p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {porConfirmar.slice(0, 6).map((a) => (
                <Link key={a.id} href={`/bitacora/${a.id}`} className="text-[12.5px] font-semibold px-3 min-h-[34px] rounded-full border border-amber/50 text-amber inline-flex items-center">
                  {a.titulo} · {new Date(a.hora_inicio).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Iniciar: un toque sobre el tipo */}
        <RotuloGrupo>Iniciar una actividad</RotuloGrupo>
        <div className="grid grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-2.5 mb-6">
          {TIPOS_ACTIVIDAD.map((t) => (
            <button
              key={t.clave}
              type="button"
              onClick={() => abrirNuevo(t.clave)}
              className="group rounded-2xl border border-line bg-surface p-2.5 sm:p-3.5 flex flex-col items-center sm:items-start text-center sm:text-left transition-all duration-150 hover:border-line-strong hover:-translate-y-0.5 hover:shadow-diffuse active:translate-y-0 active:scale-[0.97]"
            >
              <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-white mb-2 sm:mb-2.5 transition-transform group-hover:scale-105" style={{ backgroundColor: t.color }}>
                <IconoTipo tipo={t.clave} size={21} />
              </span>
              <span className="block font-display font-semibold text-[13px] sm:text-[14.5px] tracking-wide leading-tight">{t.nombre}</span>
              <span className="hidden sm:block text-[12px] text-muted leading-snug mt-1">{t.ejemplo}</span>
            </button>
          ))}
        </div>

        <SubTabs
          activa={sub}
          onCambiar={setSub}
          opciones={[
            { k: 'dia', label: 'Mi día', Icono: CalendarClock },
            { k: 'actividades', label: 'Actividades', Icono: List },
          ]}
        />

        {sub === 'dia' && (
          <LineaDelDia
            servicios={servicios}
            actividades={actividades}
            hrefServicio={(id) => `/servicios/${id}`}
            hrefActividad={(id) => `/bitacora/${id}`}
          />
        )}

        {sub === 'actividades' && (
          <>
            {loading && <p className="text-center text-muted py-10 text-sm">Cargando...</p>}

            {!loading && actividades.length > 0 && (
              <VistaCondicional
                tabla={
                  <TablaLista<Actividad>
                    filas={[...activas, ...concluidas]}
                    keyFn={(a) => a.id}
                    hrefFn={(a) => `/bitacora/${a.id}`}
                    columnas={[
                      { header: 'Actividad', render: (a) => <span className="font-semibold">{a.titulo}</span> },
                      { header: 'Tipo', render: (a) => tipoActividad(a.tipo).nombre },
                      { header: 'Cliente / proyecto', render: (a) => a.proyecto },
                      {
                        header: 'Estado',
                        render: (a) => (
                          <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${a.cierre_automatico ? 'bg-amber/15 text-amber' : ESTADO_CHIP[a.estado].className}`}>
                            {a.cierre_automatico ? 'Confirma la hora' : ESTADO_CHIP[a.estado].label}
                          </span>
                        ),
                      },
                      { header: 'Fecha', render: (a) => <span className="tabular-nums whitespace-nowrap">{new Date(a.hora_inicio).toLocaleDateString('es-MX')}</span> },
                    ]}
                  />
                }
                tarjetas={
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5">
                    {[...activas, ...concluidas].map((a) => {
                      const tipo = tipoActividad(a.tipo);
                      return (
                        <Link
                          key={a.id}
                          href={`/bitacora/${a.id}`}
                          className="flex items-center gap-3 rounded-2xl bg-surface border border-line px-4 py-3.5 transition-all duration-150 hover:border-teal/45 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]"
                        >
                          <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white" style={{ backgroundColor: tipo.color }}>
                            <IconoTipo tipo={tipo.clave} size={17} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[14px] font-semibold truncate">{a.titulo}</span>
                            <span className="block text-[12.5px] text-muted truncate">
                              {new Date(a.hora_inicio).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} · {a.proyecto}
                            </span>
                          </span>
                          <span className={`text-[11.5px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${a.cierre_automatico ? 'bg-amber/15 text-amber' : ESTADO_CHIP[a.estado].className}`}>
                            {a.cierre_automatico ? 'Confirma la hora' : ESTADO_CHIP[a.estado].label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                }
              />
            )}

            {!loading && actividades.length === 0 && (
              <EstadoVacio icono={<EmptyIllustration variante="historial" />} titulo="Todavía no hay actividades" detalle="Toca un tipo arriba para registrar lo que haces fuera de un servicio." />
            )}
          </>
        )}
      </div>

      {nuevo && (
        <ModalOverlay onClose={() => !creando && setNuevo(null)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0" style={{ backgroundColor: tipoActividad(nuevo).color }}>
                <IconoTipo tipo={nuevo} size={21} />
              </span>
              <div className="min-w-0">
                <p className="font-display font-bold text-[18px] tracking-wide leading-tight">{tipoActividad(nuevo).nombre}</p>
                <p className="text-[12.5px] text-muted">Se registran la hora y tu ubicación al iniciar.</p>
              </div>
            </div>

            <label className="block text-[13px] font-medium text-ink/70 mb-1.5">¿Qué vas a hacer?</label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="w-full px-3.5 min-h-[46px] mb-3 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]"
            />

            <label className="block text-[13px] font-medium text-ink/70 mb-1.5">Cliente o lugar (opcional)</label>
            <AutocompletarCliente
              value={cliente}
              onChange={(nombre, id) => { setCliente(nombre); setClienteId(id); }}
              className="w-full px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]"
              placeholder="Escribe para buscar"
              soloSugerir
            />

            {error && <p className="text-red text-[13px] mt-2.5">{error}</p>}

            <div className="flex gap-2 mt-4">
              <button type="button" onClick={() => setNuevo(null)} disabled={creando} className="flex-1 min-h-[50px] rounded-2xl border border-line-strong text-ink/80 text-[14.5px] font-semibold active:scale-95 transition-transform disabled:opacity-60">
                Cancelar
              </button>
              <button type="button" onClick={handleCrear} disabled={creando} className="flex-1 min-h-[50px] rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60">
                <Play size={15} strokeWidth={2.8} fill="currentColor" />
                {creando ? 'Iniciando...' : 'Iniciar'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
