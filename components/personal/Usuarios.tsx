'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check, ChevronRight, Copy, KeyRound, Mail, Phone, Plus, Search, ShieldCheck, Trash2, UserCheck, UserMinus, UserRound, Wrench, X,
  Warehouse, ReceiptText, FileCheck, Receipt, CalendarClock, UsersRound, AlertTriangle,
} from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { AvatarTecnico } from '@/components/AvatarTecnico';
import { showToast } from '@/components/Toast';
import { usePlan } from '@/lib/planes';
import { cargarPerfiles } from '@/lib/perfiles';

// Personal → Usuarios: alta, edición (datos, rol y permisos), baja y
// eliminación de cuentas. Solo para quien tiene el permiso de administrar
// usuarios; todo pasa por /api/usuarios, que lo vuelve a comprobar.

type Rol = 'tecnico' | 'supervisor';
type ClavePermiso = 'can_manage_usuarios' | 'can_manage_almacen' | 'can_manage_billing' | 'can_approve_review' | 'can_approve_cotizacion' | 'can_approve_personal';

type Usuario = {
  id: string;
  full_name: string;
  email: string | null;
  role: Rol;
  telefono: string | null;
  puesto: string | null;
  activo: boolean | null;
  created_at: string;
  ultimo_acceso: string | null;
  credenciales_actualizadas?: boolean | null;
  // Cuenta de ejemplo del demo: no se le cambia rol, correo, contraseña ni estado.
  protegida?: boolean;
} & Record<ClavePermiso, boolean | null>;

const PERMISOS: { clave: ClavePermiso; nombre: string; detalle: string; Icono: any }[] = [
  { clave: 'can_manage_usuarios', nombre: 'Administrar usuarios', detalle: 'Dar de alta, editar roles y permisos, y dar de baja cuentas.', Icono: UsersRound },
  { clave: 'can_approve_review', nombre: 'Firmar revisión de reportes', detalle: 'Aprueba y firma la revisión final de los reportes de servicio.', Icono: FileCheck },
  { clave: 'can_approve_cotizacion', nombre: 'Aprobar cotizaciones', detalle: 'Firma la aprobación interna antes de enviarlas al cliente.', Icono: Receipt },
  { clave: 'can_approve_personal', nombre: 'Autorizar solicitudes de personal', detalle: 'Horas extra, vacaciones y permisos.', Icono: CalendarClock },
  { clave: 'can_manage_almacen', nombre: 'Almacén', detalle: 'Entradas, salidas, vales, conteos y catálogo.', Icono: Warehouse },
  { clave: 'can_manage_billing', nombre: 'Facturación', detalle: 'Prefacturas y registro de facturas.', Icono: ReceiptText },
];

const ROLES: { valor: Rol; nombre: string; detalle: string; Icono: any }[] = [
  { valor: 'tecnico', nombre: 'Personal técnico', detalle: 'Atiende servicios en campo: ve sus servicios, hace reportes y pide material.', Icono: Wrench },
  { valor: 'supervisor', nombre: 'Supervisión', detalle: 'Programa servicios, revisa reportes y ve el panel completo.', Icono: ShieldCheck },
];

