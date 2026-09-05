import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import DashboardList from './DashboardList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') redirect('/nuevo');

  const { data: myProfile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

  const { data: reports } = await supabase
    .from('reports')
    .select('id, created_at, empresa_cliente, fecha, tipo_servicio, sub_tipo_servicio, data, created_by, profiles(full_name)')
    .order('created_at', { ascending: false });

  return <DashboardList reports={(reports as any) || []} userName={myProfile?.full_name || user.email || ''} />;
}
