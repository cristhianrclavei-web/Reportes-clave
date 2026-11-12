'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Building2, Cable, ChevronRight, CircuitBoard, Map as IconoPlano, MapPin, Plus, Search, WifiOff, X } from 'lucide-react';
import FormPanel from '@/components/lazos/FormPanel';
import NuevoPlano from '@/components/lazos/NuevoPlano';
import { SalidasCompactas } from '@/components/lazos/FrentePanel';
import MenuCuenta from '@/components/MenuCuenta';
import SupervisorShell from '@/components/SupervisorShell';
import GuiasLista from '@/components/guias/GuiasLista';
import type { GuiaInicial } from '@/lib/guiaDesdeCotizacion';
import TecnicoTabs from '@/components/TecnicoTabs';
import Logo from '@/components/Logo';
import ModalOverlay from '@/components/ModalOverlay';
import AutocompletarCliente from '@/components/AutocompletarCliente';
import EstadoVacio from '@/components/EstadoVacio';
import EncabezadoSeccion, { BOTON_PRINCIPAL } from '@/components/tecnico/EncabezadoSeccion';
import { showToast } from '@/components/Toast';
import { catalogoEnCache, listarCatalogoClientes, normalizar, ClienteCatalogo } from '@/lib/clientesCatalogo';
import { NOMBRE_CIRCUITO, PREFIJO_CIRCUITO, Panel, TipoCircuito, etiquetaSalida } from '@/lib/lazos';
import { crearLazo, listarLazos, listarPaneles, LazoResumen } from '@/lib/lazosDatos';
import { listarPlanos, type PlanoResumen } from '@/lib/planosDatos';
import { useEsAncho } from '@/lib/useEsAncho';

const DETALLE = 'Diagramas unifilares y planos por cliente. Por ahora, del sistema de detección de incendio: lazos, voceo y estrobos.';

const BOTON_SECUNDARIO = 'min-h-[48px] lg:min-h-[46px] px-4 rounded-2xl border border-line bg-surface-2 font-semibold text-[14.5px] flex items-center justify-center gap-2 hover:border-teal/60';

const CAMPO = 'w-full px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]';

type Errores = Partial<Record<'cliente' | 'nombre' | 'codigo' | 'numero', string>>;

