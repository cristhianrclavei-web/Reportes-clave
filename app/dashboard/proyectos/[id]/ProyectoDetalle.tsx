'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SupervisorShell from '@/components/SupervisorShell';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import {
  EstadoProyecto, DocumentoProyecto, CotizacionVinculada, TIPOS_DOCUMENTO_SUGERIDOS,
  obtenerProyecto, actualizarEstadoProyecto, eliminarProyecto,
  agregarDocumento, eliminarDocumento, obtenerUrlDocumento,
  buscarCotizacionesParaVincular, vincularCotizacion, desvincularCotizacion,
} from '@/lib/proyectos';
import {
  ChevronLeft, FileText, Plus, Trash2, X, Search, Paperclip, Download, Receipt,
} from 'lucide-react';

const ESTADO_CLS: Record<EstadoProyecto, string> = {
  propuesta: 'bg-amber/15 text-amber border-amber/30',
  en_curso: 'bg-teal/15 text-teal border-teal/30',
  concluido: 'bg-surface-2 text-muted border-line',
};
const ESTADO_LABEL: Record<EstadoProyecto, string> = {
  propuesta: 'Propuesta', en_curso: 'En curso', concluido: 'Concluido',
};

const cardCls = 'glass rounded-2xl p-4';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5';
const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[15px] transition-colors placeholder:text-faint';

