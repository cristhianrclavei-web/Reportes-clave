import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, hayClienteAdmin } from '@/lib/supabaseAdmin';

// Quién puede salir en «Atentamente» del PDF: las personas que aprueban
// cotizaciones (permiso can_approve_cotizacion), no quien la captura.
export type FirmanteSugerido = { nombre: string; correo: string };

// Solo en el servidor: el correo de cada cuenta vive en auth y la sesión
// normal no lo puede leer. Si la persona ya firmó cotizaciones con otro
// correo (p. ej. el de la empresa), se usa el último que escribió.
export async function cargarFirmantesCotizacion(supabase: SupabaseClient): Promise<FirmanteSugerido[]> {
  const { data: perfiles, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('can_approve_cotizacion', true)
    .neq('activo', false)
    .order('full_name');
  if (error || !perfiles) return [];

  const correoDeCuenta = new Map<string, string>();
  if (hayClienteAdmin()) {
    const { data } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users || []) correoDeCuenta.set(u.id, u.email || '');
  }

  const { data: usadas } = await supabase
    .from('cotizaciones')
    .select('firmante_nombre, firmante_correo')
    .not('firmante_correo', 'is', null)
    .order('created_at', { ascending: false })
    .limit(300);
  const ultimoCorreoPorNombre = new Map<string, string>();
  for (const c of usadas || []) {
    const nombre = (c.firmante_nombre || '').trim().toLowerCase();
    if (nombre && !ultimoCorreoPorNombre.has(nombre)) ultimoCorreoPorNombre.set(nombre, c.firmante_correo);
  }

  return perfiles
    .filter((p) => (p.full_name || '').trim())
    .map((p) => {
      const nombre = p.full_name.trim();
      const correo = ultimoCorreoPorNombre.get(nombre.toLowerCase()) || correoDeCuenta.get(p.id) || '';
      return { nombre, correo };
    });
}
