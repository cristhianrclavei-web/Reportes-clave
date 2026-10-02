import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import SolicitudesTecnico from './SolicitudesTecnico';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SolicitudesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  // El supervisor tiene las suyas (y la bandeja) en Panel → Personal.
  const { data: role } = await supabase.rpc('get_my_role');
  if (role === 'supervisor') redirect('/dashboard/personal');
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
  return <SolicitudesTecnico userName={profile?.full_name || user.email || ''} />;
}