export default function LazosList({ userName, esSupervisor, clienteInicial, verInicial, guiaInicial }: {
  userName: string;
  esSupervisor: boolean;
  clienteInicial: string | null;
  // Qué pestaña abre: los lazos y planos de detección, o las guías de conexión.
  verInicial: 'lazos' | 'guias';
  guiaInicial: GuiaInicial | null;
}) {
  const [ver, setVer] = useState<'lazos' | 'guias'>(verInicial);
  const [lazos, setLazos] = useState<LazoResumen[]>([]);
  const [clientes, setClientes] = useState<ClienteCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [sinConexion, setSinConexion] = useState(false);
  const [filtroCliente, setFiltroCliente] = useState<string | null>(clienteInicial);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [paneles, setPaneles] = useState<Panel[]>([]);
  const [faltaPatchPaneles, setFaltaPatchPaneles] = useState(false);
  const [nuevoPanel, setNuevoPanel] = useState(false);
  const [planos, setPlanos] = useState<PlanoResumen[]>([]);
  const [faltaPatchPlanos, setFaltaPatchPlanos] = useState(true);
  // Subir plano: con el cliente ya elegido si se abre desde su tarjeta.
  const [nuevoPlano, setNuevoPlano] = useState<{ cliente: { id: string; nombre: string } | null } | null>(null);

  async function cargar() {
    setErrorCarga(null);
    try {
      const [resultado, rPaneles] = await Promise.all([listarLazos(), listarPaneles()]);
      setLazos(resultado.lazos);
      setPaneles(rPaneles.paneles);
      setFaltaPatchPaneles(rPaneles.faltaPatch);
      setSinConexion(resultado.sinConexion || rPaneles.sinConexion);
    } catch (e: any) {
      setErrorCarga(e?.message || 'No se pudieron cargar los lazos.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // Los planos necesitan señal; sin ellos la lista de lazos sigue igual.
    listarPlanos()
      .then((r) => { setPlanos(r.planos); setFaltaPatchPlanos(r.faltaPatch); })
      .catch((e) => { if (navigator.onLine) showToast(e?.message || 'No se pudieron cargar los planos.', 'error'); });
    // Nombres de los clientes: primero la copia local (funciona sin señal).
    setClientes(catalogoEnCache());
    listarCatalogoClientes().then(setClientes).catch(() => {});
  }, []);

  const nombreCliente = (id: string) => clientes.find((c) => c.id === id)?.nombre || 'Cliente';

  const visibles = filtroCliente ? lazos.filter((l) => l.cliente_id === filtroCliente) : lazos;
  const panelesVisibles = filtroCliente ? paneles.filter((p) => p.cliente_id === filtroCliente) : paneles;
  const planosVisibles = filtroCliente ? planos.filter((p) => p.cliente_id === filtroCliente) : planos;

  // Agrupados por cliente, en orden alfabético. Un cliente con panel pero
  // todavía sin circuitos también sale.
  const porCliente = new Map<string, LazoResumen[]>();
  for (const panel of panelesVisibles) {
    if (!porCliente.has(panel.cliente_id)) porCliente.set(panel.cliente_id, []);
  }
  for (const plano of planosVisibles) {
    if (!porCliente.has(plano.cliente_id)) porCliente.set(plano.cliente_id, []);
  }
  for (const lazo of visibles) {
    const lista = porCliente.get(lazo.cliente_id) || [];
    lista.push(lazo);
    porCliente.set(lazo.cliente_id, lista);
  }
  const grupos = [...porCliente.entries()].sort((a, b) => nombreCliente(a[0]).localeCompare(nombreCliente(b[0]), 'es'));

  // En computadora es una mesa de trabajo: a la izquierda los clientes (con
  // buscador) y a la derecha solo el cliente elegido, con sus circuitos en tabla.
  const esAncho = useEsAncho();
  const [clienteElegido, setClienteElegido] = useState<string | null>(null);
  const [buscarCliente, setBuscarCliente] = useState('');
  const conLista = esAncho && grupos.length > 1;
  const idElegido = conLista ? (grupos.find(([id]) => id === clienteElegido) || grupos[0])[0] : null;
  const gruposALaVista = idElegido ? grupos.filter(([id]) => id === idElegido) : grupos;
  const textoBuscado = normalizar(buscarCliente);
  const gruposEnLista = grupos.filter(([id]) => normalizar(nombreCliente(id)).includes(textoBuscado));
  const fallasAbiertas = visibles.filter((l) => l.fallaAbierta).length;

  // Supervisión lo ve dentro de su panel (con su barra de secciones); el
  // técnico, como una sección más con sus pestañas.
  const marco = (contenido: React.ReactNode) => (esSupervisor ? (
    <SupervisorShell active="diagramas" title="Diagramas y planos" userName={userName} wrapperClassName="max-w-2xl lg:max-w-[1500px] mx-auto pb-16 lg:px-8 2xl:px-10">
      {contenido}
    </SupervisorShell>
  ) : (
    <div className="max-w-2xl mx-auto pb-16 lg:max-w-none lg:px-6">
      <div className="sticky top-0 z-20 bg-bg pb-2">
        <div className="barra-fija px-5 pb-3 flex items-center justify-between gap-3" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
          <Logo variante="completo" size={34} className="min-w-0" />
          <MenuCuenta nombre={userName} respaldo="Personal técnico" />
        </div>
        <TecnicoTabs active="lazos" />
      </div>
      {contenido}
    </div>
  ));

  const botones = (
            <div className="flex flex-col sm:flex-row gap-2">
              {!faltaPatchPaneles && (
                <button type="button" onClick={() => setNuevoPanel(true)} className={BOTON_PRINCIPAL}>
                  <CircuitBoard size={19} strokeWidth={2.4} /> Nuevo panel
                </button>
              )}
              <div className="grid grid-cols-2 sm:flex gap-2">
                <button type="button" onClick={() => setNuevoAbierto(true)} className={BOTON_SECUNDARIO}>
                  <Plus size={18} strokeWidth={2.6} /> Circuito
                </button>
                {!faltaPatchPlanos && (
                  <button type="button" onClick={() => setNuevoPlano({ cliente: filtroCliente ? { id: filtroCliente, nombre: nombreCliente(filtroCliente) } : null })} className={BOTON_SECUNDARIO}>
                    <IconoPlano size={18} strokeWidth={2.4} /> Plano
                  </button>
                )}
              </div>
            </div>
  );

  return marco(
    <>
      {/* En el panel del supervisor el margen lo da el marco. */}
      <div className={esSupervisor ? 'px-4 lg:px-0 pt-4' : 'px-5 pt-4'}>
        {/* Dos mitades de la sección: lo de detección de incendio y las guías de cualquier sistema. */}
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface border border-line p-1 mb-4 lg:max-w-md" role="tablist" aria-label="Qué ver">
          {([['lazos', 'Lazos y planos'], ['guias', 'Guías de conexión']] as const).map(([clave, texto]) => (
            <button key={clave} type="button" role="tab" aria-selected={ver === clave} onClick={() => setVer(clave)}
              className={`min-h-[42px] rounded-lg text-[13.5px] font-semibold ${ver === clave ? 'bg-teal text-inkOnAccent' : 'text-muted'}`}>
              {texto}
            </button>
          ))}
        </div>

        {ver === 'guias' && (
          <>
            {!esSupervisor && <h1 className="font-display font-bold text-[26px] leading-tight tracking-wide mb-2">Guías de conexión</h1>}
            <GuiasLista esSupervisor={esSupervisor} inicial={guiaInicial} />
          </>
        )}

        {ver === 'lazos' && (
        <>
        {esSupervisor ? (
          // En el panel del supervisor el título ya lo pone el marco: aquí solo la descripción y los botones.
          <div className="flex flex-col gap-3 mb-5 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-[14px] text-muted leading-snug">{DETALLE}</p>
            <div className="shrink-0">{botones}</div>
          </div>
        ) : (
          <EncabezadoSeccion titulo="Diagramas y planos" detalle={DETALLE} accion={botones} />
        )}

        {sinConexion && (
          <p className="flex items-center gap-2 text-[13px] text-amber bg-amber/10 rounded-xl px-3 py-2 mb-4">
            <WifiOff size={16} strokeWidth={2.4} /> Sin señal: es la última lista que se cargó en este teléfono.
          </p>
        )}

        {filtroCliente && (
          <button type="button" onClick={() => setFiltroCliente(null)} className="mb-4 inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-full bg-surface-2 border border-line text-[13px]">
            Solo {nombreCliente(filtroCliente)} <X size={14} strokeWidth={2.4} aria-label="Quitar filtro" />
          </button>
        )}

        {errorCarga && (
          <div className="rounded-xl bg-red/10 text-red text-[14px] px-4 py-3 mb-4">
            {errorCarga}{' '}
            <button type="button" onClick={() => { setCargando(true); cargar(); }} className="underline font-semibold">Reintentar</button>
          </div>
        )}

        {cargando && <p className="text-[14px] text-muted">Cargando…</p>}

        {faltaPatchPaneles && esSupervisor && (
          <p className="flex items-start gap-2 text-[13px] text-amber bg-amber/10 rounded-xl px-3 py-2 mb-4">
            <AlertTriangle size={16} strokeWidth={2.4} className="shrink-0 mt-px" />
            Para agrupar los circuitos por panel falta correr supabase/patch_lazos_paneles.sql en la base.
          </p>
        )}

        {!cargando && !errorCarga && visibles.length === 0 && panelesVisibles.length === 0 && planosVisibles.length === 0 && (
          <EstadoVacio
            icono={<Cable size={26} strokeWidth={2} />}
            titulo="Todavía no hay diagramas ni planos"
            detalle="Crea el primer circuito y captura sus dispositivos mientras cableas, o sube un plano."
          />
        )}

        {/* Solo computadora: los números de un vistazo. */}
        {esAncho && !cargando && grupos.length > 0 && (
          <div className="grid grid-cols-6 gap-2.5 mb-5">
            <Indicador titulo="Clientes" valor={grupos.length} />
            <Indicador titulo="Paneles" valor={panelesVisibles.length} />
            <Indicador titulo="Circuitos" valor={visibles.length} />
            <Indicador titulo="Dispositivos" valor={visibles.reduce((suma, l) => suma + l.dispositivos, 0)} />
            <Indicador titulo="Planos" valor={planosVisibles.length} />
            <Indicador titulo="Fallas a tierra abiertas" valor={fallasAbiertas} alerta={fallasAbiertas > 0} />
          </div>
        )}

        <div className={conLista ? 'grid grid-cols-[300px_minmax(0,1fr)] gap-5 items-start' : ''}>
        {conLista && (
          <aside className="sticky top-[84px] rounded-3xl border border-line bg-surface/50 p-2.5 max-h-[calc(100vh-110px)] flex flex-col">
            <div className="relative mb-2">
              <Search size={16} strokeWidth={2.2} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
              <input type="search" value={buscarCliente} onChange={(ev) => setBuscarCliente(ev.target.value)}
                placeholder="Buscar cliente" aria-label="Buscar cliente"
                className="w-full pl-9 pr-3 h-10 rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[14px]" />
            </div>
            <nav className="overflow-y-auto flex flex-col gap-0.5" aria-label="Clientes">
              {gruposEnLista.map(([id, lista]) => {
                const activo = id === idElegido;
                const conFalla = lista.some((l) => l.fallaAbierta);
                return (
                  <button key={id} type="button" onClick={() => setClienteElegido(id)} aria-current={activo}
                    className={`text-left rounded-xl px-3 py-2 flex items-center gap-2.5 transition-colors ${activo ? 'bg-teal/15 text-ink' : 'hover:bg-surface-2'}`}>
                    <span className={`w-1 self-stretch rounded-full ${activo ? 'bg-teal' : 'bg-transparent'}`} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] font-semibold truncate">{nombreCliente(id)}</span>
                      <span className="block text-[12px] text-muted truncate">
                        {lista.length} {lista.length === 1 ? 'circuito' : 'circuitos'} · {lista.reduce((suma, l) => suma + l.dispositivos, 0)} dispositivos
                      </span>
                    </span>
                    {conFalla && <AlertTriangle size={15} strokeWidth={2.4} className="text-amber shrink-0" aria-label="Con falla a tierra abierta" />}
                  </button>
                );
              })}
              {gruposEnLista.length === 0 && <p className="text-[13px] text-muted px-3 py-2">Ningún cliente con ese nombre.</p>}
            </nav>
          </aside>
        )}
        <div className="min-w-0">
        {gruposALaVista.map(([clienteId, lista]) => {
          const panelesDelCliente = paneles.filter((p) => p.cliente_id === clienteId);
          const sueltos = lista.filter((l) => !l.panel_id || !panelesDelCliente.some((p) => p.id === l.panel_id));
          const planosDelCliente = planos.filter((p) => p.cliente_id === clienteId);
          const dispositivos = lista.reduce((suma, l) => suma + l.dispositivos, 0);
          const cuantosCircuitos = panelesDelCliente.length + sueltos.length;
          const resumen = [
            planosDelCliente.length ? `${planosDelCliente.length} ${planosDelCliente.length === 1 ? 'plano' : 'planos'}` : null,
            panelesDelCliente.length ? `${panelesDelCliente.length} ${panelesDelCliente.length === 1 ? 'panel' : 'paneles'}` : null,
            sueltos.length ? `${sueltos.length} sin panel` : null,
            `${dispositivos} dispositivos`,
          ].filter(Boolean).join(' · ');
          return (
          // Un cliente = una tarjeta; adentro, sus planos y sus paneles por separado.
          <section key={clienteId} className="mb-5 rounded-3xl border border-line bg-surface/50 p-3.5 sm:p-4">
            <header className="flex items-center gap-3 mb-3.5">
              <span className="w-11 h-11 shrink-0 rounded-2xl bg-surface-2 border border-line text-ink flex items-center justify-center">
                <Building2 size={21} strokeWidth={2.1} />
              </span>
              <span className="min-w-0">
                <h2 className="font-display font-bold text-[18px] leading-tight truncate">{nombreCliente(clienteId)}</h2>
                <p className="text-[12.5px] text-muted truncate">{resumen}</p>
              </span>
            </header>

            {!faltaPatchPlanos && (
              <div className="mb-4">
                <SubtituloGrupo icono={<IconoPlano size={14} strokeWidth={2.4} />} titulo="Planos" cuenta={planosDelCliente.length}
                  accion={planosDelCliente.length > 0 ? { texto: 'Subir', onClick: () => setNuevoPlano({ cliente: { id: clienteId, nombre: nombreCliente(clienteId) } }) } : null} />
                {planosDelCliente.length > 0 ? (
                  <div className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {planosDelCliente.map((plano) => (
                      <Link key={plano.id} href={`/lazos/plano/${plano.id}`}
                        className="min-w-0 rounded-2xl border border-line bg-surface p-2.5 pr-3 flex items-center gap-3 transition-colors hover:border-sky-500/60">
                        <span className="w-10 h-10 shrink-0 rounded-xl bg-sky-500/15 text-sky-500 flex items-center justify-center">
                          <IconoPlano size={19} strokeWidth={2.2} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[14.5px] font-semibold truncate">{plano.nombre}</span>
                          <span className="block text-[12px] text-muted truncate">Actualizado {fechaCorta(plano.actualizado_en)}</span>
                        </span>
                        <ChevronRight size={17} className="text-muted shrink-0" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <button type="button" onClick={() => setNuevoPlano({ cliente: { id: clienteId, nombre: nombreCliente(clienteId) } })}
                    className="w-full min-h-[48px] rounded-2xl border border-dashed border-line-strong text-[13.5px] font-semibold text-muted flex items-center justify-center gap-2 hover:text-ink">
                    <Plus size={16} strokeWidth={2.6} /> Subir el plano de este cliente
                  </button>
                )}
              </div>
            )}

            {cuantosCircuitos > 0 && (
              <div>
                <SubtituloGrupo icono={<CircuitBoard size={14} strokeWidth={2.4} />} titulo="Paneles y circuitos" cuenta={cuantosCircuitos} accion={null} />
                {/* minmax(0,1fr): una tarjeta con texto largo no se sale de la pantalla. */}
                <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 lg:grid-cols-2 xl:grid-cols-3 items-start">
                  {panelesDelCliente.map((panel) => {
                    const circuitos = lista.filter((l) => l.panel_id === panel.id);
                    const dispositivos = circuitos.reduce((suma, l) => suma + l.dispositivos, 0);
                    const conFalla = circuitos.filter((l) => l.fallaAbierta);
                    return (
                      <Link key={panel.id} href={`/lazos/panel/${panel.id}`}
                        className={`block rounded-2xl bg-surface border p-3.5 transition-colors hover:border-teal/60 ${conFalla.length ? 'border-amber/60' : 'border-line'}`}>
                        <div className="flex items-center gap-3">
                          <span className="w-11 h-11 shrink-0 rounded-xl bg-teal/15 text-teal flex items-center justify-center">
                            <CircuitBoard size={22} strokeWidth={2.2} />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[15.5px] font-semibold truncate">{panel.nombre}</span>
                            <span className="block text-[12.5px] text-muted truncate">
                              {[panel.nombre.toLowerCase().includes((panel.modelo || '').toLowerCase()) ? null : panel.modelo, `${circuitos.length} circuitos`, `${dispositivos} dispositivos`].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          <ChevronRight size={18} className="text-muted shrink-0" />
                        </div>
                        {panel.ubicacion && (
                          <p className="flex items-center gap-1 text-[12px] text-faint mt-1.5"><MapPin size={12} strokeWidth={2.4} />{panel.ubicacion}</p>
                        )}
                        <div className="mt-2.5"><SalidasCompactas circuitos={circuitos} /></div>
                        {conFalla.length > 0 && (
                          <p className="flex items-center gap-1.5 mt-2.5 text-[13px] font-medium text-amber">
                            <AlertTriangle size={15} strokeWidth={2.4} /> Falla a tierra abierta en {conFalla.map((l) => etiquetaSalida(l)).join(', ')}
                          </p>
                        )}
                      </Link>
                    );
                  })}
                  {panelesDelCliente.length > 0 && sueltos.length > 0 && (
                    <p className="col-span-full text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mt-2">Sin panel</p>
                  )}
                  {esAncho && sueltos.length > 0 && <TablaCircuitos circuitos={sueltos} />}
                  {!esAncho && sueltos.map((lazo) => (
                    <Link key={lazo.id} href={`/lazos/${lazo.id}`} className={`block rounded-2xl bg-surface border p-3.5 transition-colors hover:border-teal/60 ${lazo.fallaAbierta ? 'border-amber/60' : 'border-line'}`}>
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-[13px] rounded-lg bg-surface-2 px-2 py-1">{lazo.codigo}</span>
                        <span className="flex-1 min-w-0 text-[15.5px] font-semibold truncate">{lazo.nombre}</span>
                        <ChevronRight size={18} className="text-muted shrink-0" />
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2.5 text-[12px] text-muted">
                        <span className="rounded-full bg-surface-2 px-2.5 py-1">{NOMBRE_CIRCUITO[lazo.tipo]}</span>
                        {lazo.clase && <span className="rounded-full bg-surface-2 px-2.5 py-1">Clase {lazo.clase}</span>}
                        <span className="rounded-full bg-surface-2 px-2.5 py-1">{lazo.dispositivos} dispositivos</span>
                      </div>
                      {lazo.fallaAbierta && (
                        <p className="flex items-center gap-1.5 mt-2.5 text-[13px] font-medium text-amber">
                          <AlertTriangle size={15} strokeWidth={2.4} /> Búsqueda de falla a tierra abierta
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>
          );
        })}
        </div>
        </div>
        </>
        )}
      </div>

      {nuevoPanel && (
        <FormPanel
          clienteInicial={filtroCliente ? { id: filtroCliente, nombre: nombreCliente(filtroCliente) } : null}
          esSupervisor={esSupervisor}
          onCerrar={() => setNuevoPanel(false)}
          onGuardado={(panel) => { if (panel) window.location.href = `/lazos/panel/${panel.id}`; }}
        />
      )}

      {nuevoPlano && (
        <NuevoPlano
          clienteInicial={nuevoPlano.cliente}
          onCerrar={() => setNuevoPlano(null)}
          onCreado={(id) => { window.location.href = `/lazos/plano/${id}`; }}
        />
      )}

      {nuevoAbierto && (
        <NuevoLazo
          clienteInicial={filtroCliente ? { id: filtroCliente, nombre: nombreCliente(filtroCliente) } : null}
          lazosExistentes={lazos}
          onCerrar={() => setNuevoAbierto(false)}
          onCreado={(id) => { window.location.href = `/lazos/${id}`; }}
        />
      )}
    </>,
  );
}

// Un número grande con su título (la tira de arriba, en computadora).
function Indicador({ titulo, valor, alerta = false }: { titulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${alerta ? 'border-amber/60 bg-amber/10' : 'border-line bg-surface/60'}`}>
      <p className={`font-display font-bold text-[26px] leading-none ${alerta ? 'text-amber' : ''}`}>{valor}</p>
      <p className="text-[12px] text-muted mt-1.5 truncate">{titulo}</p>
    </div>
  );
}

// Circuitos en renglones (computadora): se comparan de un vistazo y todo el
// renglón lleva al circuito.
function TablaCircuitos({ circuitos }: { circuitos: LazoResumen[] }) {
  return (
    <div className="col-span-full rounded-2xl border border-line bg-surface overflow-hidden">
      <div className="grid grid-cols-[90px_minmax(0,1.6fr)_minmax(0,1.2fr)_80px_110px_minmax(0,1fr)_28px] gap-3 px-4 py-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-faint border-b border-line">
        <span>Código</span><span>Nombre</span><span>Tipo</span><span>Clase</span><span className="text-right">Dispositivos</span><span>Estado</span><span />
      </div>
      {circuitos.map((lazo) => (
        <Link key={lazo.id} href={`/lazos/${lazo.id}`}
          className="grid grid-cols-[90px_minmax(0,1.6fr)_minmax(0,1.2fr)_80px_110px_minmax(0,1fr)_28px] gap-3 items-center px-4 min-h-[52px] border-b border-line last:border-b-0 text-[14px] transition-colors hover:bg-teal/10">
          <span><span className="font-mono text-[12.5px] rounded-lg bg-surface-2 px-2 py-1">{lazo.codigo}</span></span>
          <span className="font-semibold truncate">{lazo.nombre}</span>
          <span className="text-muted truncate">{NOMBRE_CIRCUITO[lazo.tipo]}</span>
          <span className="text-muted">{lazo.clase || '—'}</span>
          <span className="font-mono text-right">{lazo.dispositivos}</span>
          {lazo.fallaAbierta
            ? <span className="flex items-center gap-1.5 text-amber font-medium truncate"><AlertTriangle size={15} strokeWidth={2.4} className="shrink-0" /> Falla a tierra abierta</span>
            : <span className="flex items-center gap-1.5 text-muted"><span className="w-2 h-2 rounded-full bg-green-500" /> Sin fallas</span>}
          <ChevronRight size={17} className="text-muted" />
        </Link>
      ))}
    </div>
  );
}

// También se abre desde el diagrama de un lazo para agregar el siguiente
// lazo del mismo panel (llega con panel, número y clase ya puestos).
export function NuevoLazo({ clienteInicial, lazosExistentes, inicial, onCerrar, onCreado }: {
  clienteInicial: { id: string; nombre: string } | null;
  lazosExistentes: LazoResumen[];
  inicial?: { numero: number; clase: 'A' | 'B'; panel: string; tipo?: TipoCircuito; panel_id?: string | null };
  onCerrar: () => void;
  onCreado: (id: string) => void;
}) {
  const [cliente, setCliente] = useState(clienteInicial?.nombre || '');
  const [clienteId, setClienteId] = useState<string | null>(clienteInicial?.id || null);
  const [tipo, setTipo] = useState<TipoCircuito>(inicial?.tipo || 'deteccion');
  const [numero, setNumero] = useState(String(inicial?.numero || 1));
  const [codigo, setCodigo] = useState('LZ1');
  // Mientras no se escriba a mano, el código sigue al tipo y al número.
  const [codigoAMano, setCodigoAMano] = useState(false);
  const [nombre, setNombre] = useState('');
  const [clase, setClase] = useState<'A' | 'B'>(inicial?.clase || 'B');
  const [panel, setPanel] = useState(inicial?.panel || '');
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Propone el siguiente número libre de ese tipo en el cliente elegido.
  useEffect(() => {
    if (codigoAMano) return;
    const prefijo = PREFIJO_CIRCUITO[tipo];
    const usados = lazosExistentes.filter((l) => l.cliente_id === clienteId && l.tipo === tipo).length;
    const siguiente = Number(numero) || usados + 1;
    setCodigo(`${prefijo}${siguiente}`);
  }, [tipo, numero, clienteId, codigoAMano, lazosExistentes]);

  function validar(): Errores {
    const e: Errores = {};
    if (!clienteId) e.cliente = 'Elige el cliente de la lista. Si no existe, pide a supervisión que lo dé de alta.';
    if (!nombre.trim()) e.nombre = 'Ponle un nombre, por ejemplo «Lazo 1 · Data Center».';
    if (!/^[A-Za-z0-9-]{1,12}$/.test(codigo.trim())) e.codigo = 'Solo letras, números y guion (hasta 12).';
    // En detección el número va siempre (es el «1» de L01D008); en NAC y
    // voceo es opcional fuera de un panel.
    const numeroObligatorio = tipo === 'deteccion' || !!inicial?.panel_id;
    if (numeroObligatorio || numero.trim()) {
      const n = Number(numero);
      if (!Number.isInteger(n) || n < 1 || n > 99) e.numero = 'El número va de 1 a 99.';
    }
    return e;
  }

  async function guardar() {
    const e = validar();
    setErrores(e);
    setErrorGeneral(null);
    if (Object.keys(e).length > 0) return;
    setGuardando(true);
    try {
      const lazo = await crearLazo({
        cliente_id: clienteId as string,
        tipo,
        codigo: codigo.trim().toUpperCase(),
        nombre: nombre.trim(),
        numero: numero.trim() ? Number(numero) : null,
        clase: tipo === 'deteccion' ? clase : null,
        panel: panel.trim() || null,
        panel_id: inicial?.panel_id || null,
      });
      showToast('Lazo creado');
      onCreado(lazo.id);
    } catch (err: any) {
      setErrorGeneral(err?.message || 'No se pudo crear el lazo.');
      setGuardando(false);
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onCerrar()}>
      <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[88vh] overflow-y-auto">
        <h2 className="font-display font-bold text-[22px] mb-4">Nuevo lazo o circuito</h2>

        <label className="block text-[13px] text-muted mb-1.5">Cliente</label>
        <AutocompletarCliente
          value={cliente}
          onChange={(n, id) => { setCliente(n); setClienteId(id); }}
          className={CAMPO}
          placeholder="Escribe para buscar"
          soloSugerir
        />
        {errores.cliente && <p className="text-red font-semibold text-[13px] mt-1">{errores.cliente}</p>}

        <span className="block text-[13px] text-muted mt-4 mb-1.5">Tipo</span>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="Tipo de circuito">
          {(['deteccion', 'voceo', 'estrobos'] as TipoCircuito[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => setTipo(t)}
              className={`min-h-[40px] rounded-lg text-[13.5px] font-semibold ${tipo === t ? 'bg-teal text-inkOnAccent' : 'text-muted'}`}>
              {t === 'deteccion' ? 'Detección' : t === 'voceo' ? 'Voceo' : 'NAC'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div>
              <label htmlFor="lazo-numero" className="block text-[13px] text-muted mb-1.5">
                {tipo === 'deteccion' ? 'Número de lazo (SLC)' : tipo === 'estrobos' ? 'Número de NAC' : 'Número de voceo'}
              </label>
              <input id="lazo-numero" inputMode="numeric" value={numero} onChange={(ev) => setNumero(ev.target.value.replace(/\D/g, '').slice(0, 2))} className={CAMPO} />
              {errores.numero && <p className="text-red font-semibold text-[13px] mt-1">{errores.numero}</p>}
          </div>
          <div>
            <label htmlFor="lazo-codigo" className="block text-[13px] text-muted mb-1.5">Código</label>
            <input id="lazo-codigo" value={codigo} onChange={(ev) => { setCodigo(ev.target.value.toUpperCase()); setCodigoAMano(true); }} className={`${CAMPO} font-mono`} />
            {errores.codigo && <p className="text-red font-semibold text-[13px] mt-1">{errores.codigo}</p>}
          </div>
        </div>
        <p className="text-[12px] text-faint mt-1.5">El código encabeza el nombre de cada dispositivo: {codigo || 'LZ1'}_SH_1.</p>

        <label htmlFor="lazo-nombre" className="block text-[13px] text-muted mt-4 mb-1.5">Nombre</label>
        <input id="lazo-nombre" value={nombre} onChange={(ev) => setNombre(ev.target.value)} maxLength={120} placeholder={tipo === 'deteccion' ? 'Lazo 1 · Data Center' : tipo === 'estrobos' ? 'Sirenas nivel -2' : 'Voceo planta baja'} className={CAMPO} />
        {errores.nombre && <p className="text-red font-semibold text-[13px] mt-1">{errores.nombre}</p>}

        {tipo === 'deteccion' && (
          <>
            <span className="block text-[13px] text-muted mt-4 mb-1.5">Clase</span>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="Clase del lazo">
              {(['B', 'A'] as const).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={clase === c} onClick={() => setClase(c)}
                  className={`min-h-[40px] rounded-lg text-[13.5px] font-semibold ${clase === c ? 'bg-teal text-inkOnAccent' : 'text-muted'}`}>
                  Clase {c}
                </button>
              ))}
            </div>
          </>
        )}

        {inicial?.panel_id ? (
          <p className="mt-4 text-[13px] text-muted">Panel: <span className="font-semibold text-ink">{panel}</span></p>
        ) : (
          <>
            <label htmlFor="lazo-panel" className="block text-[13px] text-muted mt-4 mb-1.5">Panel (opcional)</label>
            <input id="lazo-panel" value={panel} onChange={(ev) => setPanel(ev.target.value)} maxLength={160} placeholder="Notifier NFS2-3030, cuarto eléctrico" className={CAMPO} />
          </>
        )}

        {errorGeneral && <p className="text-red font-semibold text-[13px] mt-3">{errorGeneral}</p>}

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onCerrar} disabled={guardando} className="flex-1 min-h-[48px] rounded-xl bg-surface-2 border border-line font-semibold text-[14.5px]">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando} className="flex-[1.4] min-h-[48px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[14.5px] disabled:opacity-60">
            {guardando ? 'Creando…' : 'Crear y capturar'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function SubtituloGrupo({ icono, titulo, cuenta, accion }: {
  icono: React.ReactNode;
  titulo: string;
  cuenta: number;
  accion: { texto: string; onClick: () => void } | null;
}) {
  return (
    <div className="flex items-center gap-2 mb-2 text-faint">
      {icono}
      <span className="text-[12px] font-semibold uppercase tracking-[0.08em]">{titulo}</span>
      {cuenta > 0 && <span className="text-[12px] font-mono">{cuenta}</span>}
      <span className="flex-1 h-px bg-line" aria-hidden="true" />
      {accion && (
        <button type="button" onClick={accion.onClick} className="min-h-[32px] px-2.5 rounded-lg text-[12.5px] font-semibold text-teal flex items-center gap-1 hover:bg-surface-2">
          <Plus size={14} strokeWidth={2.6} /> {accion.texto}
        </button>
      )}
    </div>
  );
}

// «7 nov 2026». La lista se carga en el navegador, así que no afecta la hidratación.
function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Mexico_City' });
}
