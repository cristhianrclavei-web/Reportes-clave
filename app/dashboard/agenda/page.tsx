import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import AgendaList from './AgendaList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AgendaPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') redirect('/mis-reportes');

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

  return <AgendaList userName={profile?.full_name || user.email || ''} />;
}