const inputCls = 'w-full min-h-[46px] px-3.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px] placeholder:text-faint disabled:opacity-60';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-faint mb-1.5';
const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function hace(iso: string | null, ahora: number | null): string {
  if (!iso) return 'Nunca ha entrado';
  if (ahora === null) return '';
  const dias = Math.floor((ahora - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return 'Entró hoy';
  if (dias === 1) return 'Entró ayer';
  if (dias < 30) return `Entró hace ${dias} días`;
  if (dias < 365) return `Entró hace ${Math.floor(dias / 30)} mes${Math.floor(dias / 30) > 1 ? 'es' : ''}`;
  return 'Entró hace más de un año';
}

async function api(ruta: string, opciones?: RequestInit): Promise<any> {
  const r = await fetch(ruta, { ...opciones, headers: { 'Content-Type': 'application/json' } });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(datos.error || `Error ${r.status}`), { historial: datos.historial as string[] | undefined });
  return datos;
}

export default function Usuarios() {
  const plan = usePlan();
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<'activos' | 'tecnico' | 'supervisor' | 'baja'>('activos');
  const [editar, setEditar] = useState<Usuario | 'nuevo' | null>(null);
  const [credencial, setCredencial] = useState<{ nombre: string; email: string; password: string; nueva: boolean } | null>(null);
  // «Hace cuánto entró» depende del reloj del navegador: se calcula ya montado.
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => setAhora(Date.now()), []);

  const cargar = useCallback(async () => {
    try {
      const d = await api('/api/usuarios');
      setUsuarios(d.usuarios);
      setError(null);
    } catch (e: any) {
      setError(e.message);
      setUsuarios([]);
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const activos = (usuarios || []).filter((u) => u.activo !== false);
  const cuenta = {
    activos: activos.length,
    tecnico: activos.filter((u) => u.role === 'tecnico').length,
    supervisor: activos.filter((u) => u.role === 'supervisor').length,
    baja: (usuarios || []).length - activos.length,
  };
  const limite = plan.limite_usuarios;
  const lleno = !!limite && cuenta.activos >= limite;

  const lista = useMemo(() => {
    const n = norm(q.trim());
    return (usuarios || []).filter((u) => {
      const baja = u.activo === false;
      if (filtro === 'baja' ? !baja : baja) return false;
      if ((filtro === 'tecnico' || filtro === 'supervisor') && u.role !== filtro) return false;
      return !n || norm(`${u.full_name} ${u.email || ''} ${u.puesto || ''}`).includes(n);
    });
  }, [usuarios, q, filtro]);

  function alTerminar(c?: { nombre: string; email: string; password: string; nueva: boolean }) {
    setEditar(null);
    if (c) setCredencial(c);
    cargar();
    cargarPerfiles(true);
  }

  return (
    <div>
      {/* Resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
        <div className="col-span-2 rounded-2xl bg-surface border border-line px-4 py-3.5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Usuarios activos</p>
              <p className="font-display font-bold text-[30px] leading-none mt-1 tabular-nums">
                {cuenta.activos}{limite ? <span className="text-[16px] text-muted font-semibold"> de {limite}</span> : null}
              </p>
            </div>
            <button type="button" onClick={() => setEditar('nuevo')} disabled={lleno}
              title={lleno ? 'Tu paquete ya no tiene lugares: da de baja a alguien o amplíalo' : undefined}
              className="h-11 px-4 rounded-full bg-teal text-inkOnAccent text-[14px] font-semibold flex items-center gap-1.5 shadow-glow-teal active:scale-95 transition-transform disabled:opacity-50 disabled:shadow-none">
              <Plus size={17} strokeWidth={2.6} /> Nuevo usuario
            </button>
          </div>
          {limite ? (
            <>
              <div className="mt-3 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div className={`h-full rounded-full ${lleno ? 'bg-red' : cuenta.activos / limite > 0.8 ? 'bg-amber' : 'bg-teal'}`} style={{ width: `${Math.min(100, (cuenta.activos / limite) * 100)}%` }} />
              </div>
              <p className="text-[12px] text-muted mt-1.5">
                {lleno ? 'Tu paquete está completo: da de baja a alguien o amplíalo para agregar más.' : `Quedan ${limite - cuenta.activos} lugares en tu paquete.`}
              </p>
            </>
          ) : (
            <p className="text-[12px] text-muted mt-2">Tu plan no limita el número de usuarios.</p>
          )}
        </div>
        <div className="rounded-2xl bg-surface border border-line px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5"><Wrench size={12} /> Personal técnico</p>
          <p className="font-display font-bold text-[30px] leading-none mt-1 tabular-nums">{cuenta.tecnico}</p>
        </div>
        <div className="rounded-2xl bg-surface border border-line px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5"><ShieldCheck size={12} /> Supervisión</p>
          <p className="font-display font-bold text-[30px] leading-none mt-1 tabular-nums">{cuenta.supervisor}</p>
        </div>
      </div>

      {/* Buscar y filtrar */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-2.5 mb-3">
        <div className="relative flex-1 lg:max-w-sm">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, correo o puesto"
            className="w-full h-11 pl-10 pr-3 rounded-full bg-surface border border-line focus:border-teal focus:outline-none text-[14px] placeholder:text-muted" />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {([
            ['activos', `Activos ${cuenta.activos}`],
            ['tecnico', `Personal técnico ${cuenta.tecnico}`],
            ['supervisor', `Supervisión ${cuenta.supervisor}`],
            ['baja', `De baja ${cuenta.baja}`],
          ] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFiltro(k)} aria-pressed={filtro === k}
              className={`shrink-0 h-9 px-3.5 rounded-full text-[13px] font-semibold border transition-colors ${filtro === k ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink/80'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-[13.5px] text-red font-semibold mb-3 flex items-center gap-2"><AlertTriangle size={16} /> {error}</p>}
      {!usuarios && <p className="text-[13px] text-muted py-8 text-center">Cargando…</p>}
      {usuarios && lista.length === 0 && !error && <p className="text-[13px] text-muted py-8 text-center">Nadie coincide.</p>}

      {/* Lista */}
      {lista.length > 0 && (
        <div className="rounded-2xl bg-surface border border-line overflow-hidden divide-y divide-line">
          <div className="hidden lg:grid grid-cols-[minmax(0,2.2fr)_150px_minmax(0,2fr)_170px_24px] gap-4 px-4 py-2.5 bg-surface-2/60 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <span>Usuario</span><span>Rol</span><span>Permisos</span><span>Acceso</span><span />
          </div>
          {lista.map((u, i) => {
            const permisos = PERMISOS.filter((p) => u[p.clave]);
            const baja = u.activo === false;
            return (
              <button key={u.id} type="button" onClick={() => setEditar(u)}
                className="w-full text-left px-4 py-3 lg:grid lg:grid-cols-[minmax(0,2.2fr)_150px_minmax(0,2fr)_170px_24px] lg:gap-4 lg:items-center hover:bg-surface-2/50 active:bg-surface-2/60 transition-colors">
                <span className="flex items-center gap-3 min-w-0">
                  <span className={baja ? 'opacity-50' : ''}><AvatarTecnico id={u.id} nombre={u.full_name} size={40} indice={i} /></span>
                  <span className="min-w-0 flex-1">
                    <span className={`block font-display font-bold text-[16.5px] leading-tight tracking-wide truncate ${baja ? 'text-muted' : ''}`}>{u.full_name}</span>
                    <span className="block text-[12.5px] text-muted truncate">{u.email || 'Sin correo'}</span>
                  </span>
                  <ChevronRight size={18} className="text-faint shrink-0 lg:hidden" />
                </span>
                <span className="mt-2 lg:mt-0 flex flex-wrap items-center gap-1.5 lg:contents">
                  <span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-semibold ${u.role === 'supervisor' ? 'bg-teal/12 text-teal' : 'bg-surface-2 border border-line text-ink/80'}`}>
                      {u.role === 'supervisor' ? <ShieldCheck size={12} /> : <Wrench size={12} />}
                      {u.role === 'supervisor' ? 'Supervisión' : 'Personal técnico'}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1 min-w-0">
                    {permisos.length === 0 && <span className="text-[12px] text-faint hidden lg:inline">Sin permisos extra</span>}
                    {permisos.map((p) => (
                      <span key={p.clave} title={p.nombre} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-2 border border-line text-[11px] font-medium text-ink/75">
                        <p.Icono size={11} /> {p.nombre.replace('Administrar ', '').replace('Firmar revisión de ', 'Firma ').replace('Aprobar ', '').replace('Autorizar solicitudes de personal', 'Solicitudes')}
                      </span>
                    ))}
                  </span>
                  <span className="text-[12px] text-muted lg:block">
                    {baja ? <span className="text-red font-semibold">Dada de baja</span> : hace(u.ultimo_acceso, ahora)}
                  </span>
                </span>
                <ChevronRight size={18} className="text-faint hidden lg:block" />
              </button>
            );
          })}
        </div>
      )}

      {editar && (
        <EditorUsuario
          usuario={editar === 'nuevo' ? null : editar}
          onClose={() => setEditar(null)}
          onListo={alTerminar}
        />
      )}
      {credencial && <Credencial c={credencial} onClose={() => setCredencial(null)} />}
    </div>
  );
}

