import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { createClient } from '@/lib/supabaseServer';
import { createAdminClient, hayClienteAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// RUTA TEMPORAL (2026-10-02): reduce las fotos de evidencia que ya estaban
// subidas a tamaño completo, igual que hoy se reducen al subirlas (lado
// mayor 1600 px, JPEG 82). Reemplaza el archivo en el mismo path, así que
// los reportes siguen apuntando a la misma foto. Autorizado por Cristhian
// sabiendo que los originales no se recuperan. Solo quien administra
// usuarios. Se borra al terminar.

const UMBRAL = 600 * 1024;

async function listarTodo(admin: ReturnType<typeof createAdminClient>, carpeta = ''): Promise<{ path: string; size: number }[]> {
  const out: { path: string; size: number }[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin.storage.from('evidencias').list(carpeta, { limit: 1000, offset });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const it of data) {
      const ruta = carpeta ? `${carpeta}/${it.name}` : it.name;
      if (it.id === null || !it.metadata) out.push(...(await listarTodo(admin, ruta)));
      else out.push({ path: ruta, size: Number((it.metadata as any).size || 0) });
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  const { data: gestor } = await supabase.rpc('puede_gestionar_usuarios');
  if (!gestor) return NextResponse.json({ error: 'Solo quien administra usuarios' }, { status: 403 });
  if (!hayClienteAdmin()) return NextResponse.json({ error: 'Sin llave de servicio' }, { status: 500 });

  const limite = Math.min(Number(request.nextUrl.searchParams.get('limite') || 15), 40);
  const soloContar = request.nextUrl.searchParams.get('contar') === '1';
  const admin = createAdminClient();
  const todos = await listarTodo(admin);
  const grandes = todos.filter((f) => f.size > UMBRAL && /\.(jpe?g|png|webp|heic|heif)$/i.test(f.path));
  const total = todos.reduce((s, f) => s + f.size, 0);
  if (soloContar) return NextResponse.json({ archivos: todos.length, totalMB: +(total / 1048576).toFixed(1), pendientes: grandes.length });

  let antes = 0, despues = 0, hechas = 0;
  const errores: string[] = [];
  for (const f of grandes.slice(0, limite)) {
    try {
      const { data: blob, error } = await admin.storage.from('evidencias').download(f.path);
      if (error || !blob) throw error || new Error('sin archivo');
      const original = Buffer.from(await blob.arrayBuffer());
      const reducida = await sharp(original).rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 }).toBuffer();
      if (reducida.length >= original.length) continue;
      const { error: eUp } = await admin.storage.from('evidencias').upload(f.path, reducida, { contentType: 'image/jpeg', upsert: true });
      if (eUp) throw eUp;
      antes += original.length; despues += reducida.length; hechas++;
    } catch (e: any) {
      errores.push(`${f.path}: ${e?.message || e}`);
    }
  }
  return NextResponse.json({
    hechas, quedan: Math.max(0, grandes.length - hechas - errores.length),
    ahorradoMB: +((antes - despues) / 1048576).toFixed(1), antesMB: +(antes / 1048576).toFixed(1), despuesMB: +(despues / 1048576).toFixed(1),
    errores,
  });
}
