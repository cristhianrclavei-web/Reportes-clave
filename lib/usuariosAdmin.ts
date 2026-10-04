import { randomInt } from 'node:crypto';
import { createClient } from '@/lib/supabaseServer';
import { createAdminClient, hayClienteAdmin } from '@/lib/supabaseAdmin';

// Administración de usuarios (solo servidor). Dar de alta, cambiar correo o
// contraseña y eliminar cuentas necesita la llave secreta de Supabase, así
// que todo pasa por /api/usuarios. Cada petición se autoriza con la SESIÓN
// de quien la hace: debe tener una cuenta activa con permiso de administrar
// usuarios. La llave secreta nunca decide quién puede; solo ejecuta.

export const PERMISOS = [
  'can_manage_usuarios', 'can_manage_almacen', 'can_manage_billing',
  'can_approve_review', 'can_approve_cotizacion', 'can_approve_personal',
] as const;
export type Permiso = (typeof PERMISOS)[number];

export const CAMPOS_PERFIL =
  'id, full_name, role, telefono, activo, puesto, created_at, credenciales_actualizadas, ' + PERMISOS.join(', ');

// Demo público: las cuentas de ejemplo son compartidas. No se les cambia
// correo, contraseña, rol ni estado, y los visitantes pueden crear pocas
// cuentas de prueba (el reinicio nocturno las borra).
export const ES_DEMO = process.env.NEXT_PUBLIC_DEMO === '1';
export const DOMINIO_DEMO = '@demo.servitec.test';
export const MAX_CUENTAS_VISITANTE = 3;
export const esCuentaDemo = (email: string | null | undefined) => ES_DEMO && !!email && email.toLowerCase().endsWith(DOMINIO_DEMO);

export class ErrorUsuarios extends Error {
  constructor(public estado: number, mensaje: string) { super(mensaje); }
}

// Quien llama debe ser gestor de usuarios con cuenta activa.
export async function autorizarGestor() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ErrorUsuarios(401, 'No autenticado');
  const { data: yo } = await supabase
    .from('profiles').select('id, full_name, activo, can_manage_usuarios').eq('id', user.id).single();
  if (!yo || yo.activo === false || yo.can_manage_usuarios !== true) {
    throw new ErrorUsuarios(403, 'No tienes permiso para administrar usuarios');
  }
  if (!hayClienteAdmin()) {
    throw new ErrorUsuarios(503, 'Falta configurar SUPABASE_SECRET_KEY en el servidor para administrar usuarios.');
  }
  return { supabase, admin: createAdminClient(), yo: { id: user.id, nombre: yo.full_name as string } };
}

// Contraseña temporal legible (sin 0/O, 1/l/I): la dicta el supervisor y la
// persona la cambia al entrar por primera vez.
export function contrasenaTemporal(): string {
  const letras = 'abcdefghjkmnpqrstuvwxyz';
  const mayus = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const nums = '23456789';
  const de = (s: string, n: number) => Array.from({ length: n }, () => s[randomInt(s.length)]).join('');
  return `${de(mayus, 1)}${de(letras, 4)}-${de(nums, 4)}`;
}

export function correoValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 120;
}

// Lo que impide eliminar una cuenta: su historial. Borrarla se llevaría en
// cascada su bitácora y sus asignaciones, y dejaría reportes sin autor.
const HISTORIAL: [tabla: string, columna: string, etiqueta: string][] = [
  ['reports', 'created_by', 'reportes'],
  ['servicio_tecnicos', 'tecnico_id', 'servicios asignados'],
  ['servicios_programados', 'creado_por', 'servicios programados'],
  ['actividades', 'created_by', 'actividades de bitácora'],
  ['cotizaciones', 'created_by', 'cotizaciones'],
  ['levantamientos', 'created_by', 'levantamientos'],
  ['almacen_vales', 'tecnico_id', 'vales de almacén'],
  ['almacen_movimientos', 'creado_por', 'movimientos de almacén'],
  ['solicitudes_personal', 'solicitante_id', 'solicitudes de personal'],
  ['clientes', 'created_by', 'clientes dados de alta'],
  ['auditoria_global', 'actor_id', 'acciones en Actividad'],
];

export async function historialDe(admin: ReturnType<typeof createAdminClient>, id: string): Promise<string[]> {
  const cuentas = await Promise.all(HISTORIAL.map(async ([tabla, col, etiqueta]) => {
    const { count, error } = await admin.from(tabla).select('*', { count: 'exact', head: true }).eq(col, id);
    // Una tabla que no exista en esta instalación no cuenta como historial.
    return error ? null : (count || 0) > 0 ? `${count} ${etiqueta}` : null;
  }));
  return cuentas.filter((x): x is string => !!x);
}

// Queda en Actividad quién hizo qué con las cuentas. Si la base aún no
// acepta la entidad «usuario» (falta patch_usuarios.sql), no se interrumpe.
export async function bitacora(supabase: Awaited<ReturnType<typeof createClient>>, actorId: string, accion: string, usuarioId: string | null, detalle: string) {
  try {
    await supabase.from('auditoria_global').insert({ actor_id: actorId, accion, entidad: 'usuario', entidad_id: usuarioId, detalle });
  } catch { /* informativo */ }
}

export function respuestaError(e: unknown): { estado: number; mensaje: string } {
  if (e instanceof ErrorUsuarios) return { estado: e.estado, mensaje: e.message };
  const m = (e as any)?.message || 'Error inesperado';
  return { estado: 500, mensaje: m };
}
