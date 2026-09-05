import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import ServiciosSupervisorList from './ServiciosSupervisorList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ServiciosSupervisorPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') redirect('/mis-reportes');

  return <ServiciosSupervisorList />;
}
