'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Cable, ChevronLeft, ChevronRight, CircuitBoard, Map as IconoPlano, MapPin, Plus, WifiOff, X } from 'lucide-react';
import FormPanel from '@/components/lazos/FormPanel';
import NuevoPlano from '@/components/lazos/NuevoPlano';
import { SalidasCompactas } from '@/components/lazos/FrentePanel';
import MenuCuenta from '@/components/MenuCuenta';
import TecnicoTabs from '@/components/TecnicoTabs';
import Logo from '@/components/Logo';
import ModalOverlay from '@/components/ModalOverlay';
import AutocompletarCliente from '@/components/AutocompletarCliente';
import EstadoVacio from '@/components/EstadoVacio';
import EncabezadoSeccion, { BOTON_PRINCIPAL, RotuloGrupo } from '@/components/tecnico/EncabezadoSeccion';
import { showToast } from '@/components/Toast';
import { catalogoEnCache, listarCatalogoClientes, ClienteCatalogo } from '@/lib/clientesCatalogo';
import { NOMBRE_CIRCUITO, PREFIJO_CIRCUITO, Panel, TipoCircuito, etiquetaSalida } from '@/lib/lazos';
import { crearLazo, listarLazos, listarPaneles, LazoResumen } from '@/lib/lazosDatos';
import { listarPlanos, type PlanoResumen } from '@/lib/planosDatos';

const CAMPO = 'w-full px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]';

type Errores = Partial<Record<'cliente' | 'nombre' | 'codigo' | 'numero', string>>;

export default function LazosList({ userName, esSupervisor, clienteInicial }: {
  userName: string;
  esSupervisor: boolean;
  clienteInicial: string | null;
}) {
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
  const [nuevoPlano, setNuevoPlano] = useState(false);

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

  return (
    <div className={`max-w-2xl mx-auto pb-16 ${esSupervisor ? "lg:max-w-6xl" : "lg:max-w-none lg:px-6"}`}>
      {/* Técnicos: una sección más, con sus pestañas. Supervisión llega desde
          la ficha del cliente y regresa a ella. */}
      {esSupervisor ? (
        <div className="sticky top-0 z-20 glass-strong px-4 py-3 flex items-center justify-between gap-3" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-2 min-w-0">
            <Link href={filtroCliente ? `/dashboard/proyectos/${filtroCliente}` : '/dashboard/proyectos'} aria-label="Volver al cliente" className="shrink-0 w-11 h-11 -ml-1.5 rounded-full flex items-center justify-center active:scale-90 transition-transform">
              <ChevronLeft size={24} strokeWidth={2.4} />
            </Link>
            <span className="font-display font-semibold text-[17px] tracking-wide truncate">Lazos y circuitos</span>
          </div>
          <MenuCuenta nombre={userName} respaldo="Supervisión" />
        </div>
      ) : (
        <div className="sticky top-0 z-20 bg-bg pb-2">
          <div className="barra-fija px-5 pb-3 flex items-center justify-between gap-3" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
            <Logo variante="completo" size={34} className="min-w-0" />
            <MenuCuenta nombre={userName} respaldo="Personal técnico" />
          </div>
          <TecnicoTabs active="lazos" />
        </div>
      )}

      <div className="px-5 pt-4">
        <EncabezadoSeccion
          titulo="Lazos y circuitos"
          detalle="El cableado de cada lazo de detección, voceo y estrobos, en el orden en que corre el cable."
          accion={
            <div className="flex flex-col sm:flex-row gap-2">
              {!faltaPatchPaneles && (
                <button type="button" onClick={() => setNuevoPanel(true)} className={BOTON_PRINCIPAL}>
                  <CircuitBoard size={19} strokeWidth={2.4} /> Nuevo panel
                </button>
              )}
              <button type="button" onClick={() => setNuevoAbierto(true)}
                className="min-h-[48px] px-5 rounded-2xl border border-line bg-surface-2 font-semibold text-[14.5px] flex items-center justify-center gap-2">
                <Plus size={18} strokeWidth={2.6} /> Circuito sin panel
              </button>
              {!faltaPatchPlanos && (
                <button type="button" onClick={() => setNuevoPlano(true)}
                  className="min-h-[48px] px-5 rounded-2xl border border-line bg-surface-2 font-semibold text-[14.5px] flex items-center justify-center gap-2">
                  <IconoPlano size={18} strokeWidth={2.4} /> Subir plano
                </button>
              )}
            </div>
          }
        />

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
            titulo="Todavía no hay lazos"
            detalle="Crea el primero y captura sus dispositivos mientras cableas."
          />
        )}

        {grupos.map(([clienteId, lista]) => {
          const panelesDelCliente = paneles.filter((p) => p.cliente_id === clienteId);
          const sueltos = lista.filter((l) => !l.panel_id || !panelesDelCliente.some((p) => p.id === l.panel_id));
          const planosDelCliente = planos.filter((p) => p.cliente_id === clienteId);
          return (
          <section key={clienteId} className="mb-6">
            <RotuloGrupo cuenta={panelesDelCliente.length + sueltos.length}>{nombreCliente(clienteId)}</RotuloGrupo>
            {planosDelCliente.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2.5 -mx-1 px-1">
                {planosDelCliente.map((plano) => (
                  <Link key={plano.id} href={`/lazos/plano/${plano.id}`}
                    className="shrink-0 min-h-[44px] pl-2.5 pr-3.5 rounded-full border border-line bg-surface hover:border-teal/60 flex items-center gap-2 text-[14px] font-semibold">
                    <span className="w-7 h-7 rounded-full bg-teal/15 text-teal flex items-center justify-center"><IconoPlano size={15} strokeWidth={2.4} /></span>
                    {plano.nombre}
                  </Link>
                ))}
              </div>
            )}
            {/* En computadora las tarjetas van en rejilla. */}
            <div className="grid gap-2.5 lg:grid-cols-2 xl:grid-cols-3 items-start">
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
              {sueltos.map((lazo) => (
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
          </section>
          );
        })}
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
          clienteInicial={filtroCliente ? { id: filtroCliente, nombre: nombreCliente(filtroCliente) } : null}
          onCerrar={() => setNuevoPlano(false)}
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
