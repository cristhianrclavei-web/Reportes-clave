'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronRight, Plus, Users, WifiOff } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import AutocompletarCliente from '@/components/AutocompletarCliente';
import EstadoVacio from '@/components/EstadoVacio';
import { showToast } from '@/components/Toast';
import { catalogoEnCache, listarCatalogoClientes, type ClienteCatalogo } from '@/lib/clientesCatalogo';
import { DATOS_VACIOS, SISTEMAS_GUIA, experienciaPorTecnico, nombreSistema, progresoDe, type DatosGuia, type Guia } from '@/lib/guias';
import { crearGuia, listarGuias, serviciosDelCliente, type ServicioParaGuia } from '@/lib/guiasDatos';
import { PLANTILLAS_BASE } from '@/lib/guiasPlantillas';
import type { GuiaInicial } from '@/lib/guiaDesdeCotizacion';

// Lista de guías de conexión: las plantillas (las de la app y las que arme
// el ingeniero), las guías de cada cliente con su avance y, para
// supervisión, quién ha trabajado en qué sistema.

// Una plantilla para elegir al crear: de la app o guardada en la base.
type Plantilla = { id: string; nombre: string; sistema: string; descripcion: string; datos: DatosGuia; deLaApp: boolean };

// Equipos que llegan de una cotización para empezar la guía con ellos.
export type EquiposIniciales = GuiaInicial | null;

