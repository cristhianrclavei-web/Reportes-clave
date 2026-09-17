import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import CotizacionesList from './CotizacionesList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CotizacionesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') redirect('/nuevo');

  const { data: myProfile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

  const { data: cotizaciones, error } = await supabase
    .from('cotizaciones')
    .select('*, profiles!cotizaciones_created_by_profiles_fkey(full_name)')
    .order('created_at', { ascending: false });

  return (
    <CotizacionesList
      cotizaciones={(cotizaciones as any) || []}
      userName={myProfile?.full_name || user.email || ''}
      correoUsuario={user.email || ''}
      errorCarga={error?.message || null}
    />
  );
}
