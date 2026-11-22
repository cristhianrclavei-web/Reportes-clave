'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2, CalendarDays, ChevronRight, Download, FileText, Map as IconoPlano, Network, Pencil, Plus, Receipt, Trash2,
} from 'lucide-react';
import SupervisorShell from '@/components/SupervisorShell';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import NuevoPlano from '@/components/lazos/NuevoPlano';
import FormProyecto from '@/components/proyectos/FormProyecto';
import EtapasProyecto, { ChipEtapa } from '@/components/proyectos/EtapasProyecto';
import ContenidoLista, { BOTON_CHICO, TituloSeccion } from '@/components/proyectos/ContenidoLista';
import SolarProyecto from '@/components/proyectos/SolarProyecto';
import PagosProyecto from '@/components/proyectos/PagosProyecto';
import { confirmar } from '@/lib/dialogos';
import { usePerfiles } from '@/lib/perfiles';
import {
  agregarDocumento, eliminarDocumento, eliminarProyecto, obtenerProyecto, obtenerUrlDocumento,
  type DocumentoProyecto,
} from '@/lib/proyectos';
import { contenidoDelProyecto, type Contenido, type ElementoContenido } from '@/lib/proyectoContenido';
import { SISTEMAS, nombreSistema, type Etapa, type SistemaClave } from '@/lib/proyectosEtapas';

// Ficha de un proyecto (una obra del cliente): su etapa, una pestaña por
// cada sistema que lleva con sus herramientas (planos, lazos, guías,
// unifilar, trámite CFE…) y lo común: cotizaciones, servicios, pagos y
// documentos.

type Pestana = 'resumen' | SistemaClave | 'cotizaciones' | 'servicios' | 'documentos';

const fechaCorta = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const dinero = (n: number, m: 'MXN' | 'USD') => new Intl.NumberFormat('es-MX', { style: 'currency', currency: m }).format(n || 0);

