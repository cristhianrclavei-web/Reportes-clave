import { createClient } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

// El permiso vive en la base, no en una lista de nombres aqui adentro.
// Ver supabase/patch_gestion_usuarios.sql
async function esGestor(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('can_manage_usuarios')
    .eq('id', userId)
    .single();

  return data?.can_manage_usuarios === true;
}

// Listar usuarios
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  if (!(await esGestor(supabase, user.id))) {
    return NextResponse.json({ error: 'No tiene permiso para gestionar usuarios' }, { status: 403 });
  }

  const { data: usuarios, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, telefono, activo, can_manage_usuarios, can_manage_almacen, can_manage_billing, can_approve_review, can_approve_cotizacion, created_at')
    .order('full_name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ usuarios });
}

// Editar nombre / activar / desactivar
export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  if (!(await esGestor(supabase, user.id))) {
    return NextResponse.json({ error: 'No tiene permiso para gestionar usuarios' }, { status: 403 });
  }

  const { userId, full_name, activo, can_manage_almacen, can_manage_billing, can_approve_review, can_approve_cotizacion } = await req.json();

  if (!userId) {
    return NextResponse.json({ error: 'Falta el usuario' }, { status: 400 });
  }

  const cambios: Record<string, any> = {};

  if (full_name !== undefined) {
    const nombre = String(full_name).trim();
    if (nombre.length < 3) {
      return NextResponse.json({ error: 'El nombre debe tener al menos 3 letras' }, { status: 400 });
    }
    cambios.full_name = nombre;
  }

  if (activo !== undefined) {
    cambios.activo = activo === true;
  }

  if (can_manage_almacen !== undefined) {
    cambios.can_manage_almacen = can_manage_almacen === true;
  }

  if (can_manage_billing !== undefined) {
    cambios.can_manage_billing = can_manage_billing === true;
  }

  if (can_approve_review !== undefined) {
    cambios.can_approve_review = can_approve_review === true;
  }

  if (can_approve_cotizacion !== undefined) {
    cambios.can_approve_cotizacion = can_approve_cotizacion === true;
  }

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: 'No hay nada que cambiar' }, { status: 400 });
  }

  // select() al final: si RLS bloquea el update, PostgREST no devuelve filas y
  // el cambio se perderia en silencio. Aqui se nota.
  const { data, error } = await supabase
    .from('profiles')
    .update(cambios)
    .eq('id', userId)
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: 'El cambio no se aplico. Revisa que el patch de gestion de usuarios este corrido en Supabase.' },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true });
}
