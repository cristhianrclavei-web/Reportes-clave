'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Building2, Cable, ChevronRight, CircuitBoard, FileDown, Map as IconoPlano, MapPin, Plus, Search, WifiOff } from 'lucide-react';
import FormPanel from '@/components/lazos/FormPanel';
import DocumentosCliente from '@/components/lazos/DocumentosCliente';
import NuevoPlano from '@/components/lazos/NuevoPlano';
import { COLOR_TIPO, fondo } from '@/components/lazos/FrentePanel';
import MenuCuenta from '@/components/MenuCuenta';
import SupervisorShell from '@/components/SupervisorShell';
import GuiasLista from '@/components/guias/GuiasLista';
import DiagramasUnifilares from '@/components/unifilar/DiagramasUnifilares';
import PestanasProyectos from '@/components/proyectos/PestanasProyectos';
import { moverAProyecto } from '@/lib/proyectoContenido';
import type { GuiaInicial } from '@/lib/guiaDesdeCotizacion';
import TecnicoTabs from '@/components/TecnicoTabs';
import Logo from '@/components/Logo';
import ModalOverlay from '@/components/ModalOverlay';
import AutocompletarCliente from '@/components/AutocompletarCliente';
import EstadoVacio from '@/components/EstadoVacio';
import EncabezadoSeccion, { BOTON_PRINCIPAL } from '@/components/tecnico/EncabezadoSeccion';
import { showToast } from '@/components/Toast';
import { catalogoEnCache, listarCatalogoClientes, normalizar, ClienteCatalogo } from '@/lib/clientesCatalogo';
import { NOMBRE_CIRCUITO, PREFIJO_CIRCUITO, Panel, TipoCircuito, etiquetaSalida, ordenarCircuitos } from '@/lib/lazos';
import { crearLazo, listarLazos, listarPaneles, LazoResumen } from '@/lib/lazosDatos';
import { listarPlanos, type PlanoResumen } from '@/lib/planosDatos';
import { ordenarPorNivel } from '@/lib/planos';
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
  verInicial: 'lazos' | 'guias' | 'unifilares';
  guiaInicial: GuiaInicial | null;
}) {
  const [ver, setVer] = useState<'lazos' | 'guias' | 'unifilares'>(verInicial);
  const [lazos, setLazos] = useState<LazoResumen[]>([]);
  const [clientes, setClientes] = useState<ClienteCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [sinConexion, setSinConexion] = useState(false);
  // Jerarquía: sin cliente en la dirección se ven solo los clientes; con
  // `?cliente=<id>`, ese cliente con sus paneles, planos y circuitos.
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();
  const filtroCliente = parametros.get('cliente') || clienteInicial;
  const abrirCliente = (id: string | null) => router.push(id ? `${ruta}?cliente=${id}` : ruta);
  // Dentro del cliente: ver todo o solo lo de un panel.
  const [filtroPanel, setFiltroPanel] = useState<string | null>(null);
  useEffect(() => { setFiltroPanel(null); }, [filtroCliente]);
  const [buscarCliente, setBuscarCliente] = useState('');
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

  // Un renglón por cliente que tenga algo: panel, plano o circuito.
  const idsClientes = new Set<string>([...paneles.map((p) => p.cliente_id), ...planos.map((p) => p.cliente_id), ...lazos.map((l) => l.cliente_id)]);
  const textoBuscado = normalizar(buscarCliente);
  const listaClientes = [...idsClientes]
    .map((id) => {
      const circuitos = lazos.filter((l) => l.cliente_id === id);
      return {
        id,
        nombre: nombreCliente(id),
        paneles: paneles.filter((p) => p.cliente_id === id).length,
        planos: planos.filter((p) => p.cliente_id === id).length,
        circuitos: circuitos.length,
        dispositivos: circuitos.reduce((suma, l) => suma + l.dispositivos, 0),
        fallas: circuitos.filter((l) => l.fallaAbierta).length,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const clientesEnLista = listaClientes.filter((c) => normalizar(c.nombre).includes(textoBuscado));

  // Lo del cliente abierto.
  // Desde un proyecto (?proyecto=<id>): solo lo de esa obra, y lo que se
  // cree aquí queda en ella.
  const filtroProyecto = filtroCliente ? parametros.get('proyecto') : null;
  const delProyecto = (x: { proyecto_id?: string | null }) => !filtroProyecto || x.proyecto_id === filtroProyecto;
  // Aquí se consulta y se corrige; lo nuevo se crea dentro de un proyecto
  // (supervisión) o desde el servicio (técnicos). Abierta desde un proyecto, sí.
  const puedeCrear = Boolean(filtroProyecto);
  const panelesDelCliente = filtroCliente ? paneles.filter((p) => p.cliente_id === filtroCliente && delProyecto(p)) : [];
  const circuitosDelCliente = filtroCliente ? lazos.filter((l) => l.cliente_id === filtroCliente && delProyecto(l)) : [];
  const planosDelCliente = filtroCliente ? ordenarPorNivel(planos.filter((p) => p.cliente_id === filtroCliente && delProyecto(p))) : [];
  async function alProyecto(tipo: 'panel' | 'lazo', id: string) {
    if (!filtroProyecto) return;
    try {
      await moverAProyecto({ tipo, id }, filtroProyecto);
    } catch (e: any) {
      showToast(e?.message || 'Se creó, pero no quedó en el proyecto. Muévelo desde la ficha del cliente.', 'error');
    }
  }
  const panelesALaVista = filtroPanel ? panelesDelCliente.filter((p) => p.id === filtroPanel) : panelesDelCliente;
  // Un plano sin dispositivos ligados todavía se ve con cualquier panel.
  const planosALaVista = filtroPanel
    ? planosDelCliente.filter((p) => !p.paneles_en_plano || p.paneles_en_plano.length === 0 || p.paneles_en_plano.includes(filtroPanel))
    : planosDelCliente;
  const sueltos = circuitosDelCliente.filter((l) => !l.panel_id || !panelesDelCliente.some((p) => p.id === l.panel_id));
  const fallasAbiertas = circuitosDelCliente.filter((l) => l.fallaAbierta).length;
  const nombrePanel = (id: string) => paneles.find((p) => p.id === id)?.nombre || 'Panel';

  const esAncho = useEsAncho();

  // Supervisión lo ve dentro de su panel (con su barra de secciones); el
  // técnico, como una sección más con sus pestañas.
  const marco = (contenido: React.ReactNode) => (esSupervisor ? (
    <SupervisorShell active="proyectos" title="Diagramas y planos" userName={userName} wrapperClassName="max-w-2xl lg:max-w-[1500px] mx-auto pb-16 lg:px-8 2xl:px-10">
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

  const botones = !puedeCrear ? null : (
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
        {esSupervisor && <PestanasProyectos actual="diagramas" />}
        {/* Dos mitades de la sección: lo de detección de incendio y las guías de cualquier sistema. */}
        {/* Los unifilares fotovoltaicos (trámite de CFE) son solo de supervisión. */}
        <div className="grid grid-cols-3 lg:max-w-2xl gap-1 rounded-xl bg-surface border border-line p-1 mb-4" role="tablist" aria-label="Qué ver">
          {([['lazos', 'Planos y paneles'], ['unifilares', 'Diagramas unifilares'], ['guias', 'Guías de conexión']] as const).map(([clave, texto]) => (
            <button key={clave} type="button" role="tab" aria-selected={ver === clave} onClick={() => setVer(clave)}
              className={`min-h-[42px] rounded-lg text-[13.5px] font-semibold ${ver === clave ? 'bg-teal text-inkOnAccent' : 'text-muted'}`}>
              {texto}
            </button>
          ))}
        </div>

        {ver === 'guias' && (
          <>
            {!esSupervisor && <h1 className="font-display font-bold text-[26px] leading-tight tracking-wide mb-2">Guías de conexión</h1>}
            <GuiasLista esSupervisor={esSupervisor} inicial={guiaInicial} proyectoId={filtroProyecto} clienteDelProyecto={filtroProyecto ? filtroCliente : null} puedeCrear={puedeCrear || Boolean(guiaInicial)} />
          </>
        )}

        {ver === 'unifilares' && (
          <DiagramasUnifilares lazos={lazos} paneles={paneles} esSupervisor={esSupervisor} clienteId={filtroCliente} proyectoId={filtroProyecto} />
        )}

        {!filtroProyecto && ver === 'lazos' && (
          <p className="text-[13px] rounded-xl bg-surface-2 border border-line px-3 py-2 mb-4 text-muted" data-tour="diagramas-consulta">
            Aquí se consulta y se corrige lo que ya existe (abrir un plano, sembrar, marcar avance). Lo nuevo se agrega
            {esSupervisor ? ' dentro del proyecto del cliente (Proyectos → cliente → proyecto).' : ' desde tu servicio, en «Planos y diagramas del sitio».'}
          </p>
        )}
        {filtroProyecto && (
          <p className="flex flex-wrap items-center gap-2 text-[13.5px] rounded-xl bg-teal/10 px-3 py-2 mb-4">
            Solo lo del proyecto; lo que crees aquí queda en él.
            <Link href={`/dashboard/proyectos/${filtroCliente}/${filtroProyecto}`} className="font-semibold text-teal underline">Volver al proyecto</Link>
            <Link href={`${ruta}?cliente=${filtroCliente}`} className="font-semibold text-teal underline">Ver todo el cliente</Link>
          </p>
        )}

        {ver === 'lazos' && (
        <>
        {esSupervisor ? (
          // En el panel del supervisor el título ya lo pone el marco: aquí solo la descripción y los botones.
          <div className="flex flex-col gap-3 mb-5 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-[14px] text-muted leading-snug">{DETALLE}</p>
            {botones && <div className="shrink-0">{botones}</div>}
          </div>
        ) : (
          <EncabezadoSeccion titulo="Diagramas y planos" detalle={DETALLE} accion={botones} />
        )}

        {sinConexion && (
          <p className="flex items-center gap-2 text-[13px] text-amber bg-amber/10 rounded-xl px-3 py-2 mb-4">
            <WifiOff size={16} strokeWidth={2.4} /> Sin señal: es la última lista que se cargó en este teléfono.
          </p>
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

        {/* ---------- Nivel 1: solo los clientes ---------- */}
        {!filtroCliente && !cargando && !errorCarga && (
          listaClientes.length === 0 ? (
            <EstadoVacio
              icono={<Cable size={26} strokeWidth={2} />}
              titulo="Todavía no hay diagramas ni planos"
              detalle="Crea el primer panel o circuito de un cliente, o sube un plano."
            />
          ) : (
            <>
              {listaClientes.length > 6 && (
                <div className="relative mb-3 lg:max-w-md">
                  <Search size={16} strokeWidth={2.2} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
                  <input type="search" value={buscarCliente} onChange={(ev) => setBuscarCliente(ev.target.value)}
                    placeholder="Buscar cliente" aria-label="Buscar cliente"
                    className="w-full pl-9 pr-3 h-11 rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[14px]" />
                </div>
              )}
              <div className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {clientesEnLista.map((c) => (
                  <Link key={c.id} href={`${ruta}?cliente=${c.id}`}
                    className={`rounded-3xl border bg-surface p-4 flex flex-col gap-3 transition-colors hover:border-teal/60 ${c.fallas ? 'border-amber/60' : 'border-line'}`}>
                    <span className="flex items-center gap-3">
                      <span className="w-11 h-11 shrink-0 rounded-2xl bg-surface-2 border border-line flex items-center justify-center">
                        <Building2 size={21} strokeWidth={2.1} />
                      </span>
                      <span className="flex-1 min-w-0 font-display font-bold text-[17px] leading-tight truncate">{c.nombre}</span>
                      <ChevronRight size={18} className="text-muted shrink-0" />
                    </span>
                    <span className="grid grid-cols-4 gap-1.5 text-center">
                      <Conteo valor={c.paneles} texto={c.paneles === 1 ? 'panel' : 'paneles'} />
                      <Conteo valor={c.planos} texto={c.planos === 1 ? 'plano' : 'planos'} />
                      <Conteo valor={c.circuitos} texto={c.circuitos === 1 ? 'circuito' : 'circuitos'} />
                      <Conteo valor={c.dispositivos} texto="equipos" />
                    </span>
                    {c.fallas > 0 && (
                      <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-amber">
                        <AlertTriangle size={14} strokeWidth={2.4} /> {c.fallas === 1 ? '1 falla a tierra abierta' : `${c.fallas} fallas a tierra abiertas`}
                      </span>
                    )}
                  </Link>
                ))}
                {clientesEnLista.length === 0 && <p className="text-[13px] text-muted">Ningún cliente con ese nombre.</p>}
              </div>
            </>
          )
        )}

        {/* ---------- Nivel 2: un cliente con sus paneles, planos y circuitos ---------- */}
        {filtroCliente && !cargando && !errorCarga && (
          <>
            <nav aria-label="Ruta" className="flex items-center gap-1 text-[13px] text-muted mb-1.5 min-w-0">
              <button type="button" onClick={() => abrirCliente(null)} className="font-semibold text-teal hover:underline shrink-0">Diagramas y planos</button>
              <ChevronRight size={14} className="shrink-0" />
              <span className="truncate text-ink">{nombreCliente(filtroCliente)}</span>
            </nav>
            <h2 className="font-display font-bold text-[24px] leading-tight mb-3">{nombreCliente(filtroCliente)}</h2>

            {esAncho && (
              <div className="grid grid-cols-5 gap-2.5 mb-5">
                <Indicador titulo="Paneles" valor={panelesDelCliente.length} />
                <Indicador titulo="Circuitos" valor={circuitosDelCliente.length} />
                <Indicador titulo="Dispositivos" valor={circuitosDelCliente.reduce((suma, l) => suma + l.dispositivos, 0)} />
                <Indicador titulo="Planos" valor={planosDelCliente.length} />
                <Indicador titulo="Fallas a tierra abiertas" valor={fallasAbiertas} alerta={fallasAbiertas > 0} />
              </div>
            )}

            {/* Con varios paneles: ver solo lo de uno (planos y circuitos). */}
            {panelesDelCliente.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4" role="tablist" aria-label="Panel">
                {[{ id: null as string | null, nombre: 'Todos los paneles' }, ...panelesDelCliente].map((p) => (
                  <button key={p.id || 'todos'} type="button" role="tab" aria-selected={filtroPanel === p.id} onClick={() => setFiltroPanel(p.id)}
                    className={`shrink-0 min-h-[38px] px-3.5 rounded-full border text-[13px] font-semibold ${filtroPanel === p.id ? 'bg-teal text-inkOnAccent border-teal' : 'border-line bg-surface text-muted'}`}>
                    {p.nombre}
                  </button>
                ))}
              </div>
            )}

            {/* Los PDF del cliente a la mano: reporte de avance y diagramas. */}
            {((!faltaPatchPlanos && planosDelCliente.length > 0) || circuitosDelCliente.length > 0) && (
              <div className="mb-5">
                <SubtituloGrupo icono={<FileDown size={14} strokeWidth={2.4} />} titulo="Documentos para descargar" cuenta={0} accion={null} />
                <DocumentosCliente
                  clienteId={filtroCliente}
                  cliente={nombreCliente(filtroCliente)}
                  paneles={panelesDelCliente.map((p) => p.nombre)}
                  circuitos={filtroPanel ? circuitosDelCliente.filter((l) => l.panel_id === filtroPanel) : circuitosDelCliente}
                  hayPlanos={!faltaPatchPlanos && planosDelCliente.length > 0}
                />
              </div>
            )}

            {(panelesDelCliente.length > 0 || !faltaPatchPaneles) && (
              <div className="mb-5">
                <SubtituloGrupo icono={<CircuitBoard size={14} strokeWidth={2.4} />} titulo="Paneles" cuenta={panelesALaVista.length}
                  accion={!faltaPatchPaneles && puedeCrear ? { texto: 'Panel', onClick: () => setNuevoPanel(true) } : null} />
                {panelesALaVista.length > 0 ? (
                  <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-2 gap-2.5 items-start">
                    {panelesALaVista.map((panel) => (
                      <TarjetaPanel key={panel.id} panel={panel} circuitos={circuitosDelCliente.filter((l) => l.panel_id === panel.id)} />
                    ))}
                  </div>
                ) : puedeCrear ? (
                  <button type="button" onClick={() => setNuevoPanel(true)}
                    className="w-full min-h-[48px] rounded-2xl border border-dashed border-line-strong text-[13.5px] font-semibold text-muted flex items-center justify-center gap-2 hover:text-ink">
                    <Plus size={16} strokeWidth={2.6} /> Agregar el panel de este proyecto
                  </button>
                ) : (
                  <p className="text-[13px] text-muted">Sin paneles. Se agregan desde el proyecto del cliente.</p>
                )}
              </div>
            )}

            {!faltaPatchPlanos && (
              <div className="mb-5">
                <SubtituloGrupo icono={<IconoPlano size={14} strokeWidth={2.4} />} titulo="Planos por nivel" cuenta={planosALaVista.length}
                  accion={puedeCrear ? { texto: 'Subir', onClick: () => setNuevoPlano({ cliente: { id: filtroCliente, nombre: nombreCliente(filtroCliente) } }) } : null} />
                {planosALaVista.length > 0 ? (
                  <div className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {planosALaVista.map((plano) => (
                      <Link key={plano.id} href={`/lazos/plano/${plano.id}`}
                        className="min-w-0 rounded-2xl border border-line bg-surface p-2.5 pr-3 flex items-center gap-3 transition-colors hover:border-sky-500/60">
                        <span className="w-10 h-10 shrink-0 rounded-xl bg-sky-500/15 text-sky-500 flex items-center justify-center">
                          <IconoPlano size={19} strokeWidth={2.2} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[14.5px] font-semibold truncate">{plano.nombre}</span>
                          <span className="block text-[12px] text-muted truncate">
                            {plano.equipos_en_plano !== null ? `${plano.equipos_en_plano} ${plano.equipos_en_plano === 1 ? 'equipo' : 'equipos'}` : `Actualizado ${fechaCorta(plano.actualizado_en)}`}
                            {/* Con varios paneles, de cuál son sus dispositivos. */}
                            {panelesDelCliente.length > 1 && plano.paneles_en_plano && plano.paneles_en_plano.length > 0 ? ` · ${plano.paneles_en_plano.map(nombrePanel).join(', ')}` : ''}
                          </span>
                        </span>
                        <ChevronRight size={17} className="text-muted shrink-0" />
                      </Link>
                    ))}
                  </div>
                ) : puedeCrear ? (
                  <button type="button" onClick={() => setNuevoPlano({ cliente: { id: filtroCliente, nombre: nombreCliente(filtroCliente) } })}
                    className="w-full min-h-[48px] rounded-2xl border border-dashed border-line-strong text-[13.5px] font-semibold text-muted flex items-center justify-center gap-2 hover:text-ink">
                    <Plus size={16} strokeWidth={2.6} /> Subir un plano de este proyecto
                  </button>
                ) : (
                  <p className="text-[13px] text-muted">Sin planos. Se suben desde el proyecto del cliente.</p>
                )}
              </div>
            )}

            {!filtroPanel && sueltos.length > 0 && (
              <div className="mb-5">
                <SubtituloGrupo icono={<Cable size={14} strokeWidth={2.4} />} titulo="Circuitos sin panel" cuenta={sueltos.length} accion={null} />
                {esAncho ? <TablaCircuitos circuitos={sueltos} /> : (
                  <div className="flex flex-wrap gap-1.5">
                    {ordenarCircuitos(sueltos).map((l) => <ChipCircuito key={l.id} circuito={l} />)}
                  </div>
                )}
              </div>
            )}

            {panelesDelCliente.length === 0 && circuitosDelCliente.length === 0 && planosDelCliente.length === 0 && (
              <EstadoVacio
                icono={<Cable size={26} strokeWidth={2} />}
                titulo="Este cliente todavía no tiene diagramas"
                detalle="Agrega su panel, crea un circuito o sube un plano."
              />
            )}
          </>
        )}
        </>
        )}
      </div>

      {nuevoPanel && (
        <FormPanel
          clienteInicial={filtroCliente ? { id: filtroCliente, nombre: nombreCliente(filtroCliente) } : null}
          esSupervisor={esSupervisor}
          onCerrar={() => setNuevoPanel(false)}
          onGuardado={async (panel) => { if (panel) { await alProyecto('panel', panel.id); window.location.href = `/lazos/panel/${panel.id}`; } }}
        />
      )}

      {nuevoPlano && (
        <NuevoPlano
          clienteInicial={nuevoPlano.cliente}
          proyectoId={filtroProyecto}
          onCerrar={() => setNuevoPlano(null)}
          onCreado={(id) => { window.location.href = `/lazos/plano/${id}`; }}
        />
      )}

      {nuevoAbierto && (
        <NuevoLazo
          clienteInicial={filtroCliente ? { id: filtroCliente, nombre: nombreCliente(filtroCliente) } : null}
          lazosExistentes={lazos}
          paneles={paneles}
          panelInicial={filtroPanel}
          onCerrar={() => setNuevoAbierto(false)}
          proyectoId={filtroProyecto}
          onCreado={(id) => { window.location.href = `/lazos/${id}`; }}
        />
      )}
    </>,
  );
}

// Un número con su texto, en la tarjeta del cliente.
function Conteo({ valor, texto }: { valor: number; texto: string }) {
  return (
    <span className="rounded-xl bg-surface-2/70 py-1.5">
      <span className="block font-display font-bold text-[17px] leading-none tabular-nums">{valor}</span>
      <span className="block text-[11px] text-muted mt-1">{texto}</span>
    </span>
  );
}

// Un circuito como chip de su color (SLC, NAC o voceo); lleva a su diagrama.
function ChipCircuito({ circuito }: { circuito: LazoResumen }) {
  const color = COLOR_TIPO[circuito.tipo];
  return (
    <Link href={`/lazos/${circuito.id}`} title={`${circuito.codigo} · ${circuito.nombre}`}
      className="rounded-lg px-2.5 min-h-[32px] font-mono text-[12px] font-semibold inline-flex items-center gap-1.5 transition-opacity hover:opacity-80"
      style={{ color, backgroundColor: fondo(color, 14) }}>
      {circuito.fallaAbierta && <span className="w-1.5 h-1.5 rounded-full bg-amber" aria-label="falla abierta" />}
      {etiquetaSalida(circuito)}
      <span className="font-normal opacity-75">· {circuito.dispositivos}</span>
    </Link>
  );
}

// Resumen de un panel: sus lazos SLC uno por renglón (también los libres) y
// las NAC y el voceo como chips. Cada circuito lleva a su diagrama.
function TarjetaPanel({ panel, circuitos }: { panel: Panel; circuitos: LazoResumen[] }) {
  const deteccion = circuitos.filter((l) => l.tipo === 'deteccion');
  const otros = ordenarCircuitos(circuitos.filter((l) => l.tipo !== 'deteccion'));
  const numeros = deteccion.map((l) => l.numero || 0);
  const totalSlc = Math.max(panel.slc || 0, ...numeros, 0);
  const renglones: { numero: number; circuito: LazoResumen | null }[] = [];
  for (let n = 1; n <= totalSlc; n++) renglones.push({ numero: n, circuito: deteccion.find((l) => l.numero === n) || null });
  // Lazos sin número (raros): al final, para que no se pierdan.
  for (const l of deteccion) if (!l.numero) renglones.push({ numero: 0, circuito: l });
  const dispositivos = circuitos.reduce((suma, l) => suma + l.dispositivos, 0);
  const color = COLOR_TIPO.deteccion;
  const detalle = [panel.modelo && !panel.nombre.toLowerCase().includes(panel.modelo.toLowerCase()) ? panel.modelo : null, `${dispositivos} equipos`].filter(Boolean).join(' · ');

  return (
    <div className={`rounded-3xl border bg-surface overflow-hidden ${circuitos.some((l) => l.fallaAbierta) ? 'border-amber/60' : 'border-line'}`}>
      <Link href={`/lazos/panel/${panel.id}`} className="flex items-center gap-3 p-3.5 hover:bg-surface-2/60 transition-colors">
        <span className="w-11 h-11 shrink-0 rounded-xl bg-teal/15 text-teal flex items-center justify-center">
          <CircuitBoard size={22} strokeWidth={2.2} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15.5px] font-semibold truncate">{panel.nombre}</span>
          <span className="block text-[12.5px] text-muted truncate">{detalle}</span>
          {panel.ubicacion && <span className="flex items-center gap-1 text-[12px] text-faint truncate"><MapPin size={12} strokeWidth={2.4} />{panel.ubicacion}</span>}
        </span>
        <span className="shrink-0 text-[12.5px] font-semibold text-teal flex items-center">Abrir <ChevronRight size={16} /></span>
      </Link>

      <div className="px-3.5 pb-3.5 flex flex-col gap-1.5">
        {renglones.map(({ numero, circuito }) => circuito ? (
          <Link key={circuito.id} href={`/lazos/${circuito.id}`}
            className={`flex items-center gap-2.5 rounded-xl border px-2.5 min-h-[46px] transition-colors hover:bg-surface-2 ${circuito.fallaAbierta ? 'border-amber/60' : 'border-line'}`}>
            <span className="shrink-0 w-[58px] text-center rounded-lg py-1 font-mono text-[12px] font-bold" style={{ color, backgroundColor: fondo(color, 14) }}>
              {etiquetaSalida(circuito)}
            </span>
            <span className="flex-1 min-w-0 text-[13.5px] truncate">
              <span className="font-mono font-semibold">{circuito.codigo}</span> <span className="text-muted">{circuito.nombre}</span>
            </span>
            {circuito.fallaAbierta && <AlertTriangle size={15} strokeWidth={2.4} className="text-amber shrink-0" aria-label="Falla a tierra abierta" />}
            <span className="shrink-0 text-[12.5px] font-semibold tabular-nums">{circuito.dispositivos}</span>
            <ChevronRight size={15} className="text-muted shrink-0" />
          </Link>
        ) : (
          <div key={`libre-${numero}`} className="flex items-center gap-2.5 rounded-xl border border-dashed border-line px-2.5 min-h-[40px] text-muted">
            <span className="shrink-0 w-[58px] text-center font-mono text-[12px] font-bold">SLC {numero}</span>
            <span className="text-[13px]">Libre: sin circuito todavía</span>
          </div>
        ))}
        {renglones.length === 0 && otros.length === 0 && <p className="text-[12.5px] text-faint">Sin circuitos todavía.</p>}
        {otros.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {otros.map((l) => <ChipCircuito key={l.id} circuito={l} />)}
          </div>
        )}
      </div>
    </div>
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
export function NuevoLazo({ clienteInicial, lazosExistentes, inicial, paneles = [], panelInicial = null, proyectoId = null, onCerrar, onCreado }: {
  clienteInicial: { id: string; nombre: string } | null;
  // Obra en la que queda (desde un proyecto o desde el servicio del técnico).
  proyectoId?: string | null;
  lazosExistentes: LazoResumen[];
  // Paneles de todos los clientes: se ofrecen solo los del cliente elegido.
  paneles?: Panel[];
  panelInicial?: string | null;
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
  const [panelId, setPanelId] = useState<string | null>(inicial?.panel_id || panelInicial);
  const panelesDelCliente = paneles.filter((p) => p.cliente_id === clienteId);
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Con un panel elegido, propone su primera salida libre de ese tipo (SLC 2 si ya está la 1).
  useEffect(() => {
    if (inicial || !panelId) return;
    const ocupados = new Set(lazosExistentes.filter((l) => l.panel_id === panelId && l.tipo === tipo).map((l) => l.numero));
    let libre = 1;
    while (ocupados.has(libre)) libre++;
    setNumero(String(libre));
  }, [panelId, tipo, inicial, lazosExistentes]);

  // Propone el código. No se repite dentro del cliente: con dos paneles, el
  // SLC 1 del segundo no puede llamarse LZ1 otra vez (sus equipos se confundirían).
  useEffect(() => {
    if (codigoAMano) return;
    const prefijo = PREFIJO_CIRCUITO[tipo];
    const usados = new Set(lazosExistentes.filter((l) => l.cliente_id === clienteId).map((l) => l.codigo.toUpperCase()));
    let siguiente = Number(numero) || 1;
    while (usados.has(`${prefijo}${siguiente}`)) siguiente++;
    setCodigo(`${prefijo}${siguiente}`);
  }, [tipo, numero, clienteId, codigoAMano, lazosExistentes]);

  function validar(): Errores {
    const e: Errores = {};
    if (!clienteId) e.cliente = 'Elige el cliente de la lista. Si no existe, pide a supervisión que lo dé de alta.';
    if (!nombre.trim()) e.nombre = 'Ponle un nombre, por ejemplo «Lazo 1 · Data Center».';
    if (!/^[A-Za-z0-9-]{1,12}$/.test(codigo.trim())) e.codigo = 'Solo letras, números y guion (hasta 12).';
    else if (lazosExistentes.some((l) => l.cliente_id === clienteId && l.codigo.toUpperCase() === codigo.trim().toUpperCase())) {
      e.codigo = 'Ese código ya lo usa otro circuito de este cliente.';
    }
    // En detección el número va siempre (es el «1» de L01D008); en NAC y
    // voceo es opcional fuera de un panel.
    const numeroObligatorio = tipo === 'deteccion' || !!panelId;
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
        panel: panelId ? panelesDelCliente.find((p) => p.id === panelId)?.nombre || panel.trim() || null : panel.trim() || null,
        // Solo un panel de este cliente (la base también lo revisa).
        panel_id: panelId && (inicial?.panel_id === panelId || panelesDelCliente.some((p) => p.id === panelId)) ? panelId : null,
        proyecto_id: proyectoId,
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
          onChange={(n, id) => { setCliente(n); setClienteId(id); if (id !== clienteId) setPanelId(null); }}
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
        ) : panelesDelCliente.length > 0 ? (
          <>
            <span className="block text-[13px] text-muted mt-4 mb-1.5">Panel de este cliente</span>
            <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Panel">
              {[...panelesDelCliente.map((p) => ({ id: p.id as string | null, nombre: p.nombre })), { id: null, nombre: 'Sin panel' }].map((p) => (
                <button key={p.id || 'ninguno'} type="button" role="radio" aria-checked={panelId === p.id} onClick={() => setPanelId(p.id)}
                  className={`min-h-[42px] px-3.5 rounded-xl border text-left text-[14px] font-semibold ${panelId === p.id ? 'border-teal bg-teal/10' : 'border-line bg-surface-2 text-muted'}`}>
                  {p.nombre}
                </button>
              ))}
            </div>
          </>
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
