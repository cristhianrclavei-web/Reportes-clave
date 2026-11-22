'use client';

import { avisar, confirmar } from '@/lib/dialogos';
import ReportesDelCliente from '@/components/ReportesDelCliente';
import UbicacionCliente from '@/components/clientes/UbicacionCliente';
import FacturasDelCliente from '@/components/FacturasDelCliente';
import CotizacionesDelCliente from '@/components/CotizacionesDelCliente';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SupervisorShell from '@/components/SupervisorShell';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import {
  ClienteContacto, obtenerClienteCompleto, actualizarPerfilCliente, subirLogoCliente, subirFotoPortadaCliente,
  eliminarFotoPortadaCliente, agregarContacto, eliminarContacto, eliminarCliente, marcarClienteRevisado,
} from '@/lib/clientes';
import ProyectosDelCliente from '@/components/proyectos/ProyectosDelCliente';
import { DatosCliente, datosClienteVacios, datosDesdeCliente } from '@/lib/clienteDatos';
import CamposCliente from '@/components/CamposCliente';
import ClienteAvatar, { fondoAvatar } from '@/components/ClienteAvatar';
import {
  ChevronLeft, Camera, MapPin, Phone, Mail, User, Plus, X, Trash2,
  Pencil, Check, FileText, Receipt, ChevronRight, FolderOpen, ImagePlus, Cable,
} from 'lucide-react';

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
  const [perfilEdit, setPerfilEdit] = useState<DatosCliente>(datosClienteVacios());
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);

  const [showContacto, setShowContacto] = useState(false);
  const [contactoNombre, setContactoNombre] = useState('');
  const [contactoPuesto, setContactoPuesto] = useState('');
  const [contactoTel, setContactoTel] = useState('');
  const [contactoCorreo, setContactoCorreo] = useState('');
  const [guardandoContacto, setGuardandoContacto] = useState(false);


  const [eliminandoCliente, setEliminandoCliente] = useState(false);

  async function cargar() {
    setLoading(true);
    try {
      const d = await obtenerClienteCompleto(clienteId);
      setDatos(d);
      setPerfilEdit(datosDesdeCliente(d.cliente));
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el cliente');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  async function handleSubirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendoFoto(true);
    try {
      await subirLogoCliente(clienteId, file);
      showToast('Foto actualizada', 'success');
      await cargar();
    } catch (err: any) {
      avisar(err?.message || 'No se pudo subir la foto');
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
      avisar(err?.message || 'No se pudo subir la foto');
    } finally {
      setSubiendoPortada(false);
      if (portadaInputRef.current) portadaInputRef.current.value = '';
    }
  }

  async function handleQuitarPortada(e: React.MouseEvent) {
    e.stopPropagation();
    if (!await confirmar('¿Quitar la foto de portada?')) return;
    setSubiendoPortada(true);
    try {
      await eliminarFotoPortadaCliente(clienteId);
      await cargar();
    } catch (err: any) {
      avisar(err?.message || 'No se pudo quitar la foto');
    } finally {
      setSubiendoPortada(false);
    }
  }

  async function handleGuardarPerfil() {
    setGuardandoPerfil(true);
    try {
      await actualizarPerfilCliente(clienteId, perfilEdit);
      showToast('Perfil actualizado', 'success');
      setEditandoPerfil(false);
      await cargar();
    } catch (e: any) {
      avisar(e?.message || 'No se pudo guardar');
    } finally {
      setGuardandoPerfil(false);
    }
  }

  async function handleAgregarContacto() {
    if (!contactoNombre.trim()) {
      avisar('Falta el nombre del contacto.');
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
      avisar(e?.message || 'No se pudo agregar');
    } finally {
      setGuardandoContacto(false);
    }
  }

  async function handleEliminarContacto(c: ClienteContacto) {
    if (!await confirmar(`¿Quitar a ${c.nombre} de los contactos?`)) return;
    try {
      await eliminarContacto(c.id);
      await cargar();
    } catch (e: any) {
      avisar(e?.message || 'No se pudo eliminar');
    }
  }

  async function handleEliminarCliente() {
    if (!datos) return;
    if (!await confirmar(`¿Eliminar a ${datos.cliente.nombre} y TODOS sus proyectos y documentos? Acción permanente.`)) return;
    setEliminandoCliente(true);
    try {
      await eliminarCliente(clienteId);
      showToast('Cliente eliminado', 'success');
      router.push('/dashboard/proyectos');
    } catch (e: any) {
      avisar(e?.message || 'No se pudo eliminar');
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

      {/* Creado solo desde un reporte: pide que alguien lo revise */}
      {cliente.pendiente_revision && (
        <div className="mb-4 p-3.5 rounded-2xl bg-amber/10 border border-amber/30 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-[13px] text-ink/85 flex-1">
            <b className="text-amber">Por revisar.</b> Se creó solo desde un reporte. Revisa que el nombre esté bien escrito y completa sus datos.
          </p>
          <button
            type="button"
            onClick={async () => {
              try {
                await marcarClienteRevisado(cliente.id);
                setDatos((d) => (d ? { ...d, cliente: { ...d.cliente, pendiente_revision: false } } : d));
                showToast('Cliente revisado', 'success');
              } catch (e: any) {
                showToast('No se pudo marcar: ' + (e?.message || 'error'), 'error');
              }
            }}
            className="shrink-0 min-h-[40px] px-4 rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold"
          >
            Marcar como revisado
          </button>
        </div>
      )}

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
            className={`relative shrink-0 w-20 h-20 rounded-2xl border border-line overflow-hidden flex items-center justify-center active:scale-95 transition-transform disabled:opacity-60 ${logoUrl ? 'bg-white' : fondoAvatar(cliente.tipo_persona)}`}
            aria-label="Cambiar foto de perfil"
          >
            {logoUrl ? (
              // Un logo no se recorta: se ajusta completo al cuadro, sea ancho, alto o cuadrado.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="w-full h-full object-contain p-1.5" />
            ) : (
              <ClienteAvatar tipo={cliente.tipo_persona} size={56} />
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
                  <div className="min-w-0">
                    <h2 className="font-display font-bold text-[19px] leading-tight">{cliente.nombre}</h2>
                    <span className={`inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cliente.tipo_persona === 'fisica' ? 'bg-amber/15 text-amber' : 'bg-teal/15 text-teal'}`}>
                      {cliente.tipo_persona === 'fisica' ? 'Persona física' : 'Empresa'}
                    </span>
                  </div>
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
                <div className="mb-3">
                  <CamposCliente valor={perfilEdit} onChange={setPerfilEdit} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditandoPerfil(false); setPerfilEdit(datosDesdeCliente(cliente)); }} className="flex-1 min-h-[42px] rounded-xl border border-line-strong text-[13.5px]">Cancelar</button>
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

      {/* Las obras del cliente y lo suyo que todavía no está en ninguna. */}
      <ProyectosDelCliente clienteId={cliente.id} clienteNombre={cliente.nombre} proyectos={datos.proyectos} onCambio={cargar} />

      {/* Reportes de servicio del cliente */}
      <UbicacionCliente clienteId={cliente.id} />
      <ReportesDelCliente clienteId={cliente.id} clienteNombre={cliente.nombre} />
      <CotizacionesDelCliente clienteId={cliente.id} clienteNombre={cliente.nombre} />
      <FacturasDelCliente clienteId={cliente.id} />

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

    </SupervisorShell>
  );
}
