import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import CotizacionesList from './CotizacionesList';
import { cargarFirmantesCotizacion } from '@/lib/firmantesCotizacion';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CotizacionesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') redirect('/nuevo');
  // Sección fuera del plan de la empresa (lib/planes.ts).
  const { data: moduloActivo } = await supabase.rpc('modulo_activo', { p_modulo: 'cotizaciones' });
  if (moduloActivo === false) redirect('/dashboard');

  const { data: myProfile } = await supabase.from('profiles').select('full_name, can_approve_cotizacion').eq('id', user.id).single();

  const [{ data: cotizaciones, error }, firmantes] = await Promise.all([
    supabase
      .from('cotizaciones')
      .select('*, profiles!cotizaciones_created_by_profiles_fkey(full_name)')
      .order('created_at', { ascending: false }),
    cargarFirmantesCotizacion(supabase),
  ]);

  return (
    <CotizacionesList
      cotizaciones={(cotizaciones as any) || []}
      userName={myProfile?.full_name || user.email || ''}
      correoUsuario={user.email || ''}
      errorCarga={error?.message || null}
      firmantes={firmantes}
      puedeAprobar={Boolean(myProfile?.can_approve_cotizacion)}
    />
  );
}
