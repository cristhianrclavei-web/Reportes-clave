'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SupervisorShell from '@/components/SupervisorShell';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import {
  ClienteContacto, obtenerClienteCompleto, actualizarPerfilCliente, subirLogoCliente, subirFotoPortadaCliente,
  eliminarFotoPortadaCliente, agregarContacto, eliminarContacto, eliminarCliente,
} from '@/lib/clientes';
import { EstadoProyecto, SISTEMAS_SUGERIDOS, crearProyectoParaCliente } from '@/lib/proyectos';
import {
  ChevronLeft, Building2, Camera, MapPin, Phone, Mail, User, Plus, X, Trash2,
  Pencil, Check, FileText, Receipt, ChevronRight, FolderOpen, ImagePlus,
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

function formatFecha(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ClienteDetalle({ clienteId, userName }: { clienteId: string; userName?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof obtenerClienteCompleto>> | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const portadaInputRef = useRef<HTMLInputElement>(null);
  const [subiendoPortada, setSubiendoPortada] = useState(false);

  const [editandoPerfil, setEditandoPerfil] = useState(false);
  const [nombreEdit, setNombreEdit] = useState('');
  const [direccionEdit, setDireccionEdit] = useState('');
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);

  const [showContacto, setShowContacto] = useState(false);
  const [contactoNombre, setContactoNombre] = useState('');
  const [contactoPuesto, setContactoPuesto] = useState('');
  const [contactoTel, setContactoTel] = useState('');
  const [contactoCorreo, setContactoCorreo] = useState('');
  const [guardandoContacto, setGuardandoContacto] = useState(false);

  const [showProyecto, setShowProyecto] = useState(false);
  const [sistemaNuevo, setSistemaNuevo] = useState('');
  const [nombreProyectoNuevo, setNombreProyectoNuevo] = useState('');
  const [descripcionProyectoNuevo, setDescripcionProyectoNuevo] = useState('');
  const [creandoProyecto, setCreandoProyecto] = useState(false);
  const [msgProyecto, setMsgProyecto] = useState<string | null>(null);

  const [eliminandoCliente, setEliminandoCliente] = useState(false);

  async function cargar() {
    setLoading(true);
    try {
      const d = await obtenerClienteCompleto(clienteId);
      setDatos(d);
      setNombreEdit(d.cliente.nombre);
      setDireccionEdit(d.cliente.direccion || '');
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el cliente');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  const sistemasSugeridosCliente = useMemo(() => {
    if (!datos) return SISTEMAS_SUGERIDOS;
    const propios = Array.from(new Set(datos.proyectos.map((p) => p.sistema)));
    return Array.from(new Set([...propios, ...SISTEMAS_SUGERIDOS]));
  }, [datos]);

  const grupos = useMemo(() => {
    if (!datos) return [];
    const mapa = new Map<string, typeof datos.proyectos>();
    datos.proyectos.forEach((p) => {
      if (!mapa.has(p.sistema)) mapa.set(p.sistema, []);
      mapa.get(p.sistema)!.push(p);
    });
    return Array.from(mapa.entries()).map(([sistema, proyectos]) => ({ sistema, proyectos }));
  }, [datos]);

  async function handleSubirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendoFoto(true);
    try {
      await subirLogoCliente(clienteId, file);
      showToast('Foto actualizada', 'success');
      await cargar();
    } catch (err: any) {
      alert(err?.message || 'No se pudo subir la foto');
    } finally {
      setSubiendoFoto(false);
      if (fotoInputRef.current) fotoInputRef.current.value = '';
    }
  }

  async function handleSubirPortada(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendoPortada(true);
    try {
      await subirFotoPortadaCliente(clienteId, file);
      showToast('Foto de portada actualizada', 'success');
      await cargar();
    } catch (err: any) {
      alert(err?.message || 'No se pudo subir la foto');
    } finally {
      setSubiendoPortada(false);
      if (portadaInputRef.current) portadaInputRef.current.value = '';
    }
  }

  async function handleQuitarPortada(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('¿Quitar la foto de portada?')) return;
    setSubiendoPortada(true);
    try {
      await eliminarFotoPortadaCliente(clienteId);
      await cargar();
    } catch (err: any) {
      alert(err?.message || 'No se pudo quitar la foto');
    } finally {
      setSubiendoPortada(false);
    }
  }

  async function handleGuardarPerfil() {
    setGuardandoPerfil(true);
    try {
      await actualizarPerfilCliente(clienteId, { nombre: nombreEdit, direccion: direccionEdit });
      showToast('Perfil actualizado', 'success');
      setEditandoPerfil(false);
      await cargar();
    } catch (e: any) {
      alert(e?.message || 'No se pudo guardar');
    } finally {
      setGuardandoPerfil(false);
    }
  }

  async function handleAgregarContacto() {
    if (!contactoNombre.trim()) {
      alert('Falta el nombre del contacto.');
      return;
    }
    setGuardandoContacto(true);
    try {
      await agregarContacto(clienteId, { nombre: contactoNombre, puesto: contactoPuesto, telefono: contactoTel, correo: contactoCorreo });
      showToast('Contacto agregado', 'success');
      setShowContacto(false);
      setContactoNombre(''); setContactoPuesto(''); setContactoTel(''); setContactoCorreo('');
      await cargar();
    } catch (e: any) {
      alert(e?.message || 'No se pudo agregar');
    } finally {
      setGuardandoContacto(false);
    }
  }

  async function handleEliminarContacto(c: ClienteContacto) {
    if (!confirm(`¿Quitar a ${c.nombre} de los contactos?`)) return;
    try {
      await eliminarContacto(c.id);
      await cargar();
    } catch (e: any) {
      alert(e?.message || 'No se pudo eliminar');
    }
  }

  async function handleCrearProyecto() {
    if (!sistemaNuevo.trim() || !nombreProyectoNuevo.trim()) {
      setMsgProyecto('Falta el sistema o el nombre del proyecto.');
      return;
    }
    setCreandoProyecto(true);
    setMsgProyecto(null);
    try {
      const id = await crearProyectoParaCliente({
        clienteId, sistema: sistemaNuevo, nombre: nombreProyectoNuevo, descripcion: descripcionProyectoNuevo,
      });
      router.push(`/dashboard/proyectos/${clienteId}/${id}`);
    } catch (e: any) {
      setMsgProyecto(e?.message || 'No se pudo crear');
      setCreandoProyecto(false);
    }
  }

  async function handleEliminarCliente() {
    if (!datos) return;
    if (!confirm(`¿Eliminar a ${datos.cliente.nombre} y TODOS sus proyectos y documentos? Acción permanente.`)) return;
    setEliminandoCliente(true);
    try {
      await eliminarCliente(clienteId);
      showToast('Cliente eliminado', 'success');
      router.push('/dashboard/proyectos');
    } catch (e: any) {
      alert(e?.message || 'No se pudo eliminar');
      setEliminandoCliente(false);
    }
  }

  if (loading) {
    return <SupervisorShell active="proyectos" title="Cliente" userName={userName}><p className="text-muted text-center py-14">Cargando…</p></SupervisorShell>;
  }
  if (error || !datos) {
    return <SupervisorShell active="proyectos" title="Cliente" userName={userName}><p className="text-red text-center py-14">{error || 'No se encontró el cliente'}</p></SupervisorShell>;
  }

  const { cliente, logoUrl, portadaUrl, contactos } = datos;

  return (
    <SupervisorShell active="proyectos" title={cliente.nombre} userName={userName}>
      <Link href="/dashboard/proyectos" className="inline-flex items-center gap-1.5 text-[13.5px] text-teal font-medium mb-4 min-h-[40px]">
        <ChevronLeft size={16} strokeWidth={2.4} />
        Todos los clientes
      </Link>

      {/* Foto de portada: fachada o sitio del cliente, aparte del logo. */}
      <button
        onClick={() => portadaInputRef.current?.click()}
        disabled={subiendoPortada}
        className="group relative w-full h-32 sm:h-40 rounded-2xl overflow-hidden mb-4 border border-line bg-surface-2 disabled:opacity-60"
        aria-label="Cambiar foto de portada"
      >
        {portadaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={portadaUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-faint">
            <ImagePlus size={22} strokeWidth={1.8} />
            <span className="text-[12px] font-medium">Agregar foto del sitio</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Camera size={20} strokeWidth={2.2} className="text-white" />
        </div>
        {portadaUrl && (
          <span
            role="button"
            onClick={handleQuitarPortada}
            aria-label="Quitar foto de portada"
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white active:scale-90 transition-transform"
          >
            <X size={15} strokeWidth={2.4} />
          </span>
        )}
      </button>
      <input ref={portadaInputRef} type="file" accept="image/*" onChange={handleSubirPortada} className="hidden" />

      {/* Perfil del cliente */}
      <div className={`${cardCls} mb-4`}>
        <div className="flex items-start gap-4 mb-1">
          <button
            onClick={() => fotoInputRef.current?.click()}
            disabled={subiendoFoto}
            className="relative shrink-0 w-20 h-20 rounded-2xl bg-surface-2 border border-line overflow-hidden flex items-center justify-center active:scale-95 transition-transform disabled:opacity-60"
            aria-label="Cambiar foto de perfil"
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <Building2 size={26} strokeWidth={1.8} className="text-faint" />
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera size={18} strokeWidth={2.2} className="text-white" />
            </div>
          </button>
          <input ref={fotoInputRef} type="file" accept="image/*" onChange={handleSubirFoto} className="hidden" />

          <div className="flex-1 min-w-0">
            {!editandoPerfil ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-display font-bold text-[19px] leading-tight">{cliente.nombre}</h2>
                  <button onClick={() => setEditandoPerfil(true)} aria-label="Editar" className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-muted active:scale-90 transition-transform">
                    <Pencil size={14} strokeWidth={2.3} />
                  </button>
                </div>
                {cliente.direccion ? (
                  <p className="text-[13px] text-muted flex items-center gap-1.5 mt-1">
                    <MapPin size={13} strokeWidth={2.3} className="shrink-0" /> {cliente.direccion}
                  </p>
                ) : (
                  <p className="text-[12.5px] text-faint mt-1">Sin dirección capturada</p>
                )}
              </>
            ) : (
              <div>
                <label className={labelCls}>Nombre</label>
                <input value={nombreEdit} onChange={(e) => setNombreEdit(e.target.value)} className={`${inputCls} mb-2.5`} />
                <label className={labelCls}>Dirección</label>
                <input value={direccionEdit} onChange={(e) => setDireccionEdit(e.target.value)} className={`${inputCls} mb-3`} placeholder="Calle, colonia, ciudad..." />
                <div className="flex gap-2">
                  <button onClick={() => { setEditandoPerfil(false); setNombreEdit(cliente.nombre); setDireccionEdit(cliente.direccion || ''); }} className="flex-1 min-h-[42px] rounded-xl border border-line-strong text-[13.5px]">Cancelar</button>
                  <button onClick={handleGuardarPerfil} disabled={guardandoPerfil} className="flex-1 min-h-[42px] rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60">
                    <Check size={15} strokeWidth={2.6} /> {guardandoPerfil ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Contactos */}
        <div className="mt-4 pt-3.5 border-t border-dashed border-line-strong">
          <div className="flex items-center justify-between mb-2.5">
            <p className={`${labelCls} mb-0`}>Contactos</p>
            <button onClick={() => setShowContacto(true)} className="text-teal text-[12.5px] font-semibold flex items-center gap-1 active:scale-95 transition-transform">
              <Plus size={14} strokeWidth={2.6} /> Agregar
            </button>
          </div>
          {contactos.length === 0 && <p className="text-[13px] text-faint">Sin contactos capturados.</p>}
          <div className="flex flex-col gap-2">
            {contactos.map((c) => (
              <div key={c.id} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-surface-2 border border-line">
                <User size={14} strokeWidth={2.3} className="text-muted shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold">{c.nombre}{c.puesto ? ` · ${c.puesto}` : ''}</p>
                  <div className="flex items-center gap-3 flex-wrap mt-0.5">
                    {c.telefono && <span className="text-[12px] text-muted flex items-center gap-1"><Phone size={11} strokeWidth={2.3} />{c.telefono}</span>}
                    {c.correo && <span className="text-[12px] text-muted flex items-center gap-1"><Mail size={11} strokeWidth={2.3} />{c.correo}</span>}
                  </div>
                </div>
                <button onClick={() => handleEliminarContacto(c)} aria-label="Quitar contacto" className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-red active:scale-90 transition-transform">
                  <X size={14} strokeWidth={2.4} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sistemas y proyectos */}
      <div className="flex items-center justify-between mb-3">
        <p className="font-display font-semibold text-[15px]">Sistemas y proyectos</p>
        <button
          onClick={() => { setShowProyecto(true); setSistemaNuevo(''); setNombreProyectoNuevo(''); setDescripcionProyectoNuevo(''); setMsgProyecto(null); }}
          className="min-h-[42px] px-4 rounded-xl bg-teal text-inkOnAccent text-[13px] font-display font-semibold flex items-center gap-1.5 active:scale-95 transition-transform shadow-glow-teal"
        >
          <Plus size={16} strokeWidth={2.6} /> Nuevo proyecto
        </button>
      </div>

      {grupos.length === 0 && (
        <div className={`${cardCls} text-center py-10 mb-4`}>
          <FolderOpen size={28} strokeWidth={1.6} className="text-faint mx-auto mb-2.5" />
          <p className="text-[13.5px] text-muted">Sin sistemas todavía. Agrega el primer proyecto para empezar.</p>
        </div>
      )}

      <div className="flex flex-col gap-4 mb-6">
        {grupos.map(({ sistema, proyectos }) => (
          <div key={sistema} className={cardCls}>
            <p className="font-display font-semibold text-[13px] uppercase tracking-wider text-teal mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-teal inline-block" /> {sistema}
              <span className="text-faint font-normal normal-case tracking-normal">· {proyectos.length}</span>
            </p>
            <div className="flex flex-col gap-2">
              {proyectos.map((p) => (
                <Link
                  key={p.id}
                  href={`/dashboard/proyectos/${clienteId}/${p.id}`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-line active:scale-[0.99] transition-transform"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold truncate mb-1">{p.nombre}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${ESTADO_CLS[p.estado]}`}>
                        {ESTADO_LABEL[p.estado]}
                      </span>
                      {p.estado === 'concluido' && p.concluido_en && (
                        <span className="text-[11px] text-faint whitespace-nowrap">{formatFecha(p.concluido_en)}</span>
                      )}
                      {p.documentos_nombres.slice(0, 3).map((n) => (
                        <span key={n} className="text-[10.5px] text-muted bg-surface px-2 py-0.5 rounded-full border border-line flex items-center gap-1 whitespace-nowrap">
                          <FileText size={9} strokeWidth={2.4} /> {n}
                        </span>
                      ))}
                      {p.cotizaciones_count > 0 && (
                        <span className="text-[10.5px] text-muted bg-surface px-2 py-0.5 rounded-full border border-line flex items-center gap-1 whitespace-nowrap">
                          <Receipt size={9} strokeWidth={2.4} /> {p.cotizaciones_count}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={17} strokeWidth={2.4} className="text-faint shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleEliminarCliente}
        disabled={eliminandoCliente}
        className="text-red text-[13.5px] font-medium mb-8 min-h-[44px] flex items-center gap-1.5 disabled:opacity-60"
      >
        <Trash2 size={15} strokeWidth={2.4} />
        {eliminandoCliente ? 'Eliminando...' : 'Eliminar este cliente'}
      </button>

      {/* Modal: agregar contacto */}
      {showContacto && (
        <ModalOverlay onClose={() => setShowContacto(false)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto">
            <p className="font-display font-semibold text-[16px] mb-3.5">Agregar contacto</p>
            <label className={labelCls}>Nombre *</label>
            <input value={contactoNombre} onChange={(e) => setContactoNombre(e.target.value)} className={`${inputCls} mb-3`} placeholder="Ej. Ing. Laura Méndez" />
            <label className={labelCls}>Puesto</label>
            <input value={contactoPuesto} onChange={(e) => setContactoPuesto(e.target.value)} className={`${inputCls} mb-3`} placeholder="Ej. Gerente de mantenimiento" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className={labelCls}>Teléfono</label>
                <input value={contactoTel} onChange={(e) => setContactoTel(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Correo</label>
                <input value={contactoCorreo} onChange={(e) => setContactoCorreo(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowContacto(false)} className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium">Cancelar</button>
              <button onClick={handleAgregarContacto} disabled={guardandoContacto} className="flex-1 min-h-[48px] rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold disabled:opacity-50">
                {guardandoContacto ? 'Guardando...' : 'Agregar'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Modal: nuevo proyecto */}
      {showProyecto && (
        <ModalOverlay onClose={() => setShowProyecto(false)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto">
            <p className="font-display font-semibold text-[16px] mb-3.5">Nuevo proyecto</p>

            <label className={labelCls}>Sistema *</label>
            <input
              list="sistemas-cliente"
              value={sistemaNuevo}
              onChange={(e) => setSistemaNuevo(e.target.value)}
              placeholder="Ej. CCTV"
              className={`${inputCls} mb-3`}
            />
            <datalist id="sistemas-cliente">
              {sistemasSugeridosCliente.map((s) => <option key={s} value={s} />)}
            </datalist>

            <label className={labelCls}>Nombre del proyecto *</label>
            <input
              value={nombreProyectoNuevo}
              onChange={(e) => setNombreProyectoNuevo(e.target.value)}
              placeholder="Ej. Cambio de NVR"
              className={`${inputCls} mb-3`}
            />

            <label className={labelCls}>Descripción (opcional)</label>
            <textarea
              value={descripcionProyectoNuevo}
              onChange={(e) => setDescripcionProyectoNuevo(e.target.value)}
              placeholder="Alcance, notas del sitio..."
              className={`${inputCls} min-h-[70px] mb-4`}
            />

            {msgProyecto && <div className="text-sm px-4 py-3 mb-3.5 rounded-xl bg-red/10 text-red border border-red/30">{msgProyecto}</div>}

            <div className="flex gap-2">
              <button onClick={() => setShowProyecto(false)} className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium">Cancelar</button>
              <button onClick={handleCrearProyecto} disabled={creandoProyecto} className="flex-1 min-h-[48px] rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold disabled:opacity-50">
                {creandoProyecto ? 'Creando...' : 'Crear proyecto'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </SupervisorShell>
  );
}
