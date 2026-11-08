'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronLeft, CircuitBoard, MapPin, Plus, Settings2, WifiOff, X } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import FrentePanel, { COLOR_TIPO, DESCRIPCION_TIPO, ICONO_TIPO, fondo } from '@/components/lazos/FrentePanel';
import FormPanel from '@/components/lazos/FormPanel';
import PanelLazos from '@/components/lazos/PanelLazos';
import { NuevoLazo } from '@/app/lazos/LazosList';
import { catalogoEnCache, listarCatalogoClientes } from '@/lib/clientesCatalogo';
import { NOMBRE_CIRCUITO, Panel, SALIDA_CIRCUITO, TipoCircuito, ordenarCircuitos, siguienteNumeroDeLazo } from '@/lib/lazos';
import { useEsAncho } from '@/lib/useEsAncho';
import { LazoResumen, asignarPanel, listarLazos, listarPaneles, nombreCompletoPanel, textoDePanel } from '@/lib/lazosDatos';

type Vista = 'circuitos' | 'diagrama';

export default function PanelDetalle({ panelId, esSupervisor }: { panelId: string; esSupervisor: boolean }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  // Computadora: circuitos y diagrama lado a lado, sin pestañas.
  const esAncho = useEsAncho();
  const [lazos, setLazos] = useState<LazoResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinConexion, setSinConexion] = useState(false);
  const [nombreCliente, setNombreCliente] = useState('');
  const [vista, setVista] = useState<Vista>('circuitos');
  const [editando, setEditando] = useState(false);
  const [capturando, setCapturando] = useState<{ tipo: TipoCircuito; numero: number } | null>(null);
  const [pasando, setPasando] = useState<string | null>(null);
  const [eligiendoTipo, setEligiendoTipo] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [rPaneles, rLazos] = await Promise.all([listarPaneles(), listarLazos()]);
      if (rPaneles.faltaPatch) throw new Error('Los paneles todavía no están activados: falta correr supabase/patch_lazos_paneles.sql en la base.');
      const encontrado = rPaneles.paneles.find((p) => p.id === panelId) || null;
      setPanel(encontrado);
      setLazos(rLazos.lazos);
      setSinConexion(rPaneles.sinConexion || rLazos.sinConexion);
      if (encontrado) {
        const nombre = (lista: { id: string; nombre: string }[]) => lista.find((c) => c.id === encontrado.cliente_id)?.nombre || '';
        setNombreCliente(nombre(catalogoEnCache()));
        listarCatalogoClientes().then((c) => setNombreCliente(nombre(c))).catch(() => {
          // Sin señal se queda el nombre de la copia local.
        });
      }
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el panel.');
    }
    setCargando(false);
  }, [panelId]);

  useEffect(() => { cargar(); }, [cargar]);

  async function pasarAlPanel(lazo: LazoResumen) {
    if (!panel) return;
    setPasando(lazo.id);
    try {
      const cambios = await asignarPanel(lazo.id, panel);
      setLazos((todos) => todos.map((l) => (l.id === lazo.id ? { ...l, ...cambios } : l)));
      showToast(`${lazo.codigo} quedó en este panel`);
    } catch (e: any) {
      showToast(e?.message || 'No se pudo pasar el circuito al panel.', 'error');
    }
    setPasando(null);
  }

  if (cargando) return <p className="p-6 text-[14px] text-muted">Cargando…</p>;

  if (!panel) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p className="rounded-xl bg-red/10 text-red text-[14px] px-4 py-3">
          {error || 'No se encontró el panel; quizá lo borraron.'}{' '}
          <button type="button" onClick={() => { setCargando(true); cargar(); }} className="underline font-semibold">Reintentar</button>
        </p>
        <Link href="/lazos" className="inline-block mt-4 text-teal font-semibold text-[14px]">Volver a los lazos</Link>
      </div>
    );
  }

  const circuitos = ordenarCircuitos(lazos.filter((l) => l.panel_id === panel.id));
  const sueltos = lazos.filter((l) => l.cliente_id === panel.cliente_id && !l.panel_id);
  const dispositivos = circuitos.reduce((suma, l) => suma + l.dispositivos, 0);
  const fallas = circuitos.filter((l) => l.fallaAbierta).length;

  const pestanas: { k: Vista; label: string }[] = [
    { k: 'circuitos', label: 'Circuitos' },
    { k: 'diagrama', label: 'Diagrama' },
  ];

  return (
    <div className="max-w-3xl lg:max-w-[1500px] mx-auto pb-28">
      <div className="sticky top-0 z-20 glass-strong px-4 lg:px-8 py-3" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2">
          <Link href={`/lazos?cliente=${panel.cliente_id}`} aria-label="Volver a los lazos del cliente" className="shrink-0 w-11 h-11 -ml-1.5 rounded-full flex items-center justify-center active:scale-90 transition-transform">
            <ChevronLeft size={24} strokeWidth={2.4} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] text-faint uppercase tracking-[0.06em] truncate">Panel{nombreCliente ? ` · ${nombreCliente}` : ''}</p>
            <h1 className="font-display font-bold text-[22px] leading-tight truncate">{panel.nombre}</h1>
          </div>
          <button type="button" onClick={() => setEditando(true)} aria-label="Datos del panel" className="w-10 h-10 rounded-full flex items-center justify-center text-muted hover:bg-surface-2">
            <Settings2 size={20} strokeWidth={2.2} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface border border-line p-1 mt-2.5 lg:hidden" role="tablist">
          {pestanas.map((p) => (
            <button key={p.k} type="button" role="tab" aria-selected={vista === p.k} onClick={() => setVista(p.k)}
              className={`min-h-[38px] rounded-lg text-[13px] font-semibold ${vista === p.k ? 'bg-teal text-inkOnAccent' : 'text-muted'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 lg:px-8 pt-4">
        {sinConexion && (
          <p className="flex items-center gap-2 rounded-xl bg-amber/10 text-amber text-[13px] px-3 py-2 mb-3">
            <WifiOff size={16} strokeWidth={2.4} /> Sin señal: es lo último que se cargó en este teléfono.
          </p>
        )}

        <div className={esAncho ? 'grid grid-cols-[minmax(360px,440px)_minmax(0,1fr)] gap-5 items-start' : ''}>
        <div>
        {/* Ficha del panel, como la placa del equipo. */}
        <section className="rounded-2xl border border-line bg-surface p-4 mb-4 relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-teal/10" aria-hidden="true" />
          <div className="flex items-start gap-3 relative">
            <span className="w-12 h-12 shrink-0 rounded-2xl bg-teal/15 text-teal flex items-center justify-center">
              <CircuitBoard size={26} strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[15px] font-semibold truncate">{panel.modelo || 'Modelo sin anotar'}</p>
              {panel.ubicacion && (
                <p className="flex items-center gap-1 text-[12.5px] text-muted mt-0.5"><MapPin size={13} strokeWidth={2.4} className="shrink-0" /><span className="truncate">{panel.ubicacion}</span></p>
              )}
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-2 mt-4 relative">
            <div className="rounded-xl bg-surface-2 px-2.5 py-2">
              <dt className="text-[11px] text-faint">Circuitos</dt>
              <dd className="font-display font-bold text-[20px] leading-tight">{circuitos.length}</dd>
            </div>
            <div className="rounded-xl bg-surface-2 px-2.5 py-2">
              <dt className="text-[11px] text-faint">Dispositivos</dt>
              <dd className="font-display font-bold text-[20px] leading-tight">{dispositivos}</dd>
            </div>
            <div className={`rounded-xl px-2.5 py-2 ${fallas > 0 ? 'bg-amber/15' : 'bg-surface-2'}`}>
              <dt className={`text-[11px] ${fallas > 0 ? 'text-amber' : 'text-faint'}`}>Fallas abiertas</dt>
              <dd className={`font-display font-bold text-[20px] leading-tight ${fallas > 0 ? 'text-amber' : ''}`}>{fallas}</dd>
            </div>
          </dl>
        </section>

        {(vista === 'circuitos' || esAncho) && (
          <>
            <FrentePanel circuitos={circuitos} />

            {sueltos.length > 0 && (
              <section className="mt-6">
                <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted mb-1">Circuitos del cliente sin panel</h2>
                <p className="text-[12.5px] text-faint mb-2">Se capturaron antes de registrar el panel. Si salen de este, pásalos aquí.</p>
                <ul className="flex flex-col gap-2">
                  {sueltos.map((l) => (
                    <li key={l.id} className="rounded-2xl border border-line bg-surface p-3 flex items-center gap-3">
                      <Link href={`/lazos/${l.id}`} className="flex-1 min-w-0">
                        <span className="block text-[14px] font-semibold truncate"><span className="font-mono text-teal">{l.codigo}</span> {l.nombre}</span>
                        <span className="block text-[12px] text-muted">{NOMBRE_CIRCUITO[l.tipo]}{l.numero ? ` · número ${l.numero}` : ''} · {l.dispositivos} dispositivos</span>
                      </Link>
                      <button type="button" onClick={() => pasarAlPanel(l)} disabled={pasando === l.id}
                        className="shrink-0 min-h-[40px] px-3 rounded-xl border border-teal/60 bg-teal/10 text-teal text-[13px] font-semibold disabled:opacity-60">
                        {pasando === l.id ? 'Pasando…' : 'Pasar aquí'}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        </div>
        {(vista === 'diagrama' || esAncho) && (
          <div className={esAncho ? 'sticky top-[110px] max-h-[calc(100vh-130px)] overflow-y-auto pb-20' : ''}>
          {circuitos.length === 0 ? (
            <p className="flex items-center gap-2 text-[14px] text-muted py-6">
              <AlertTriangle size={16} strokeWidth={2.4} /> Todavía no hay circuitos capturados en este panel.
            </p>
          ) : (
            <PanelLazos lazos={circuitos} nombrePanel={nombreCompletoPanel(panel)} />
          )}
          </div>
        )}
        </div>
      </div>

      {/* pr-20: deja libre el botón flotante del asistente. */}
      {(vista === 'circuitos' || esAncho) && (
        <div className="fixed bottom-0 inset-x-0 z-10 bg-bg/95 border-t border-line pl-4 pr-20 sm:pr-4 pt-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={() => setEligiendoTipo(true)}
            className="w-full max-w-3xl mx-auto min-h-[52px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[15.5px] flex items-center justify-center gap-2">
            <Plus size={19} strokeWidth={2.6} /> Agregar circuito
          </button>
        </div>
      )}

      {eligiendoTipo && (
        <ModalOverlay onClose={() => setEligiendoTipo(false)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-4">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="font-display font-bold text-[21px]">Agregar circuito</h2>
              <button type="button" onClick={() => setEligiendoTipo(false)} aria-label="Cerrar" className="w-10 h-10 rounded-full flex items-center justify-center text-muted hover:bg-surface-2">
                <X size={20} strokeWidth={2.4} />
              </button>
            </div>
            <p className="text-[12.5px] text-muted mb-3">¿Qué sale de esta tarjeta o salida del panel?</p>
            <div className="flex flex-col gap-2">
              {(['deteccion', 'estrobos', 'voceo'] as TipoCircuito[]).map((tipo) => {
                const color = COLOR_TIPO[tipo];
                const Icono = ICONO_TIPO[tipo];
                const numero = siguienteNumeroDeLazo(circuitos, tipo);
                return (
                  <button key={tipo} type="button"
                    onClick={() => { setEligiendoTipo(false); setCapturando({ tipo, numero }); }}
                    className="w-full rounded-2xl border p-3 flex items-center gap-3 text-left transition-transform active:scale-[0.98]"
                    style={{ borderColor: fondo(color, 45), backgroundColor: fondo(color, 8) }}>
                    <span className="w-12 h-12 shrink-0 rounded-xl flex items-center justify-center" style={{ color, backgroundColor: fondo(color, 16) }}>
                      <Icono size={22} strokeWidth={2.2} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-display font-bold text-[17px]" style={{ color }}>{SALIDA_CIRCUITO[tipo]}</span>
                      <span className="block text-[13px] text-muted">{DESCRIPCION_TIPO[tipo]}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[12.5px] font-semibold rounded-lg px-2 py-1" style={{ color, backgroundColor: fondo(color, 16) }}>
                      {SALIDA_CIRCUITO[tipo]} {numero}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </ModalOverlay>
      )}

      {capturando && (
        <NuevoLazo
          clienteInicial={{ id: panel.cliente_id, nombre: nombreCliente || 'Cliente' }}
          lazosExistentes={lazos}
          inicial={{ tipo: capturando.tipo, numero: capturando.numero, clase: 'B', panel: textoDePanel(panel), panel_id: panel.id }}
          onCerrar={() => setCapturando(null)}
          onCreado={(id) => { window.location.href = `/lazos/${id}`; }}
        />
      )}

      {editando && (
        <FormPanel
          panel={panel}
          clienteInicial={null}
          esSupervisor={esSupervisor}
          onCerrar={() => setEditando(false)}
          onGuardado={(guardado) => {
            setEditando(false);
            if (!guardado) {
              window.location.href = `/lazos?cliente=${panel.cliente_id}`;
              return;
            }
            setPanel(guardado);
            const texto = textoDePanel(guardado);
            setLazos((todos) => todos.map((l) => (l.panel_id === guardado.id ? { ...l, panel: texto } : l)));
          }}
        />
      )}
    </div>
  );
}
