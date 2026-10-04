'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useUsersAdmin } from '@/lib/useProfileMutation';
import { usePlan } from '@/lib/planes';
import { PLANES } from '@/lib/planesDatos';
import { showToast } from '@/components/Toast';
import { Edit2, Save, X, ChevronDown, UserMinus, UserCheck, Users } from 'lucide-react';

interface User {
  id: string;
  full_name: string;
  role: string;
  telefono?: string;
  activo?: boolean;
  can_manage_usuarios?: boolean;
  can_manage_almacen?: boolean;
  can_manage_billing?: boolean;
  can_approve_review?: boolean;
  can_approve_cotizacion?: boolean;
  can_approve_personal?: boolean;
  created_at: string;
}

export default function AdminUsersSection({ initialUsers = [] }: { initialUsers?: User[] }) {
  const [usuarios, setUsuarios] = useState<User[]>(initialUsers);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState('');
  const [abiertoId, setAbiertoId] = useState<string | null>(null);

  const { updateUserName, setUsuarioActivo, setUsuarioPermiso, loading: guardando } = useUsersAdmin();
  const plan = usePlan();

  const iniciarEdicion = (u: User) => {
    setAbiertoId(u.id);
    setEditandoId(u.id);
    setNombreEditado(u.full_name);
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setNombreEditado('');
  };

  const guardarNombre = async (u: User) => {
    const nombre = nombreEditado.trim();
    if (nombre === u.full_name) return cancelarEdicion();
    if (nombre.length < 3) {
      showToast('El nombre debe tener al menos 3 letras', 'error');
      return;
    }

    const result = await updateUserName(u.id, nombre);
    if (result.success) {
      setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, full_name: nombre } : x)));
      showToast('Nombre actualizado', 'success');
      cancelarEdicion();
    } else {
      showToast(result.error || 'No se pudo actualizar', 'error');
    }
  };

  const alternarPermiso = async (
    u: User,
    campo: 'can_manage_almacen' | 'can_manage_billing' | 'can_approve_review' | 'can_approve_cotizacion' | 'can_approve_personal'
  ) => {
    const valorNuevo = !u[campo];
    setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, [campo]: valorNuevo } : x)));

    const result = await setUsuarioPermiso(u.id, campo, valorNuevo);
    if (result.success) {
      showToast(valorNuevo ? 'Permiso otorgado' : 'Permiso retirado', 'success');
    } else {
      setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, [campo]: !valorNuevo } : x)));
      showToast(result.error || 'No se pudo cambiar', 'error');
    }
  };

  const cambiarBaja = async (u: User) => {
    const activar = u.activo === false;

    if (
      !activar &&
      !confirm(
        `¿Dar de baja a ${u.full_name}? Dejará de aparecer para asignar servicios. Sus reportes firmados se conservan.`
      )
    ) {
      return;
    }

    const result = await setUsuarioActivo(u.id, activar);
    if (result.success) {
      setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, activo: activar } : x)));
      showToast(activar ? 'Usuario reactivado' : 'Usuario dado de baja', 'success');
    } else {
      showToast(result.error || 'No se pudo cambiar', 'error');
    }
  };

  return (
    <div className="rounded-2xl bg-surface border border-line p-5">
      <div className="flex items-center gap-2 mb-1.5">
        <Users size={19} strokeWidth={2.4} className="text-teal shrink-0" />
        <h2 className="font-display font-bold text-[19px] tracking-wide">Usuarios</h2>
      </div>
      <p className="text-[13px] text-muted mb-3">
        El nombre que se ponga aquí es el que queda en los reportes firmados.
      </p>
      {/* Plan de la empresa: cuántos usuarios activos permite. Se cuenta
          aquí (no del plan guardado) para que refleje altas y bajas al momento. */}
      <div className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-surface-2 border border-line px-3.5 py-2.5 text-[13px]">
        <span>
          Plan <b className="text-teal">{PLANES[plan.plan]?.nombre || plan.plan}</b>
          {plan.es_supervisor && (
            <Link href="/suscripcion" className="ml-2 text-muted underline underline-offset-2">Ver</Link>
          )}
        </span>
        <span className="text-muted tabular-nums">
          {usuarios.filter((u) => u.activo !== false).length}
          {plan.limite_usuarios ? ` de ${plan.limite_usuarios}` : ''} usuarios activos
        </span>
      </div>

      {usuarios.length === 0 ? (
        <p className="text-[15px] text-muted py-6 text-center">No hay usuarios registrados.</p>
      ) : (
        <div className="space-y-2">
          {usuarios.map((u) => {
            const abierto = abiertoId === u.id;
            const editando = editandoId === u.id;
            const dadoDeBaja = u.activo === false;

            return (
              <div key={u.id} className="rounded-xl bg-surface-2 border border-line overflow-hidden">
                <button
                  onClick={() => setAbiertoId(abierto ? null : u.id)}
                  className="w-full min-h-[56px] px-4 py-3 flex items-center justify-between gap-3 text-left active:scale-[0.99] transition-transform"
                >
                  <div className="min-w-0">
                    <p className={`font-display font-semibold text-[15.5px] tracking-wide truncate ${dadoDeBaja ? 'text-muted' : 'text-ink'}`}>
                      {u.full_name}
                    </p>
                    <p className="text-[12.5px] text-muted mt-0.5">
                      {u.role === 'supervisor' ? 'Supervisión' : 'Personal técnico'}
                      {dadoDeBaja && ' · dado de baja'}
                    </p>
                  </div>
                  <ChevronDown
                    size={18}
                    strokeWidth={2.4}
                    className={`text-muted shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`}
                  />
                </button>

                {abierto && (
                  <div className="px-4 pb-4 pt-1 border-t border-line space-y-3.5">
                    {editando ? (
                      <div>
                        <label className="block text-[11px] uppercase tracking-wider text-faint mb-2">
                          Nombre
                        </label>
                        <input
                          type="text"
                          value={nombreEditado}
                          onChange={(e) => setNombreEditado(e.target.value)}
                          autoFocus
                          disabled={guardando}
                          className="w-full min-h-[52px] px-4 rounded-xl bg-surface border border-teal text-[16px] text-ink outline-none"
                        />
                      </div>
                    ) : (
                      <div className="text-[14px]">
                        <p className="text-[11px] uppercase tracking-wider text-faint mb-1">Teléfono</p>
                        <p className={u.telefono ? 'text-ink font-mono' : 'text-faint'}>
                          {u.telefono || 'Sin registrar'}
                        </p>
                      </div>
                    )}

                    {!editando && (
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-faint mb-2">Permisos</p>
                        <div className="flex flex-col gap-2">
                          <label className="flex items-center gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!u.can_manage_almacen}
                              onChange={() => alternarPermiso(u, 'can_manage_almacen')}
                              disabled={guardando}
                              className="w-5 h-5 accent-teal shrink-0"
                            />
                            <span className="text-[14px]">Almacén</span>
                          </label>
                          <label className="flex items-center gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!u.can_manage_billing}
                              onChange={() => alternarPermiso(u, 'can_manage_billing')}
                              disabled={guardando}
                              className="w-5 h-5 accent-teal shrink-0"
                            />
                            <span className="text-[14px]">Facturación</span>
                          </label>
                          <label className="flex items-center gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!u.can_approve_review}
                              onChange={() => alternarPermiso(u, 'can_approve_review')}
                              disabled={guardando}
                              className="w-5 h-5 accent-teal shrink-0"
                            />
                            <span className="text-[14px]">Firma de reporte</span>
                          </label>
                          <label className="flex items-center gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!u.can_approve_cotizacion}
                              onChange={() => alternarPermiso(u, 'can_approve_cotizacion')}
                              disabled={guardando}
                              className="w-5 h-5 accent-teal shrink-0"
                            />
                            <span className="text-[14px]">Firma de cotización</span>
                          </label>
                          <label className="flex items-center gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!u.can_approve_personal}
                              onChange={() => alternarPermiso(u, 'can_approve_personal')}
                              disabled={guardando}
                              className="w-5 h-5 accent-teal shrink-0"
                            />
                            <span className="text-[14px]">Autoriza horas extra, vacaciones y permisos</span>
                          </label>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      {editando ? (
                        <>
                          <button
                            onClick={() => guardarNombre(u)}
                            disabled={guardando}
                            className="flex-1 min-h-[48px] rounded-xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] tracking-wide flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-50"
                          >
                            <Save size={17} strokeWidth={2.5} />
                            Guardar
                          </button>
                          <button
                            onClick={cancelarEdicion}
                            disabled={guardando}
                            className="min-w-[48px] min-h-[48px] rounded-xl bg-surface border border-line text-muted flex items-center justify-center active:scale-95 transition-transform"
                            aria-label="Cancelar"
                          >
                            <X size={18} strokeWidth={2.5} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => iniciarEdicion(u)}
                            disabled={guardando}
                            className="flex-1 min-h-[48px] rounded-xl bg-surface border border-line text-ink font-display font-semibold text-[15px] tracking-wide flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
                          >
                            <Edit2 size={16} strokeWidth={2.5} />
                            Editar nombre
                          </button>
                          <button
                            onClick={() => cambiarBaja(u)}
                            disabled={guardando}
                            className={`min-w-[48px] min-h-[48px] rounded-xl flex items-center justify-center active:scale-95 transition-transform ${
                              dadoDeBaja ? 'bg-teal/15 text-teal' : 'bg-red/12 text-red'
                            }`}
                            aria-label={dadoDeBaja ? 'Reactivar' : 'Dar de baja'}
                          >
                            {dadoDeBaja ? (
                              <UserCheck size={18} strokeWidth={2.5} />
                            ) : (
                              <UserMinus size={18} strokeWidth={2.5} />
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
