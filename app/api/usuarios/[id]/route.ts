import { NextRequest, NextResponse } from 'next/server';
import {
  autorizarGestor, bitacora, contrasenaTemporal, correoValido, ErrorUsuarios, esCuentaDemo, historialDe, PERMISOS, respuestaError,
} from '@/lib/usuariosAdmin';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function cuenta(admin: Awaited<ReturnType<typeof autorizarGestor>>['admin'], id: string) {
  if (!UUID.test(id)) throw new ErrorUsuarios(400, 'Usuario no válido');
  const [{ data: perfil }, { data: auth }] = await Promise.all([
    admin.from('profiles').select('id, full_name, role, activo, can_manage_usuarios').eq('id', id).maybeSingle(),
    admin.auth.admin.getUserById(id),
  ]);
  if (!perfil) throw new ErrorUsuarios(404, 'Esa cuenta ya no existe');
  return { perfil: perfil as any, email: auth?.user?.email || null };
}

// Editar: nombre, teléfono, rol, permisos, estado, correo o contraseña.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const { supabase, admin, yo } = await autorizarGestor();
    const { perfil, email: emailActual } = await cuenta(admin, id);
    const body = await req.json().catch(() => ({}));
    const esYo = id === yo.id;
    const protegida = esCuentaDemo(emailActual);
    const hechos: string[] = [];
    const cambios: Record<string, unknown> = {};

    if (body.full_name !== undefined) {
      const nombre = String(body.full_name).trim().replace(/\s+/g, ' ');
      if (nombre.length < 3) throw new ErrorUsuarios(400, 'El nombre debe tener al menos 3 letras.');
      if (nombre !== perfil.full_name) { cambios.full_name = nombre; hechos.push(`nombre → ${nombre}`); }
    }
    if (body.telefono !== undefined) {
      const tel = String(body.telefono || '').trim();
      if (tel && tel.replace(/\D/g, '').length < 10) throw new ErrorUsuarios(400, 'Al teléfono le faltan dígitos.');
      cambios.telefono = tel || null;
    }
    if (body.role !== undefined && body.role !== perfil.role) {
      if (body.role !== 'supervisor' && body.role !== 'tecnico') throw new ErrorUsuarios(400, 'Rol no válido');
      if (esYo) throw new ErrorUsuarios(400, 'No puedes cambiar tu propio rol. Pídeselo a otra persona con permiso.');
      if (protegida) throw new ErrorUsuarios(403, 'En el demo no se cambia el rol de las cuentas de ejemplo.');
      cambios.role = body.role;
      hechos.push(`rol → ${body.role === 'supervisor' ? 'supervisión' : 'personal técnico'}`);
    }
    if (body.permisos && typeof body.permisos === 'object') {
      for (const p of PERMISOS) {
        if (typeof body.permisos[p] !== 'boolean') continue;
        if (p === 'can_manage_usuarios' && esYo && body.permisos[p] === false) {
          throw new ErrorUsuarios(400, 'No puedes quitarte a ti el permiso de administrar usuarios.');
        }
        cambios[p] = body.permisos[p];
      }
      hechos.push('permisos');
    }
    if (typeof body.activo === 'boolean' && body.activo !== (perfil.activo !== false)) {
      if (esYo) throw new ErrorUsuarios(400, 'No puedes darte de baja a ti.');
      if (protegida) throw new ErrorUsuarios(403, 'En el demo no se dan de baja las cuentas de ejemplo.');
      cambios.activo = body.activo;
      hechos.push(body.activo ? 'reactivó la cuenta' : 'dio de baja la cuenta');
    }

    if (Object.keys(cambios).length > 0) {
      const { error } = await admin.from('profiles').update(cambios).eq('id', id);
      // Los candados de la base (último gestor, límite del plan) responden con su propio mensaje.
      if (error) throw new ErrorUsuarios(409, error.message);
    }

    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase();
      if (email !== (emailActual || '').toLowerCase()) {
        if (!correoValido(email)) throw new ErrorUsuarios(400, 'El correo no es válido.');
        if (protegida) throw new ErrorUsuarios(403, 'En el demo no se cambia el correo de las cuentas de ejemplo.');
        const { error } = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
        if (error) throw new ErrorUsuarios(409, /already|registered|exists/i.test(error.message) ? 'Ya existe una cuenta con ese correo.' : error.message);
        hechos.push('correo');
      }
    }

    let password: string | undefined;
    if (body.restablecer === true) {
      if (protegida) throw new ErrorUsuarios(403, 'En el demo no se cambia la contraseña de las cuentas de ejemplo.');
      password = contrasenaTemporal();
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) throw new ErrorUsuarios(500, error.message);
      // Al entrar se le pedirá poner una contraseña propia.
      await admin.from('profiles').update({ credenciales_actualizadas: false }).eq('id', id);
      hechos.push('restableció la contraseña');
    }

    if (hechos.length > 0) {
      await bitacora(supabase, yo.id, 'edito_usuario', id, `${cambios.full_name || perfil.full_name}: ${hechos.join(', ')}`);
    }
    return NextResponse.json({ success: true, password });
  } catch (e) {
    const r = respuestaError(e);
    return NextResponse.json({ error: r.mensaje }, { status: r.estado });
  }
}

// Eliminar: solo cuentas sin historial (creadas por error). Con historial
// se dan de baja: borrar se llevaría bitácoras y asignaciones.
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const { supabase, admin, yo } = await autorizarGestor();
    const { perfil, email } = await cuenta(admin, id);
    if (id === yo.id) throw new ErrorUsuarios(400, 'No puedes eliminar tu propia cuenta.');
    if (esCuentaDemo(email)) throw new ErrorUsuarios(403, 'En el demo no se eliminan las cuentas de ejemplo.');
    if (perfil.can_manage_usuarios) {
      const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true })
        .eq('can_manage_usuarios', true).eq('activo', true).neq('id', id);
      if (!count) throw new ErrorUsuarios(409, 'Es la única cuenta que administra usuarios: no se puede eliminar.');
    }

    const historial = await historialDe(admin, id);
    if (historial.length > 0) {
      return NextResponse.json({
        error: 'Esta cuenta tiene historial y no se puede eliminar. Dala de baja: deja de tener acceso y su trabajo se conserva.',
        historial,
      }, { status: 409 });
    }

    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new ErrorUsuarios(409, error.message);
    await bitacora(supabase, yo.id, 'elimino_usuario', null, `Eliminó la cuenta de ${perfil.full_name} (sin historial)`);
    return NextResponse.json({ success: true });
  } catch (e) {
    const r = respuestaError(e);
    return NextResponse.json({ error: r.mensaje }, { status: r.estado });
  }
}
