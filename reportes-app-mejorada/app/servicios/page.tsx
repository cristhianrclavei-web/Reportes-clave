import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import MisServiciosList from './MisServiciosList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MisServiciosPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

  return <MisServiciosList userName={profile?.full_name || user.email || ''} />;
}