function EditorUsuario({
  usuario, onClose, onListo,
}: {
  usuario: Usuario | null;
  onClose: () => void;
  onListo: (c?: { nombre: string; email: string; password: string; nueva: boolean }) => void;
}) {
  const nuevo = !usuario;
  const [nombre, setNombre] = useState(usuario?.full_name || '');
  const [email, setEmail] = useState(usuario?.email || '');
  const [telefono, setTelefono] = useState(usuario?.telefono || '');
  const [rol, setRol] = useState<Rol>(usuario?.role || 'tecnico');
  const [permisos, setPermisos] = useState<Record<ClavePermiso, boolean>>(
    () => Object.fromEntries(PERMISOS.map((p) => [p.clave, !!usuario?.[p.clave]])) as Record<ClavePermiso, boolean>,
  );
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historial, setHistorial] = useState<string[] | null>(null);
  const [confirmar, setConfirmar] = useState<'baja' | 'eliminar' | 'restablecer' | null>(null);
  const baja = usuario?.activo === false;
  const protegida = !!usuario?.protegida;

  async function ejecutar(f: () => Promise<void>) {
    setOcupado(true);
    setError(null);
    setHistorial(null);
    try { await f(); } catch (e: any) { setError(e.message); if (e.historial) setHistorial(e.historial); setOcupado(false); setConfirmar(null); }
  }

  const guardar = () => ejecutar(async () => {
    if (nombre.trim().length < 3) throw new Error('Escribe el nombre completo.');
    if (!email.trim()) throw new Error('Escribe el correo con el que va a entrar.');
    if (nuevo) {
      const d = await api('/api/usuarios', { method: 'POST', body: JSON.stringify({ full_name: nombre, email, telefono, role: rol, permisos }) });
      showToast('Usuario dado de alta', 'success');
      onListo({ nombre: nombre.trim(), email: d.email, password: d.password, nueva: true });
    } else {
      await api(`/api/usuarios/${usuario.id}`, { method: 'PATCH', body: JSON.stringify({ full_name: nombre, email, telefono, role: rol, permisos }) });
      showToast('Cambios guardados', 'success');
      onListo();
    }
  });

  const cambiarEstado = (activo: boolean) => ejecutar(async () => {
    await api(`/api/usuarios/${usuario!.id}`, { method: 'PATCH', body: JSON.stringify({ activo }) });
    showToast(activo ? 'Cuenta reactivada' : 'Cuenta dada de baja', 'success');
    onListo();
  });

  const restablecer = () => ejecutar(async () => {
    const d = await api(`/api/usuarios/${usuario!.id}`, { method: 'PATCH', body: JSON.stringify({ restablecer: true }) });
    onListo({ nombre: usuario!.full_name, email: usuario!.email || '', password: d.password, nueva: false });
  });

  const eliminar = () => ejecutar(async () => {
    await api(`/api/usuarios/${usuario!.id}`, { method: 'DELETE' });
    showToast('Cuenta eliminada', 'success');
    onListo();
  });

  return (
    <ModalOverlay onClose={() => !ocupado && onClose()}>
      <div className="bg-surface border border-line rounded-3xl w-full max-w-xl max-h-[92vh] overflow-y-auto shadow-diffuse">
        <div className="sticky top-0 z-10 bg-surface border-b border-line px-5 py-4 flex items-center gap-3">
          {usuario ? <AvatarTecnico id={usuario.id} nombre={usuario.full_name} size={42} /> : (
            <span className="w-[42px] h-[42px] rounded-full bg-teal/12 text-teal flex items-center justify-center"><UserRound size={20} /></span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="font-display font-bold text-[20px] tracking-wide leading-tight truncate">{nuevo ? 'Nuevo usuario' : usuario.full_name}</h2>
            <p className="text-[12.5px] text-muted truncate">
              {nuevo ? 'Recibirá una contraseña temporal para su primer acceso' : baja ? 'Cuenta dada de baja' : 'Edita sus datos, rol y permisos'}
            </p>
          </div>
          <button onClick={onClose} disabled={ocupado} aria-label="Cerrar" className="w-10 h-10 -mr-2 flex items-center justify-center text-muted shrink-0"><X size={19} strokeWidth={2.5} /></button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-6">
          {protegida && (
            <p className="rounded-xl bg-amber/12 border border-amber/30 px-3.5 py-2.5 text-[12.5px] text-amber font-medium">
              Es una cuenta de ejemplo del demo: puedes cambiar su nombre, teléfono y permisos, pero no su rol, correo, contraseña ni darla de baja.
            </p>
          )}

          {/* Datos */}
          <section>
            <p className="font-display font-bold text-[16px] tracking-wide mb-3">Datos</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={labelCls}>Nombre completo</label>
                <input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Como debe aparecer en los reportes firmados" autoFocus={nuevo} />
              </div>
              <div>
                <label className={labelCls}>Correo (con el que entra)</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                  <input className={`${inputCls} pl-10`} type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@empresa.com" disabled={protegida} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Teléfono (opcional)</label>
                <div className="relative">
                  <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                  <input className={`${inputCls} pl-10`} type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="10 dígitos" />
                </div>
              </div>
            </div>
          </section>

          {/* Rol */}
          <section>
            <p className="font-display font-bold text-[16px] tracking-wide mb-3">Rol</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ROLES.map((r) => {
                const sel = rol === r.valor;
                return (
                  <button key={r.valor} type="button" onClick={() => setRol(r.valor)} disabled={protegida} aria-pressed={sel}
                    className={`text-left rounded-2xl border p-3.5 transition-colors disabled:opacity-60 ${sel ? 'border-teal bg-teal/10' : 'border-line bg-surface-2/50 hover:border-line-strong'}`}>
                    <span className="flex items-center gap-2 mb-1">
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${sel ? 'bg-teal text-inkOnAccent' : 'bg-surface-2 text-muted'}`}><r.Icono size={16} /></span>
                      <span className={`text-[14.5px] font-semibold flex-1 ${sel ? 'text-teal' : ''}`}>{r.nombre}</span>
                      {sel && <Check size={17} strokeWidth={2.8} className="text-teal" />}
                    </span>
                    <span className="block text-[12.5px] text-muted leading-snug">{r.detalle}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Permisos */}
          <section>
            <p className="font-display font-bold text-[16px] tracking-wide">Permisos</p>
            <p className="text-[12.5px] text-muted mb-3">Además de lo que ya permite su rol.</p>
            <div className="rounded-2xl border border-line divide-y divide-line overflow-hidden">
              {PERMISOS.map((p) => {
                const on = permisos[p.clave];
                return (
                  <button key={p.clave} type="button" role="switch" aria-checked={on}
                    onClick={() => setPermisos((x) => ({ ...x, [p.clave]: !x[p.clave] }))}
                    className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-surface-2/50 transition-colors">
                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${on ? 'bg-teal/15 text-teal' : 'bg-surface-2 text-muted'}`}><p.Icono size={17} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold">{p.nombre}</span>
                      <span className="block text-[12.5px] text-muted leading-snug">{p.detalle}</span>
                    </span>
                    <span className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${on ? 'bg-teal' : 'bg-surface-2 border border-line-strong'}`}>
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {error && (
            <div className="rounded-xl bg-red/10 border border-red/30 px-3.5 py-3">
              <p className="text-[13.5px] text-red font-semibold">{error}</p>
              {historial && <p className="text-[12.5px] text-ink/75 mt-1">Tiene: {historial.join(', ')}.</p>}
            </div>
          )}

          <button type="button" onClick={guardar} disabled={ocupado}
            className="w-full min-h-[50px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[15px] shadow-glow-teal disabled:opacity-50 active:scale-[0.98] transition-transform">
            {ocupado && !confirmar ? 'Guardando…' : nuevo ? 'Dar de alta' : 'Guardar cambios'}
          </button>

          {/* Acciones de la cuenta */}
          {!nuevo && !protegida && (
            <section className="pt-5 border-t border-line">
              <p className="font-display font-bold text-[16px] tracking-wide mb-3">Cuenta</p>
              {confirmar ? (
                <div className={`rounded-2xl border p-4 ${confirmar === 'restablecer' ? 'border-amber/40 bg-amber/10' : 'border-red/30 bg-red/10'}`}>
                  <p className="text-[13.5px] text-ink/90 mb-3 leading-relaxed">
                    {confirmar === 'restablecer' && 'Se genera una contraseña temporal nueva. La anterior deja de servir y al entrar se le pedirá poner una propia.'}
                    {confirmar === 'baja' && 'Deja de poder entrar a la app. Sus reportes, servicios y firmas se conservan, y la puedes reactivar cuando quieras.'}
                    {confirmar === 'eliminar' && 'Se borra la cuenta por completo. Solo es posible si nunca hizo nada en la app; si tiene historial, se te avisará para darla de baja.'}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setConfirmar(null)} disabled={ocupado} className="min-h-[44px] rounded-xl border border-line bg-surface text-[13.5px] font-semibold">Cancelar</button>
                    <button type="button" disabled={ocupado}
                      onClick={() => (confirmar === 'restablecer' ? restablecer() : confirmar === 'baja' ? cambiarEstado(false) : eliminar())}
                      className={`min-h-[44px] rounded-xl text-[13.5px] font-semibold ${confirmar === 'restablecer' ? 'bg-amber text-inkOnAccent' : 'bg-red text-white'}`}>
                      {ocupado ? 'Un momento…' : confirmar === 'restablecer' ? 'Restablecer' : confirmar === 'baja' ? 'Dar de baja' : 'Eliminar'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button type="button" onClick={() => setConfirmar('restablecer')} disabled={ocupado}
                    className="min-h-[46px] rounded-xl border border-line bg-surface-2/60 text-[13px] font-semibold flex items-center justify-center gap-1.5 hover:border-line-strong">
                    <KeyRound size={15} /> Restablecer contraseña
                  </button>
                  {baja ? (
                    <button type="button" onClick={() => cambiarEstado(true)} disabled={ocupado}
                      className="min-h-[46px] rounded-xl border border-teal/40 text-teal text-[13px] font-semibold flex items-center justify-center gap-1.5 hover:bg-teal/8">
                      <UserCheck size={15} /> Reactivar
                    </button>
                  ) : (
                    <button type="button" onClick={() => setConfirmar('baja')} disabled={ocupado}
                      className="min-h-[46px] rounded-xl border border-line bg-surface-2/60 text-[13px] font-semibold flex items-center justify-center gap-1.5 hover:border-line-strong">
                      <UserMinus size={15} /> Dar de baja
                    </button>
                  )}
                  <button type="button" onClick={() => setConfirmar('eliminar')} disabled={ocupado}
                    className="min-h-[46px] rounded-xl border border-red/30 text-red text-[13px] font-semibold flex items-center justify-center gap-1.5 hover:bg-red/8">
                    <Trash2 size={15} /> Eliminar
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}

// La contraseña temporal se muestra una sola vez: después ya no se puede ver.
function Credencial({ c, onClose }: { c: { nombre: string; email: string; password: string; nueva: boolean }; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const texto = `Acceso a la app\nCorreo: ${c.email}\nContraseña temporal: ${c.password}\nAl entrar se te pedirá poner una contraseña propia.`;
  async function copiar() {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); showToast('Datos copiados', 'success'); } catch { showToast('No se pudo copiar; anótalos', 'error'); }
  }
  return (
    <ModalOverlay onClose={() => {}}>
      <div className="bg-surface border border-line rounded-3xl w-full max-w-md p-6 shadow-diffuse">
        <span className="w-12 h-12 rounded-2xl bg-teal/12 text-teal flex items-center justify-center mb-3"><KeyRound size={22} /></span>
        <h2 className="font-display font-bold text-[21px] tracking-wide leading-tight">{c.nueva ? 'Cuenta creada' : 'Contraseña restablecida'}</h2>
        <p className="text-[13.5px] text-muted mt-1 mb-4">
          Comparte estos datos con {c.nombre}. Es la única vez que se muestra la contraseña; al entrar se le pedirá poner una propia.
        </p>
        <div className="rounded-2xl bg-surface-2 border border-line divide-y divide-line mb-4">
          <div className="px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Correo</p>
            <p className="text-[15px] font-medium break-all">{c.email}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Contraseña temporal</p>
            <p className="font-mono text-[20px] font-semibold tracking-wider select-all">{c.password}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={copiar} className="min-h-[48px] rounded-2xl border border-line bg-surface-2/60 text-[14px] font-semibold flex items-center justify-center gap-2">
            {copiado ? <Check size={16} className="text-teal" /> : <Copy size={16} />} {copiado ? 'Copiado' : 'Copiar datos'}
          </button>
          <button type="button" onClick={onClose} className="min-h-[48px] rounded-2xl bg-teal text-inkOnAccent text-[14px] font-semibold">Ya los anoté</button>
        </div>
      </div>
    </ModalOverlay>
  );
}
