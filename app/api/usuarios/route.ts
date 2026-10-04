import { NextRequest, NextResponse } from 'next/server';
import {
  autorizarGestor, bitacora, CAMPOS_PERFIL, contrasenaTemporal, correoValido, ErrorUsuarios, ES_DEMO, DOMINIO_DEMO,
  MAX_CUENTAS_VISITANTE, PERMISOS, respuestaError,
} from '@/lib/usuariosAdmin';

export const dynamic = 'force-dynamic';

// Lista de cuentas con su correo y último acceso (datos de autenticación
// que la sesión normal no puede leer).
export async function GET() {
  try {
    const { admin } = await autorizarGestor();
    const [{ data: perfiles, error }, { data: auth, error: eAuth }] = await Promise.all([
      admin.from('profiles').select(CAMPOS_PERFIL).order('full_name'),
      admin.auth.admin.listUsers({ perPage: 1000 }),
    ]);
    if (error) throw new ErrorUsuarios(500, error.message);
    if (eAuth) throw new ErrorUsuarios(500, eAuth.message);
    const porId = new Map(auth.users.map((u) => [u.id, u]));
    const usuarios = ((perfiles as any[]) || []).map((p) => ({
      ...p,
      email: porId.get(p.id)?.email || null,
      ultimo_acceso: porId.get(p.id)?.last_sign_in_at || null,
      protegida: ES_DEMO && (porId.get(p.id)?.email || '').toLowerCase().endsWith(DOMINIO_DEMO),
    }));
    return NextResponse.json({ usuarios, demo: ES_DEMO });
  } catch (e) {
    const r = respuestaError(e);
    return NextResponse.json({ error: r.mensaje }, { status: r.estado });
  }
}

// Alta: crea la cuenta con una contraseña temporal que la persona cambia al
// entrar por primera vez.
export async function POST(req: NextRequest) {
  try {
    const { supabase, admin, yo } = await autorizarGestor();
    const body = await req.json().catch(() => ({}));
    const nombre = String(body.full_name || '').trim().replace(/\s+/g, ' ');
    const email = String(body.email || '').trim().toLowerCase();
    const role = body.role === 'supervisor' ? 'supervisor' : 'tecnico';
    const telefono = String(body.telefono || '').trim();

    if (nombre.length < 3) throw new ErrorUsuarios(400, 'Escribe el nombre completo.');
    if (!correoValido(email)) throw new ErrorUsuarios(400, 'El correo no es válido.');
    if (telefono && telefono.replace(/\D/g, '').length < 10) throw new ErrorUsuarios(400, 'Al teléfono le faltan dígitos.');

    // Límite del plan: se avisa antes de crear, en vez de dejar la cuenta inactiva.
    const { data: plan } = await supabase.rpc('mi_plan');
    if (plan?.limite_usuarios && plan.usuarios_activos >= plan.limite_usuarios) {
      throw new ErrorUsuarios(409, `Tu paquete permite ${plan.limite_usuarios} usuarios activos y ya están ocupados. Da de baja a alguien o amplía el paquete.`);
    }

    if (ES_DEMO) {
      const { data: lista } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const visitantes = (lista?.users || []).filter((u) => !(u.email || '').toLowerCase().endsWith(DOMINIO_DEMO)).length;
      if (visitantes >= MAX_CUENTAS_VISITANTE) {
        throw new ErrorUsuarios(409, `En el demo se pueden crear hasta ${MAX_CUENTAS_VISITANTE} usuarios de prueba; se borran cada noche.`);
      }
    }

    const password = contrasenaTemporal();
    const { data: creado, error: eCrear } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: nombre, role },
    });
    if (eCrear || !creado?.user) {
      const m = eCrear?.message || '';
      throw new ErrorUsuarios(/already|registered|exists/i.test(m) ? 409 : 500,
        /already|registered|exists/i.test(m) ? 'Ya existe una cuenta con ese correo.' : m || 'No se pudo crear la cuenta.');
    }
    const id = creado.user.id;

    // El perfil lo crea el trigger de la base; aquí se completa.
    const cambios: Record<string, unknown> = { full_name: nombre, role, credenciales_actualizadas: false, es_cuenta_prueba: false };
    if (telefono) cambios.telefono = telefono;
    for (const p of PERMISOS) if (body.permisos && typeof body.permisos[p] === 'boolean') cambios[p] = body.permisos[p];
    const { data: perfil, error: ePerfil } = await admin.from('profiles').update(cambios).eq('id', id).select('id, activo').single();
    if (ePerfil || !perfil) {
      // Sin perfil la cuenta no sirve: se deshace el alta.
      await admin.auth.admin.deleteUser(id);
      throw new ErrorUsuarios(500, ePerfil?.message || 'No se pudo crear el perfil de la cuenta.');
    }

    await bitacora(supabase, yo.id, 'creo_usuario', id, `Dio de alta a ${nombre} (${role === 'supervisor' ? 'supervisión' : 'personal técnico'})`);
    return NextResponse.json({ id, email, password, activo: perfil.activo !== false });
  } catch (e) {
    const r = respuestaError(e);
    return NextResponse.json({ error: r.mensaje }, { status: r.estado });
  }
}