export default function ProyectoDetalle({ proyectoId, clienteId, userName }: { proyectoId: string; clienteId: string; userName?: string }) {
  const router = useRouter();
  const perfiles = usePerfiles();
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof obtenerProyecto>> | null>(null);
  const [contenido, setContenido] = useState<Contenido | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const [editando, setEditando] = useState(false);
  const [nuevoPlano, setNuevoPlano] = useState<SistemaClave | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [d, c] = await Promise.all([obtenerProyecto(proyectoId), contenidoDelProyecto(proyectoId)]);
      setDatos(d);
      setContenido(c);
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el proyecto.');
    }
  }, [proyectoId]);

  useEffect(() => { cargar(); }, [cargar]);

  // La pestaña va en la dirección (?ver=solar) para volver a ella con «Atrás».
  useEffect(() => {
    const ver = new URLSearchParams(window.location.search).get('ver') as Pestana | null;
    if (ver) setPestana(ver);
  }, []);
  function elegir(p: Pestana) {
    setPestana(p);
    const url = new URL(window.location.href);
    url.searchParams.set('ver', p);
    window.history.replaceState(null, '', url);
  }

  if (error) {
    return (
      <SupervisorShell active="proyectos" title="Proyecto" userName={userName} volver>
        <div className="rounded-xl bg-red/10 text-red text-[14px] px-4 py-3 my-6">
          {error} <button type="button" onClick={cargar} className="underline font-semibold">Reintentar</button>
        </div>
      </SupervisorShell>
    );
  }
  if (!datos || !contenido) {
    return <SupervisorShell active="proyectos" title="Proyecto" userName={userName} volver><p className="text-muted text-center py-14">Cargando…</p></SupervisorShell>;
  }

  const { proyecto, cliente } = datos;
  const responsable = proyecto.responsable_id ? perfiles[proyecto.responsable_id]?.full_name : null;
  const pestanas: { clave: Pestana; nombre: string }[] = [
    { clave: 'resumen', nombre: 'Resumen' },
    ...proyecto.sistemas.map((s) => ({ clave: s as Pestana, nombre: SISTEMAS.find((x) => x.clave === s)?.corto || s })),
    { clave: 'cotizaciones', nombre: `Cotizaciones · ${contenido.cotizacion.length + datos.cotizaciones.filter((c) => !contenido.cotizacion.some((x) => x.id === c.cotizacion_id)).length}` },
    { clave: 'servicios', nombre: `Servicios · ${contenido.servicio.length}` },
    { clave: 'documentos', nombre: `Documentos · ${datos.documentos.length}` },
  ];
  const actual = pestanas.some((p) => p.clave === pestana) ? pestana : 'resumen';

  return (
    <SupervisorShell active="proyectos" title={proyecto.nombre} userName={userName} volver
      wrapperClassName="max-w-2xl lg:max-w-[1200px] mx-auto pb-10 lg:px-8 2xl:px-10">
      <nav aria-label="Ruta" className="flex items-center gap-1 text-[13px] text-muted mb-3 flex-wrap">
        <Link href="/dashboard/proyectos" className="hover:text-teal">Proyectos</Link>
        <ChevronRight size={13} />
        <Link href={`/dashboard/proyectos/${clienteId}`} className="hover:text-teal">{cliente.nombre}</Link>
        <ChevronRight size={13} />
        <span className="text-ink font-semibold truncate">{proyecto.nombre}</span>
      </nav>

      <header className="glass rounded-2xl p-4 mb-4" data-tour="cabecera-proyecto">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-[22px] leading-tight">{proyecto.nombre}</h1>
            <Link href={`/dashboard/proyectos/${clienteId}`} className="inline-flex items-center gap-1.5 text-[13.5px] text-muted hover:text-teal mt-0.5">
              <Building2 size={14} /> {cliente.nombre}
            </Link>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <ChipEtapa etapa={proyecto.etapa} sistemas={proyecto.sistemas} tipo={proyecto.tipo} />
              {proyecto.sistemas.map((s) => (
                <span key={s} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-2 border border-line text-muted">{nombreSistema(s)}</span>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => setEditando(true)} className={BOTON_CHICO}><Pencil size={14} /> Editar</button>
        </div>
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3 text-[13px]">
          <div><dt className="text-muted text-[11.5px]">Inicio</dt><dd className="font-semibold">{fechaCorta(proyecto.fecha_inicio)}</dd></div>
          <div><dt className="text-muted text-[11.5px]">Entrega</dt><dd className="font-semibold">{fechaCorta(proyecto.fecha_entrega)}</dd></div>
          <div><dt className="text-muted text-[11.5px]">Monto</dt><dd className="font-semibold">{proyecto.monto != null ? dinero(proyecto.monto, proyecto.moneda) : '—'}</dd></div>
          <div><dt className="text-muted text-[11.5px]">Responsable</dt><dd className="font-semibold truncate">{responsable || 'Sin asignar'}</dd></div>
        </dl>
        {proyecto.descripcion && <p className="text-[13.5px] text-ink/80 mt-3 whitespace-pre-line">{proyecto.descripcion}</p>}
      </header>

      <div className="overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 mb-4" data-tour="pestanas-proyecto">
        <div className="inline-flex gap-1 rounded-xl bg-surface border border-line p-1" role="tablist" aria-label="Secciones del proyecto">
          {pestanas.map((p) => (
            <button key={p.clave} type="button" role="tab" aria-selected={actual === p.clave} onClick={() => elegir(p.clave)}
              className={`min-h-[40px] px-3.5 rounded-lg text-[13.5px] font-semibold whitespace-nowrap ${actual === p.clave ? 'bg-teal text-inkOnAccent' : 'text-muted hover:text-ink'}`}>
              {p.nombre}
            </button>
          ))}
        </div>
      </div>

      {actual === 'resumen' && (
        <>
          {proyecto.tipo === 'instalacion' ? (
            <p className="glass rounded-2xl p-4 mb-4 text-[13.5px] text-muted">
              <b className="text-ink">Instalación en operación.</b> Aquí viven sus planos, lazos y guías, y se ligan los mantenimientos. Una ampliación o un sistema nuevo va en su propio proyecto, con su cotización.
            </p>
          ) : (
            <EtapasProyecto proyecto={proyecto} onCambio={(etapa: Etapa) => setDatos({ ...datos, proyecto: { ...proyecto, etapa } })} />
          )}
          <ResumenContenido contenido={contenido} sistemas={proyecto.sistemas} onIr={elegir} />
          <PagosProyecto proyecto={proyecto} />
          <button type="button" onClick={async () => {
            if (!(await confirmar(`¿Eliminar el proyecto «${proyecto.nombre}»?`, { tono: 'peligro', detalle: 'Se borran sus documentos, pagos, recibos y trámite. Las cotizaciones, servicios, planos y diagramas NO se borran: quedan en el cliente sin proyecto.', textoAceptar: 'Eliminar' }))) return;
            try {
              await eliminarProyecto(proyecto.id);
              showToast('Proyecto eliminado', 'success');
              router.push(`/dashboard/proyectos/${clienteId}`);
            } catch (e: any) {
              showToast(e?.message || 'No se pudo eliminar.', 'error');
            }
          }} className="text-red text-[13.5px] font-medium mb-8 min-h-[44px] flex items-center gap-1.5">
            <Trash2 size={15} /> Eliminar este proyecto
          </button>
        </>
      )}

      {proyecto.sistemas.includes(actual as SistemaClave) && (
        <PestanaSistema sistema={actual as SistemaClave} proyecto={proyecto} clienteNombre={cliente.nombre} contenido={contenido}
          usuarioNombre={userName || 'Supervisión'} onNuevoPlano={() => setNuevoPlano(actual as SistemaClave)} onCambio={cargar}
          onInterconectado={() => setDatos({ ...datos, proyecto: { ...proyecto, etapa: 'terminado' } })} />
      )}

      {actual === 'cotizaciones' && (
        <section className="glass rounded-2xl p-4 mb-4">
          <TituloSeccion titulo="Cotizaciones" accion={
            <Link href={`/dashboard/cotizaciones?proyecto=${proyecto.id}`} className="min-h-[36px] px-3 rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold flex items-center gap-1"><Plus size={14} /> Nueva</Link>
          } />
          <ContenidoLista elementos={[...contenido.cotizacion, ...vinculadasViejas(datos, contenido)]} vacio="Sin cotizaciones en este proyecto."
            proyectoId={proyecto.id} clienteId={clienteId} tipos={['cotizacion']} onCambio={cargar} />
        </section>
      )}

      {actual === 'servicios' && (
        <>
          <section className="glass rounded-2xl p-4 mb-4">
            <TituloSeccion titulo="Servicios" accion={
              <Link href={`/dashboard/servicios?agendar=1&cliente=${clienteId}&obra=${proyecto.id}&proyecto=${encodeURIComponent(`${cliente.nombre} · ${proyecto.nombre}`)}`} className="min-h-[36px] px-3 rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold flex items-center gap-1"><CalendarDays size={14} /> Agendar</Link>
            } />
            <ContenidoLista elementos={contenido.servicio} vacio="Sin servicios en este proyecto. Agenda uno o trae los que ya tiene el cliente."
              proyectoId={proyecto.id} clienteId={clienteId} tipos={['servicio']} onCambio={cargar} />
          </section>
          <section className="glass rounded-2xl p-4 mb-4">
            <TituloSeccion titulo="Levantamientos" />
            <ContenidoLista elementos={contenido.levantamiento} vacio="Sin levantamientos en este proyecto."
              proyectoId={proyecto.id} clienteId={clienteId} tipos={['levantamiento']} onCambio={cargar} abrirEnNueva />
          </section>
        </>
      )}

      {actual === 'documentos' && <Documentos proyectoId={proyecto.id} documentos={datos.documentos} onCambio={cargar} />}

      {editando && (
        <FormProyecto clienteId={clienteId} clienteNombre={cliente.nombre} proyecto={proyecto} onCerrar={() => setEditando(false)}
          onGuardado={() => { setEditando(false); cargar(); }} />
      )}
      {nuevoPlano && (
        <NuevoPlano clienteInicial={{ id: clienteId, nombre: cliente.nombre }} sistemaInicial={nuevoPlano} proyectoId={proyecto.id}
          onCerrar={() => setNuevoPlano(null)} onCreado={(id) => { window.location.href = `/lazos/plano/${id}`; }} />
      )}
    </SupervisorShell>
  );
}

// Cotizaciones ligadas con el vínculo de antes (proyecto_cotizaciones) que
// todavía no tienen proyecto_id.
function vinculadasViejas(datos: Awaited<ReturnType<typeof obtenerProyecto>>, contenido: Contenido): ElementoContenido[] {
  return datos.cotizaciones
    .filter((c) => !contenido.cotizacion.some((x) => x.id === c.cotizacion_id))
    .map((c) => ({
      tipo: 'cotizacion' as const, id: c.cotizacion_id, titulo: `${c.folio || 'Borrador'} · ${c.empresa}`,
      detalle: `${dinero(c.total, c.moneda)} · ${c.estado}`, fecha: '', sistema: null, enlace: `/dashboard/cotizaciones/${c.cotizacion_id}`,
    }));
}

function ResumenContenido({ contenido, sistemas, onIr }: { contenido: Contenido; sistemas: SistemaClave[]; onIr: (p: Pestana) => void }) {
  const planos = contenido.plano.length;
  const tecnicos = contenido.panel.length + contenido.lazo.length + contenido.guia.length + contenido.unifilar.length;
  const tarjetas: { titulo: string; valor: number; pestana: Pestana; icono: React.ReactNode }[] = [
    { titulo: 'Cotizaciones', valor: contenido.cotizacion.length, pestana: 'cotizaciones', icono: <Receipt size={18} /> },
    { titulo: 'Servicios', valor: contenido.servicio.length, pestana: 'servicios', icono: <CalendarDays size={18} /> },
    { titulo: 'Planos', valor: planos, pestana: sistemas[0], icono: <IconoPlano size={18} /> },
    { titulo: 'Diagramas y guías', valor: tecnicos, pestana: sistemas[0], icono: <Network size={18} /> },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
      {tarjetas.map((t) => (
        <button key={t.titulo} type="button" onClick={() => onIr(t.pestana)} className="glass rounded-2xl p-3.5 text-left hover:border-teal/60">
          <span className="text-teal">{t.icono}</span>
          <span className="block font-mono text-[22px] font-bold mt-1">{t.valor}</span>
          <span className="block text-[12.5px] text-muted">{t.titulo}</span>
        </button>
      ))}
    </div>
  );
}

function PestanaSistema({ sistema, proyecto, clienteNombre, contenido, usuarioNombre, onNuevoPlano, onCambio, onInterconectado }: {
  sistema: SistemaClave;
  proyecto: Awaited<ReturnType<typeof obtenerProyecto>>['proyecto'];
  clienteNombre: string;
  contenido: Contenido;
  usuarioNombre: string;
  onNuevoPlano: () => void;
  onCambio: () => void;
  onInterconectado: () => void;
}) {
  const info = SISTEMAS.find((s) => s.clave === sistema)!;
  const planos = contenido.plano.filter((p) => (p.sistema || 'deteccion') === sistema);
  const guias = contenido.guia.filter((g) => g.sistema === sistema);
  const diagramas = `/dashboard/diagramas?cliente=${proyecto.cliente_id}&proyecto=${proyecto.id}`;
  const ir = useRef(onInterconectado);
  ir.current = onInterconectado;

  return (
    <div data-tour="sistema-proyecto">
      <p className="text-[13.5px] text-muted mb-3">{info.descripcion}.</p>

      {sistema === 'solar' && (
        <SolarProyecto proyecto={proyecto} clienteNombre={clienteNombre} unifilares={contenido.unifilar} usuarioNombre={usuarioNombre}
          onCambio={onCambio}
          onEtapa={async () => {
            const { cambiarEtapaProyecto } = await import('@/lib/proyectos');
            try {
              await cambiarEtapaProyecto(proyecto, 'terminado');
              ir.current();
              showToast('Proyecto interconectado', 'success');
            } catch (e: any) {
              showToast(e?.message || 'No se pudo cambiar la etapa.', 'error');
            }
          }} />
      )}

      {sistema === 'deteccion' && (
        <section className="glass rounded-2xl p-4 mb-4">
          <TituloSeccion titulo="Paneles y circuitos" accion={<Link href={diagramas} className={BOTON_CHICO}><Network size={14} /> Abrir diagramas</Link>} />
          <ContenidoLista elementos={[...contenido.panel, ...contenido.lazo]} vacio="Sin paneles ni circuitos en este proyecto. Ábrelos en «Abrir diagramas»: lo que crees ahí queda en el proyecto."
            proyectoId={proyecto.id} clienteId={proyecto.cliente_id} tipos={['panel', 'lazo']} onCambio={onCambio} />
        </section>
      )}

      <section className="glass rounded-2xl p-4 mb-4">
        <TituloSeccion titulo="Planos" cuenta={planos.length}
          accion={<button type="button" onClick={onNuevoPlano} className="min-h-[36px] px-3 rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold flex items-center gap-1"><Plus size={14} /> Plano</button>} />
        <ContenidoLista elementos={planos}
          vacio={sistema === 'cctv' ? 'Sube el plano y siembra las cámaras: cada una con su campo de visión, red, disco duro y lista de materiales para cotizar.' : sistema === 'solar' ? 'Sube el plano del techo y acomoda los módulos, el inversor y los tableros.' : 'Sube el plano (DXF o PDF) y siembra los equipos.'}
          proyectoId={proyecto.id} clienteId={proyecto.cliente_id} tipos={['plano']} onCambio={onCambio} />
      </section>

      <section className="glass rounded-2xl p-4 mb-4">
        <TituloSeccion titulo="Guías de conexión" cuenta={guias.length}
          accion={<Link href={`${diagramas}&ver=guias`} className={BOTON_CHICO}><Plus size={14} /> Guía</Link>} />
        <ContenidoLista elementos={guias} vacio="Las guías explican al técnico cómo se conecta cada equipo, borne por borne."
          proyectoId={proyecto.id} clienteId={proyecto.cliente_id} tipos={['guia']} onCambio={onCambio} />
      </section>
    </div>
  );
}

const TIPOS_DOCUMENTO = ['Planos', 'Memoria técnica', 'Formato de mantenimiento', 'Manual', 'Garantía', 'Fotografías', 'Otro'];

function Documentos({ proyectoId, documentos, onCambio }: { proyectoId: string; documentos: DocumentoProyecto[]; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errores, setErrores] = useState<{ nombre?: string; archivo?: string }>({});
  const [subiendo, setSubiendo] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const ordenados = useMemo(() => [...documentos], [documentos]);

  async function subir() {
    const faltas: { nombre?: string; archivo?: string } = {};
    if (!nombre.trim()) faltas.nombre = 'Escribe de qué es el documento.';
    if (!archivo) faltas.archivo = 'Elige el archivo.';
    else if (archivo.size > 25 * 1024 * 1024) faltas.archivo = 'El archivo pesa más de 25 MB.';
    setErrores(faltas);
    if (Object.keys(faltas).length > 0 || !archivo) return;
    setSubiendo(true);
    try {
      await agregarDocumento(proyectoId, { nombre, descripcion, archivo });
      setAbierto(false);
      setNombre('');
      setDescripcion('');
      setArchivo(null);
      showToast('Documento agregado', 'success');
      onCambio();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo subir el documento.', 'error');
    } finally {
      setSubiendo(false);
    }
  }

  async function abrir(d: DocumentoProyecto) {
    const url = await obtenerUrlDocumento(d.archivo_path);
    if (url) window.open(url, '_blank', 'noopener');
    else showToast('No se pudo abrir el documento. Intenta de nuevo.', 'error');
  }

  async function quitar(d: DocumentoProyecto) {
    if (!(await confirmar(`¿Eliminar «${d.nombre}»?`, { tono: 'peligro', textoAceptar: 'Eliminar' }))) return;
    try {
      await eliminarDocumento(d.id, d.archivo_path);
      onCambio();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo eliminar.', 'error');
    }
  }

  return (
    <section className="glass rounded-2xl p-4 mb-4">
      <TituloSeccion titulo="Documentos" accion={<button type="button" onClick={() => setAbierto(true)} className="min-h-[36px] px-3 rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold flex items-center gap-1"><Plus size={14} /> Documento</button>} />
      {ordenados.length === 0 && <p className="text-[13.5px] text-muted">Planos firmados, memorias, garantías, manuales…</p>}
      <div className="grid gap-1.5 lg:grid-cols-2">
        {ordenados.map((d) => (
          <div key={d.id} className="rounded-xl bg-surface-2 border border-line p-2.5 flex items-center gap-2">
            <FileText size={16} className="text-teal shrink-0" />
            <button type="button" onClick={() => abrir(d)} className="flex-1 min-w-0 text-left">
              <span className="block text-[14px] font-semibold truncate">{d.nombre}</span>
              <span className="block text-[12px] text-muted truncate">{d.descripcion || d.archivo_nombre_original || ''} · {fechaCorta(d.created_at)}</span>
            </button>
            <button type="button" onClick={() => abrir(d)} aria-label="Abrir" className="w-9 h-9 flex items-center justify-center text-teal"><Download size={15} /></button>
            <button type="button" onClick={() => quitar(d)} aria-label="Eliminar" className="w-9 h-9 flex items-center justify-center text-faint hover:text-red"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      {abierto && (
        <ModalOverlay onClose={() => !subiendo && setAbierto(false)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5">
            <p className="font-display font-bold text-[19px] mb-3">Agregar documento</p>
            <label className="block mb-3"><span className="block text-[12.5px] text-muted mb-1">De qué es</span>
              <input list="tipos-documento" className="w-full px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]" value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} />
              <datalist id="tipos-documento">{TIPOS_DOCUMENTO.map((t) => <option key={t} value={t} />)}</datalist>
              {errores.nombre && <span className="block text-red font-semibold text-[13px] mt-1">{errores.nombre}</span>}</label>
            <label className="block mb-3"><span className="block text-[12.5px] text-muted mb-1">Descripción (opcional)</span>
              <input className="w-full px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]" value={descripcion} maxLength={300} onChange={(e) => setDescripcion(e.target.value)} /></label>
            <input ref={entrada} type="file" className="hidden" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
            <button type="button" onClick={() => entrada.current?.click()} className="w-full min-h-[52px] rounded-xl border-2 border-dashed border-line text-[14px] font-semibold">{archivo ? archivo.name : 'Elegir archivo'}</button>
            {errores.archivo && <span className="block text-red font-semibold text-[13px] mt-1">{errores.archivo}</span>}
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={() => setAbierto(false)} disabled={subiendo} className="flex-1 min-h-[48px] rounded-2xl border border-line-strong font-semibold text-[14.5px]">Cancelar</button>
              <button type="button" onClick={subir} disabled={subiendo} className="flex-1 min-h-[48px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[14.5px] disabled:opacity-60">{subiendo ? 'Subiendo…' : 'Agregar'}</button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </section>
  );
}


