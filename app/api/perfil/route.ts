import { createClient } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

export async function PUT(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const body = await req.json();
    const { telefono, email } = body;

    // Solo actualizar teléfono y email del usuario autenticado
    // El nombre se edita SOLO desde el endpoint de admin

    // Actualizar teléfono en profiles
    if (telefono !== undefined) {
      if (typeof telefono !== 'string' || telefono.length > 20) {
        return NextResponse.json(
          { error: 'Teléfono inválido' },
          { status: 400 }
        );
      }

      const { error: errorTelefono } = await supabase
        .from('profiles')
        .update({ telefono })
        .eq('id', user.id);

      if (errorTelefono) {
        return NextResponse.json(
          { error: 'No se pudo actualizar teléfono' },
          { status: 500 }
        );
      }
    }

    // Actualizar email en auth.users
    if (email !== undefined) {
      if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        return NextResponse.json(
          { error: 'Correo inválido' },
          { status: 400 }
        );
      }

      const { error: errorEmail } = await supabase.auth.updateUser({ email });

      if (errorEmail) {
        return NextResponse.json(
          { error: 'No se pudo actualizar correo' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error en PUT /api/perfil:', err);
    return NextResponse.json(
      { error: 'Error interno' },
      { status: 500 }
    );
  }
}