function money(n: number, moneda: 'MXN' | 'USD'): string {
  return (moneda === 'USD' ? 'USD $' : '$') + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatFecha(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}
function nombreSubio(profiles: DocumentoProyecto['profiles']): string {
  if (!profiles) return '—';
  return Array.isArray(profiles) ? profiles[0]?.full_name || '—' : profiles.full_name || '—';
}

export default function ProyectoDetalle({ proyectoId, userName }: { proyectoId: string; userName?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof obtenerProyecto>> | null>(null);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);

  const [showDocumento, setShowDocumento] = useState(false);
  const [nombreDoc, setNombreDoc] = useState('');
  const [descripcionDoc, setDescripcionDoc] = useState('');
  const [archivoDoc, setArchivoDoc] = useState<File | null>(null);
  const [subiendoDoc, setSubiendoDoc] = useState(false);

  const [showVincular, setShowVincular] = useState(false);
  const [busquedaCot, setBusquedaCot] = useState('');
  const [resultadosCot, setResultadosCot] = useState<CotizacionVinculada[]>([]);
  const [buscandoCot, setBuscandoCot] = useState(false);
  const [vinculando, setVinculando] = useState<string | null>(null);

  const [eliminandoProyecto, setEliminandoProyecto] = useState(false);

  async function cargar() {
    setLoading(true);
    try {
      setDatos(await obtenerProyecto(proyectoId));
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el proyecto');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  async function handleCambiarEstado(estado: EstadoProyecto) {
    if (!datos || estado === datos.proyecto.estado) return;
    setCambiandoEstado(true);
    try {
      await actualizarEstadoProyecto(proyectoId, estado);
      showToast('Estado actualizado', 'success');
      await cargar();
    } catch (e: any) {
      alert(e?.message || 'No se pudo actualizar el estado');
    } finally {
      setCambiandoEstado(false);
    }
  }

  async function handleAgregarDocumento() {
    if (!nombreDoc.trim() || !archivoDoc) {
      alert('Indica de qué es el documento y elige un archivo.');
      return;
    }
    setSubiendoDoc(true);
    try {
      await agregarDocumento(proyectoId, { nombre: nombreDoc, descripcion: descripcionDoc, archivo: archivoDoc });
      showToast('Documento agregado', 'success');
      setShowDocumento(false);
      setNombreDoc(''); setDescripcionDoc(''); setArchivoDoc(null);
      await cargar();
    } catch (e: any) {
      alert(e?.message || 'No se pudo subir el documento');
    } finally {
      setSubiendoDoc(false);
    }
  }

  async function handleAbrirDocumento(doc: DocumentoProyecto) {
    const url = await obtenerUrlDocumento(doc.archivo_path);
    if (url) window.open(url, '_blank');
    else alert('No se pudo abrir el archivo.');
  }

  async function handleEliminarDocumento(doc: DocumentoProyecto) {
    if (!confirm(`¿Borrar «${doc.nombre}»? No se puede deshacer.`)) return;
    try {
      await eliminarDocumento(doc.id, doc.archivo_path);
      showToast('Documento eliminado', 'success');
      await cargar();
    } catch (e: any) {
      alert(e?.message || 'No se pudo eliminar');
    }
  }

  async function handleBuscarCotizacion(texto: string) {
    setBusquedaCot(texto);
    if (texto.trim().length < 2) { setResultadosCot([]); return; }
    setBuscandoCot(true);
    try {
      setResultadosCot(await buscarCotizacionesParaVincular(texto));
    } finally {
      setBuscandoCot(false);
    }
  }

  async function handleVincular(cotizacionId: string) {
    setVinculando(cotizacionId);
    try {
      await vincularCotizacion(proyectoId, cotizacionId);
      showToast('Cotización vinculada', 'success');
      setShowVincular(false);
      setBusquedaCot(''); setResultadosCot([]);
      await cargar();
    } catch (e: any) {
      alert(e?.message || 'No se pudo vincular');
    } finally {
      setVinculando(null);
    }
  }

  async function handleDesvincular(cotizacionId: string) {
    if (!confirm('¿Quitar el vínculo con esta cotización? La cotización no se borra, solo deja de aparecer aquí.')) return;
    try {
      await desvincularCotizacion(proyectoId, cotizacionId);
      showToast('Vínculo quitado', 'success');
      await cargar();
    } catch (e: any) {
      alert(e?.message || 'No se pudo quitar el vínculo');
    }
  }

  async function handleEliminarProyecto() {
    if (!datos) return;
    if (!confirm(`¿Eliminar el proyecto «${datos.proyecto.sistema}» de ${datos.cliente.nombre}? Se borran también sus documentos. Acción permanente.`)) return;
    setEliminandoProyecto(true);
    try {
      await eliminarProyecto(proyectoId);
      showToast('Proyecto eliminado', 'success');
      router.push('/dashboard/proyectos');
    } catch (e: any) {
      alert(e?.message || 'No se pudo eliminar');
      setEliminandoProyecto(false);
    }
  }

  if (loading) {
    return (
      <SupervisorShell active="proyectos" title="Proyecto" userName={userName}>
        <p className="text-muted text-center py-14">Cargando…</p>
      </SupervisorShell>
    );
  }
  if (error || !datos) {
    return (
      <SupervisorShell active="proyectos" title="Proyecto" userName={userName}>
        <p className="text-red text-center py-14">{error || 'No se encontró el proyecto'}</p>
      </SupervisorShell>
    );
  }

  const { proyecto, cliente, documentos, cotizaciones } = datos;

  return (
    <SupervisorShell active="proyectos" title={cliente.nombre} userName={userName}>
      <Link href="/dashboard/proyectos" className="inline-flex items-center gap-1.5 text-[13.5px] text-teal font-medium mb-4 min-h-[40px]">
        <ChevronLeft size={16} strokeWidth={2.4} />
        Todos los proyectos
      </Link>

      {/* Encabezado + estado */}
      <div className={`${cardCls} mb-4`}>
        <div className="flex justify-between items-start gap-3 mb-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Sistema</div>
            <span className="text-[17px] font-display font-bold">{proyecto.sistema}</span>
          </div>
          <span className={`text-[12.5px] font-semibold px-3 py-1.5 rounded-full border ${ESTADO_CLS[proyecto.estado]}`}>
            {ESTADO_LABEL[proyecto.estado]}
          </span>
        </div>
        {proyecto.descripcion && <p className="text-[13.5px] text-ink/80 leading-relaxed mb-3.5">{proyecto.descripcion}</p>}

        <label className={labelCls}>Cambiar estado</label>
        <div className="flex gap-1.5 p-1 rounded-xl bg-surface-2 border border-line w-fit flex-wrap">
          {(['propuesta', 'en_curso', 'concluido'] as const).map((e) => (
            <button
              key={e}
              onClick={() => handleCambiarEstado(e)}
              disabled={cambiandoEstado}
              className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors disabled:opacity-60 ${
                proyecto.estado === e ? 'bg-teal text-inkOnAccent' : 'text-muted'
              }`}
            >
              {ESTADO_LABEL[e]}
            </button>
          ))}
        </div>
        <p className="text-[11.5px] text-faint mt-2">Creado {formatFecha(proyecto.created_at)} · Actualizado {formatFecha(proyecto.updated_at)}</p>
      </div>

      {/* Cotizaciones vinculadas */}
      <div className={`${cardCls} mb-4`}>
        <div className="flex items-center justify-between gap-2 mb-3.5">
          <p className="font-display font-semibold text-[13px] uppercase tracking-wider text-teal flex items-center gap-2">
            <Receipt size={15} strokeWidth={2.4} /> Cotizaciones
          </p>
          <button
            onClick={() => setShowVincular(true)}
            className="text-teal text-[13px] font-semibold flex items-center gap-1 active:scale-95 transition-transform"
          >
            <Plus size={15} strokeWidth={2.6} /> Vincular
          </button>
        </div>

        {cotizaciones.length === 0 && <p className="text-[13px] text-muted py-3">Sin cotizaciones vinculadas todavía.</p>}

        <div className="flex flex-col gap-2">
          {cotizaciones.map((c) => (
            <div key={c.cotizacion_id} className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-2 border border-line">
              <Link href={`/dashboard/cotizaciones/${c.cotizacion_id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] font-mono font-semibold text-teal">{c.folio}</span>
                  <span className="text-[12px] text-muted truncate">{c.empresa}</span>
                </div>
                <span className="text-[13.5px] font-semibold">{money(c.total, c.moneda)}</span>
              </Link>
              <button
                onClick={() => handleDesvincular(c.cotizacion_id)}
                aria-label="Quitar vínculo"
                className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-red active:scale-90 transition-transform"
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Documentación */}
      <div className={`${cardCls} mb-4`}>
        <div className="flex items-center justify-between gap-2 mb-3.5">
          <p className="font-display font-semibold text-[13px] uppercase tracking-wider text-teal flex items-center gap-2">
            <Paperclip size={15} strokeWidth={2.4} /> Documentación
          </p>
          <button
            onClick={() => setShowDocumento(true)}
            className="text-teal text-[13px] font-semibold flex items-center gap-1 active:scale-95 transition-transform"
          >
            <Plus size={15} strokeWidth={2.6} /> Agregar
          </button>
        </div>

        {documentos.length === 0 && <p className="text-[13px] text-muted py-3">Sin documentos todavía.</p>}

        <div className="flex flex-col gap-2">
          {documentos.map((d) => (
            <div key={d.id} className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-2 border border-line">
              <button onClick={() => handleAbrirDocumento(d)} className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <FileText size={13} strokeWidth={2.4} className="text-teal shrink-0" />
                  <span className="text-[13.5px] font-semibold truncate">{d.nombre}</span>
                </div>
                {d.descripcion && <p className="text-[12.5px] text-ink/75 mb-1">{d.descripcion}</p>}
                <p className="text-[11px] text-faint">{nombreSubio(d.profiles)} · {formatFecha(d.created_at)}</p>
              </button>
              <button
                onClick={() => handleAbrirDocumento(d)}
                aria-label="Abrir documento"
                className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-teal active:scale-90 transition-transform"
              >
                <Download size={16} strokeWidth={2.4} />
              </button>
              <button
                onClick={() => handleEliminarDocumento(d)}
                aria-label="Eliminar documento"
                className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-red active:scale-90 transition-transform"
              >
                <Trash2 size={15} strokeWidth={2.4} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleEliminarProyecto}
        disabled={eliminandoProyecto}
        className="text-red text-[13.5px] font-medium mt-1 mb-8 min-h-[44px] flex items-center gap-1.5 disabled:opacity-60"
      >
        <Trash2 size={15} strokeWidth={2.4} />
        {eliminandoProyecto ? 'Eliminando...' : 'Eliminar este proyecto'}
      </button>

      {/* Modal: agregar documento */}
      {showDocumento && (
        <ModalOverlay onClose={() => setShowDocumento(false)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto">
            <p className="font-display font-semibold text-[16px] mb-3.5">Agregar documento</p>

            <label className={labelCls}>¿De qué es? *</label>
            <input
              list="tipos-documento"
              value={nombreDoc}
              onChange={(e) => setNombreDoc(e.target.value)}
              placeholder="Ej. Planos"
              className={`${inputCls} mb-3.5`}
            />
            <datalist id="tipos-documento">
              {TIPOS_DOCUMENTO_SUGERIDOS.map((t) => <option key={t} value={t} />)}
            </datalist>

            <label className={labelCls}>Descripción</label>
            <textarea
              value={descripcionDoc}
              onChange={(e) => setDescripcionDoc(e.target.value)}
              placeholder="De qué trata este documento"
              className={`${inputCls} min-h-[70px] mb-3.5`}
            />

            <label className={labelCls}>Archivo *</label>
            <input
              type="file"
              onChange={(e) => setArchivoDoc(e.target.files?.[0] || null)}
              className="w-full text-[13.5px] mb-4"
            />

            <div className="flex gap-2">
              <button onClick={() => setShowDocumento(false)} className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium">
                Cancelar
              </button>
              <button
                onClick={handleAgregarDocumento}
                disabled={subiendoDoc || !nombreDoc.trim() || !archivoDoc}
                className="flex-1 min-h-[48px] rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold disabled:opacity-50"
              >
                {subiendoDoc ? 'Subiendo...' : 'Agregar'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Modal: vincular cotización */}
      {showVincular && (
        <ModalOverlay onClose={() => setShowVincular(false)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-3.5">
              <p className="font-display font-semibold text-[16px]">Vincular cotización</p>
              <button onClick={() => setShowVincular(false)} aria-label="Cerrar" className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform">
                <X size={18} strokeWidth={2.4} />
              </button>
            </div>
            <div className="relative mb-3.5">
              <Search size={16} strokeWidth={2.4} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
              <input
                autoFocus
                value={busquedaCot}
                onChange={(e) => handleBuscarCotizacion(e.target.value)}
                placeholder="Folio o empresa…"
                className={`${inputCls} pl-10`}
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {buscandoCot && <p className="text-[13px] text-muted text-center py-6">Buscando…</p>}
              {!buscandoCot && busquedaCot.trim().length >= 2 && resultadosCot.length === 0 && (
                <p className="text-[13px] text-muted text-center py-6">Sin resultados.</p>
              )}
              {!buscandoCot && resultadosCot.map((c) => (
                <button
                  key={c.cotizacion_id}
                  onClick={() => handleVincular(c.cotizacion_id)}
                  disabled={vinculando === c.cotizacion_id}
                  className="w-full flex items-center justify-between gap-2.5 p-3 mb-2 rounded-xl bg-surface-2 border border-line text-left active:scale-[0.98] transition-transform disabled:opacity-60"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-mono font-semibold text-teal">{c.folio}</span>
                      <span className="text-[12.5px] text-muted truncate">{c.empresa}</span>
                    </div>
                  </div>
                  <span className="text-[13px] font-semibold shrink-0">{money(c.total, c.moneda)}</span>
                </button>
              ))}
            </div>
          </div>
        </ModalOverlay>
      )}
    </SupervisorShell>
  );
}