export default function GuiasLista({ esSupervisor, inicial }: { esSupervisor: boolean; inicial?: EquiposIniciales }) {
  const [guias, setGuias] = useState<Guia[]>([]);
  const [clientes, setClientes] = useState<ClienteCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinConexion, setSinConexion] = useState(false);
  const [faltaPatch, setFaltaPatch] = useState(false);
  // null = cerrado; con plantilla = «Usar esta plantilla».
  const [nueva, setNueva] = useState<{ plantilla: Plantilla | null } | null>(inicial ? { plantilla: null } : null);

  async function cargar() {
    setError(null);
    try {
      const resultado = await listarGuias();
      setGuias(resultado.guias);
      setSinConexion(resultado.sinConexion);
      setFaltaPatch(resultado.faltaPatch);
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar las guías.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    setClientes(catalogoEnCache());
    listarCatalogoClientes().then(setClientes).catch(() => {});
  }, []);

  const nombreCliente = (id: string | null) => clientes.find((c) => c.id === id)?.nombre || 'Cliente';

  const plantillas: Plantilla[] = [
    ...guias.filter((g) => g.es_plantilla).map((g) => ({ id: g.id, nombre: g.nombre, sistema: g.sistema, descripcion: g.descripcion || '', datos: g.datos, deLaApp: false })),
    ...PLANTILLAS_BASE.map((p) => ({ ...p, deLaApp: true })),
  ];
  const deClientes = guias.filter((g) => !g.es_plantilla);
  const experiencia = experienciaPorTecnico(guias);

  // Agrupadas por cliente, en orden alfabético.
  const porCliente = new Map<string, Guia[]>();
  for (const g of deClientes) {
    const clave = g.cliente_id || '';
    porCliente.set(clave, [...(porCliente.get(clave) || []), g]);
  }
  const grupos = [...porCliente.entries()].sort((a, b) => nombreCliente(a[0]).localeCompare(nombreCliente(b[0]), 'es'));

  if (faltaPatch) {
    return <p className="rounded-xl bg-amber/10 text-amber text-[14px] px-4 py-3">Las guías de conexión todavía no están activadas en esta base: falta correr supabase/patch_guias_conexion.sql.</p>;
  }

  return (
    <div>
      <div className="flex flex-col gap-3 mb-5 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-[14px] text-muted leading-snug lg:max-w-2xl">
          Cómo se conecta cada instalación, borne por borne, con sus pruebas y las notas del ingeniero. El técnico va palomeando cada cable desde su celular.
        </p>
        {esSupervisor && (
          <button type="button" onClick={() => setNueva({ plantilla: null })}
            className="min-h-[50px] lg:min-h-[46px] px-6 rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] tracking-wide shadow-glow-teal flex items-center justify-center gap-2 shrink-0">
            <Plus size={18} strokeWidth={2.6} /> Nueva guía
          </button>
        )}
      </div>

      {sinConexion && (
        <p className="flex items-center gap-2 text-[13px] text-amber bg-amber/10 rounded-xl px-3 py-2 mb-4">
          <WifiOff size={16} strokeWidth={2.4} /> Sin señal: es la última lista que se cargó en este teléfono.
        </p>
      )}
      {error && (
        <div className="rounded-xl bg-red/10 text-red text-[14px] px-4 py-3 mb-4">
          {error} <button type="button" onClick={() => { setCargando(true); cargar(); }} className="underline font-semibold">Reintentar</button>
        </div>
      )}
      {cargando && <p className="text-[14px] text-muted">Cargando…</p>}

      {!cargando && !error && (
        <>
          <Subtitulo texto="Guías de los clientes" cuenta={deClientes.length} />
          {deClientes.length === 0 && (
            <EstadoVacio icono={<BookOpen size={26} strokeWidth={2} />} titulo="Todavía no hay guías"
              detalle={esSupervisor ? 'Elige una plantilla de abajo y pégala a un cliente o a un servicio.' : 'Cuando el ingeniero arme la guía de un servicio, aparecerá aquí.'} />
          )}
          {grupos.map(([clienteId, lista]) => (
            <section key={clienteId} className="mb-4">
              <h2 className="font-display font-bold text-[16px] mb-2">{nombreCliente(clienteId)}</h2>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 lg:grid-cols-2 xl:grid-cols-3">
                {lista.map((g) => {
                  const progreso = progresoDe(g.datos, g.avance);
                  return (
                    <Link key={g.id} href={`/guias/${g.id}`} className="block rounded-2xl bg-surface border border-line p-3.5 transition-colors hover:border-teal/60">
                      <div className="flex items-center gap-2.5">
                        <span className="flex-1 min-w-0 text-[15px] font-semibold truncate">{g.nombre}</span>
                        <ChevronRight size={18} className="text-muted shrink-0" />
                      </div>
                      <p className="text-[12.5px] text-muted mt-0.5">{nombreSistema(g.sistema)} · {g.datos.equipos.length} equipos · {g.datos.conexiones.length} conexiones</p>
                      <div className="mt-2.5 flex items-center gap-2.5">
                        <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                          <div className={`h-full rounded-full ${progreso.terminado ? 'bg-green-500' : 'bg-teal'}`} style={{ width: `${progreso.porcentaje}%` }} />
                        </div>
                        <span className="font-mono text-[12px] text-muted">{progreso.porcentaje} %</span>
                      </div>
                      {progreso.pruebasFuera > 0 && <p className="text-[12.5px] font-semibold text-red mt-1.5">{progreso.pruebasFuera} {progreso.pruebasFuera === 1 ? 'prueba' : 'pruebas'} fuera de rango</p>}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}

          <div className="mt-7"><Subtitulo texto="Plantillas" cuenta={plantillas.length} /></div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 lg:grid-cols-2 xl:grid-cols-3">
            {plantillas.map((p) => (
              <div key={p.id} className="rounded-2xl bg-surface border border-line p-3.5 flex flex-col">
                <p className="text-[15px] font-semibold leading-snug">{p.nombre}</p>
                <p className="text-[12.5px] text-muted mt-0.5">{nombreSistema(p.sistema)} · {p.datos.equipos.length} equipos · {p.datos.conexiones.length} conexiones{p.deLaApp ? ' · de la app' : ''}</p>
                {p.descripcion && <p className="text-[13px] text-muted mt-1.5 line-clamp-3">{p.descripcion}</p>}
                <div className="flex gap-2 mt-3 pt-1 mt-auto">
                  {!p.deLaApp && <Link href={`/guias/${p.id}`} className="flex-1 min-h-[42px] rounded-xl border border-line text-[13.5px] font-semibold flex items-center justify-center">Ver</Link>}
                  {esSupervisor && (
                    <button type="button" onClick={() => setNueva({ plantilla: p })} className="flex-1 min-h-[42px] rounded-xl border border-teal/60 bg-teal/10 text-teal text-[13.5px] font-semibold">
                      Usar esta plantilla
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {esSupervisor && experiencia.length > 0 && (
            <div className="mt-7">
              <Subtitulo texto="Quién ha trabajado en qué" cuenta={experiencia.length} icono={<Users size={14} strokeWidth={2.4} />} />
              <div className="rounded-2xl border border-line bg-surface overflow-hidden lg:max-w-3xl">
                <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_70px_90px] gap-3 px-4 py-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-faint border-b border-line">
                  <span>Técnico</span><span>Sistema</span><span className="text-right">Guías</span><span className="text-right">Conexiones</span>
                </div>
                {experiencia.map((x) => (
                  <div key={`${x.por}|${x.sistema}`} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_70px_90px] gap-3 items-center px-4 min-h-[44px] border-b border-line last:border-b-0 text-[14px]">
                    <span className="font-semibold truncate">{x.nombre}</span>
                    <span className="text-muted truncate">{nombreSistema(x.sistema)}</span>
                    <span className="font-mono text-right">{x.guias}</span>
                    <span className="font-mono text-right">{x.conexiones}</span>
                  </div>
                ))}
              </div>
              <p className="text-[12.5px] text-muted mt-1.5">Sale solo, de lo que cada quien palomea en las guías.</p>
            </div>
          )}
        </>
      )}

      {nueva && (
        <NuevaGuia plantilla={nueva.plantilla} plantillas={plantillas} inicial={inicial || null}
          onCerrar={() => setNueva(null)} onCreada={(id, editar) => { window.location.href = `/guias/${id}${editar ? '?editar=1' : ''}`; }} />
      )}
    </div>
  );
}

function Subtitulo({ texto, cuenta, icono }: { texto: string; cuenta: number; icono?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      {icono && <span className="text-faint">{icono}</span>}
      <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint">{texto}</span>
      <span className="font-mono text-[11.5px] text-faint">{cuenta}</span>
      <span className="flex-1 h-px bg-line" aria-hidden="true" />
    </div>
  );
}

const CAMPO = 'w-full px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]';

// Crear una guía: de una plantilla o en blanco, para un cliente (y si se
// quiere, pegada a uno de sus servicios) o como plantilla nueva.
function NuevaGuia({ plantilla, plantillas, inicial, onCerrar, onCreada }: {
  plantilla: Plantilla | null;
  plantillas: Plantilla[];
  inicial: EquiposIniciales;
  onCerrar: () => void;
  onCreada: (id: string, editar: boolean) => void;
}) {
  const [plantillaId, setPlantillaId] = useState(plantilla?.id || '');
  const elegida = plantillas.find((p) => p.id === plantillaId) || null;
  const [nombre, setNombre] = useState(inicial?.nombre || plantilla?.nombre || '');
  const [sistema, setSistema] = useState(inicial?.sistema || plantilla?.sistema || 'Control de acceso');
  const [comoPlantilla, setComoPlantilla] = useState(false);
  const [clienteTexto, setClienteTexto] = useState(inicial?.clienteNombre || '');
  const [clienteId, setClienteId] = useState<string | null>(inicial?.clienteId || null);
  const [servicios, setServicios] = useState<ServicioParaGuia[]>([]);
  const [grupoId, setGrupoId] = useState('');
  const [errores, setErrores] = useState<{ nombre?: string; cliente?: string }>({});
  const [guardando, setGuardando] = useState(false);

  // Al elegir cliente se traen sus servicios para poder pegar la guía a uno.
  useEffect(() => {
    setGrupoId('');
    setServicios([]);
    if (!clienteId) return;
    let vigente = true;
    serviciosDelCliente(clienteId)
      .then((lista) => { if (vigente) setServicios(lista); })
      .catch((e) => showToast(e?.message || 'No se pudieron cargar los servicios del cliente', 'error'));
    return () => { vigente = false; };
  }, [clienteId]);

  function alElegirPlantilla(id: string) {
    setPlantillaId(id);
    const p = plantillas.find((x) => x.id === id);
    if (!p) return;
    if (!nombre.trim()) setNombre(p.nombre);
    setSistema(p.sistema);
  }

  async function crear() {
    const faltas: { nombre?: string; cliente?: string } = {};
    if (!nombre.trim()) faltas.nombre = 'Ponle nombre a la guía.';
    if (!comoPlantilla && !clienteId) faltas.cliente = 'Elige el cliente de la lista.';
    setErrores(faltas);
    if (Object.keys(faltas).length > 0) return;
    setGuardando(true);
    try {
      const guia = await crearGuia({
        nombre, sistema, descripcion: elegida?.descripcion || null,
        es_plantilla: comoPlantilla, cliente_id: clienteId, servicio_grupo_id: grupoId || null,
        datos: inicial?.datos || elegida?.datos || DATOS_VACIOS,
      });
      // En blanco o desde una cotización hay que dibujarla: se abre ya en edición.
      onCreada(guia.id, !elegida);
    } catch (e: any) {
      showToast(e?.message || 'No se pudo crear la guía', 'error');
      setGuardando(false);
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onCerrar()}>
      <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[90vh] overflow-y-auto">
        <p className="font-display font-bold text-[19px]">Nueva guía de conexión</p>
        {inicial
          ? <p className="text-[13px] text-muted mt-1 mb-4">Con los {inicial.datos.equipos.length} equipos de la cotización. Después les pones sus bornes y conexiones.</p>
          : <p className="text-[13px] text-muted mt-1 mb-4">Parte de una plantilla y ajústala al cliente, o empieza en blanco.</p>}

        {!inicial && (
          <label className="block mb-3"><span className="block text-[12.5px] text-muted mb-1">Plantilla</span>
            <select className={CAMPO} value={plantillaId} onChange={(ev) => alElegirPlantilla(ev.target.value)}>
              <option value="">En blanco</option>
              {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select></label>
        )}

        <label className="block mb-3"><span className="block text-[12.5px] text-muted mb-1">Nombre</span>
          <input className={CAMPO} value={nombre} maxLength={120} placeholder="Acceso principal, puerta de almacén…" onChange={(ev) => setNombre(ev.target.value)} />
          {errores.nombre && <span className="block text-red font-semibold text-[13px] mt-1">{errores.nombre}</span>}</label>

        <label className="block mb-3"><span className="block text-[12.5px] text-muted mb-1">Sistema</span>
          <select className={CAMPO} value={sistema} onChange={(ev) => setSistema(ev.target.value)}>
            {[...new Set([...SISTEMAS_GUIA, sistema])].map((s) => <option key={s} value={s}>{nombreSistema(s)}</option>)}
          </select></label>

        <label className="flex items-center gap-2.5 mb-3 text-[14px]">
          <input type="checkbox" checked={comoPlantilla} onChange={(ev) => setComoPlantilla(ev.target.checked)} className="w-5 h-5 accent-teal" />
          Guardarla como plantilla (para reutilizarla, sin cliente)
        </label>

        {!comoPlantilla && (
          <>
            <div className="mb-3"><span className="block text-[12.5px] text-muted mb-1">Cliente</span>
              <AutocompletarCliente value={clienteTexto} soloSugerir className={CAMPO} placeholder="Escribe para buscar"
                onChange={(texto, id) => { setClienteTexto(texto); setClienteId(id); }} />
              {errores.cliente && <span className="block text-red font-semibold text-[13px] mt-1">{errores.cliente}</span>}</div>
            {clienteId && (
              <label className="block mb-3"><span className="block text-[12.5px] text-muted mb-1">Servicio (opcional)</span>
                <select className={CAMPO} value={grupoId} onChange={(ev) => setGrupoId(ev.target.value)}>
                  <option value="">Sin servicio: solo del cliente</option>
                  {servicios.map((s) => <option key={s.grupo_id} value={s.grupo_id}>{s.fecha} · {s.proyecto}</option>)}
                </select>
                <span className="block text-[12px] text-muted mt-1">Los técnicos la ven en cualquier servicio de este cliente.</span></label>
            )}
          </>
        )}

        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCerrar} disabled={guardando} className="flex-1 min-h-[50px] rounded-2xl border border-line-strong font-semibold text-[14.5px] disabled:opacity-60">Cancelar</button>
          <button type="button" onClick={crear} disabled={guardando} className="flex-1 min-h-[50px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[14.5px] disabled:opacity-60">
            {guardando ? 'Creando…' : 'Crear guía'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
